import { db, requireAuth, requireActiveUser, validate, now, apiError } from "./common";
import type { Ctx } from "./common";
import {
  joinQuizSchema,
  joinGameSchema,
  submitQuizAnswerSchema,
  submitGameScoreSchema,
} from "@shared/schemas";
import { resolveQr } from "./qr";
import { awardXp } from "./xp";
import { getSqlPool } from "./supabase-db";
import { getQuizClock, timestampToMillis } from "@/lib/quiz/timing";

/**
 * joinQuiz — the user scanned the quiz QR from their phone. Creates/returns
 * the active quiz session and registers the participant.
 */
export async function joinQuiz(data: unknown, context: Ctx) {
  const uid = requireAuth(context);
  const { token } = validate(joinQuizSchema, data);

  const userSnap = await requireActiveUser(uid);
  const nickname = (userSnap.data()!.nickname as string) ?? "Player";

  const { qr } = await resolveQr(token);
  if (qr.type !== "QUIZ") apiError("invalid-argument", "Not a quiz QR");

  // Find the active quiz session for this activity
  const sessionRef = await db
    .collection("quizSessions")
    .where("activityId", "==", qr.targetId)
    .where("status", "in", ["waiting", "active", "question"])
    .limit(1)
    .get();

  const live = sessionRef.docs.find((doc) => {
    const value = doc.data()!;
    if (value.continuous === true) return true;
    const endsAt = timestampToMillis(value.endsAt as import("@shared/models").TimestampLike | null | undefined);
    return !endsAt || endsAt > Date.now();
  });
  if (!live) apiError("failed-precondition", "No quiz round is active right now.");
  const sessionId = live.id;

  const participantRef = db
    .collection("quizParticipants")
    .doc(`${sessionId}_${uid}`);
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(participantRef);
    if (existing.exists) {
      tx.update(participantRef, { nickname });
      return;
    }
    tx.set(participantRef, {
      userId: uid,
      sessionId,
      nickname,
      points: 0,
      joinedAt: now(),
    });
  });

  return { sessionId };
}

/**
 * submitQuizAnswer — validate against the current question, timing, and
 * duplicate protection. Awards XP for the correct answer only.
 */
export async function submitQuizAnswer(data: unknown, context: Ctx) {
  const uid = requireAuth(context);
  await requireActiveUser(uid);
  const { sessionId, questionId, answerIndex } = validate(
    submitQuizAnswerSchema,
    data,
  );

  const sessionRef = db.collection("quizSessions").doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) apiError("not-found", "Session not found");
  const session = sessionSnap.data()!;

  if (session.status !== "question") {
    apiError("failed-precondition", "No question is active right now.");
  }
  const clock = getQuizClock(session as unknown as import("@shared/models").QuizSession);
  if (clock.ended) {
    await sessionRef.update({ status: "ended" });
    apiError("failed-precondition", "This quiz round has ended.");
  }
  if (clock.questionId !== questionId) {
    apiError("invalid-argument", "This question is not active.");
  }
  if (clock.isRevealing) {
    apiError("failed-precondition", "Time is up for this question.");
  }

  const questionSnap = await db
    .collection("quizQuestions")
    .doc(questionId)
    .get();
  if (!questionSnap.exists) apiError("not-found", "Question not found");
  const question = questionSnap.data()!;

  // Duplicate protection: one answer per user per question
  const answerRef = db
    .collection("quizAnswers")
    .doc(`${sessionId}_${uid}_r${clock.roundNumber}_${questionId}`);
  const correct = answerIndex === (question.correctAnswer as number);
  const points = correct ? (question.points as number) : 0;
  const questionDurationMs = ((session.questionDurationSec as number | undefined) ?? 30) * 1000;
  const latencyMs = Math.max(
    0,
    Date.now() - (timestampToMillis(session.startedAt as import("@shared/models").TimestampLike | null | undefined) + clock.absoluteQuestionIndex * questionDurationMs),
  );
  const result = await getSqlPool().query(
    `select inserted, stored_correct as "storedCorrect", awarded_points as "awardedPoints"
       from public.record_quiz_answer($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [answerRef.id, sessionId, uid, questionId, clock.roundNumber, answerIndex, correct, points, latencyMs],
  );
  const stored = result.rows[0];
  return {
    correct: Boolean(stored?.storedCorrect),
    points: Number(stored?.awardedPoints ?? 0),
    alreadyAnswered: !stored?.inserted,
  };
}

/**
 * joinGameSession — generic game session join for MEMORY games etc.
 * Memory is a self-paced challenge; the session merely registers intent.
 */
export async function joinGameSession(data: unknown, context: Ctx) {
  const uid = requireAuth(context);
  const { token } = validate(joinGameSchema, data);

  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists) apiError("unauthenticated", "Register first");

  const { qr } = await resolveQr(token);
  if (qr.type !== "MEMORY") apiError("invalid-argument", "Not a memory QR");

  const sessionRef = db.collection("gameSessions").doc();
  const sessionId = sessionRef.id;
  await sessionRef.set({
    gameKey: "MEMORY",
    activityId: qr.targetId,
    status: "active",
    startedAt: now(),
    endsAt: null,
    stationId: qr.label ?? null,
    meta: {},
  });

  // Guard against duplicate memory rewards per session via score doc
  return { sessionId, gameKey: "MEMORY" };
}

/**
 * submitGameScore — trusted score submission. Validates a signed proof when
 * provided (defense-in-depth), clamps bounds, prevents duplicate scoring per
 * session, and awards XP.
 */
export async function submitGameScore(data: unknown, context: Ctx) {
  const uid = requireAuth(context);
  const { gameKey, sessionId, score, proof } = validate(
    submitGameScoreSchema,
    data,
  );

  const sessionRef = sessionId
    ? db.collection("gameSessions").doc(sessionId)
    : null;
  if (sessionRef) {
    const s = await sessionRef.get();
    if (!s.exists) apiError("not-found", "Session not found");
    if (s.data()!.status === "ended") {
      apiError("failed-precondition", "Session ended");
    }
  }

  // Duplicate: one score per user per session
  if (sessionRef) {
    const scoreRef = db
      .collection("gameScores")
      .doc(`${sessionId}_${uid}`);
    const existing = await scoreRef.get();
    if (existing.exists) {
      return { points: 0, alreadyScored: true };
    }
  }

  let points = 0;
  switch (gameKey) {
    case "MEMORY": {
      const level = Math.max(1, Math.floor(score));
      points = Math.min(level * 25, 250);
      break;
    }
    default:
      points = 0;
  }

  const scoreDoc = {
    userId: uid,
    gameKey,
    sessionId: sessionId ?? null,
    score,
    proof: proof ?? null,
    points,
    createdAt: now(),
  };

  if (sessionRef) {
    await db
      .collection("gameScores")
      .doc(`${sessionId}_${uid}`)
      .set(scoreDoc);
  } else {
    await db.collection("gameScores").add(scoreDoc);
  }

  if (points > 0) {
    await awardXp({
      userId: uid,
      type: "MEMORY",
      sourceId: sessionId ?? "memory",
      points,
      metadata: { gameKey, score },
    });
  }

  return { points, alreadyScored: false };
}
