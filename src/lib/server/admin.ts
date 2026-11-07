import { randomInt } from "crypto";
import { db, auth, requireAuth, validate, now, inSeconds, apiError } from "./common";
import type { Ctx } from "./common";
import { ApiError } from "./errors";
import {
  adminCreateQrSchema,
  adminToggleQrSchema,
  adminCreateQuizSessionSchema,
  adminQuizControlSchema,
  adminEndQuizSessionSchema,
  adminCreateQuizQuestionSchema,
  adminDeleteQuizQuestionSchema,
  adminCreateCatSchema,
  adminCreateWorkshopSchema,
  adminSetRoleSchema,
  adminUpdateRewardsSchema,
} from "@shared/schemas";
import { createQrCode, getRewards } from "./qr";
import {
  QUESTION_DURATION_SEC,
  ROUND_DURATION_SEC,
  ROUND_QUESTION_COUNT,
  timestampToMillis,
  shuffleQuizBank,
} from "@/lib/quiz/timing";

function requireAdmin(context: Ctx) {
  const role = context.authToken?.role;
  if (role !== "admin") {
    throw new ApiError("permission-denied", "Admins only.");
  }
}

function requireStaff(context: Ctx) {
  const role = context.authToken?.role;
  if (role !== "admin" && role !== "staff") {
    throw new ApiError("permission-denied", "Staff only.");
  }
}

/** adminCreateQRCode — generate a new QR for a cat/workshop/activity. */
export async function adminCreateQRCode(data: unknown, context: Ctx) {
  requireAuth(context);
  requireAdmin(context);
  const input = validate(adminCreateQrSchema, data);
  const qr = await createQrCode(input);
  return qr;
}

/** adminToggleQR — activate/deactivate an existing QR. */
export async function adminToggleQR(data: unknown, context: Ctx) {
  requireAuth(context);
  requireAdmin(context);
  const input = validate(adminToggleQrSchema, data);
  await db.collection("qrCodes").doc(input.qrId).update({ active: input.active });
  return { ok: true };
}

/** adminSetRole — assign an admin or staff custom claim + admins doc. */
export async function adminSetRole(data: unknown, context: Ctx) {
  requireAuth(context);
  requireAdmin(context);
  const input = validate(adminSetRoleSchema, data);
  await auth.setCustomUserClaims(input.uid, { role: input.role });
  await db.collection("admins").doc(input.uid).set({
    role: input.role,
    createdAt: now(),
  });
  return { ok: true };
}

/** adminCreateQuizSession — staff starts a new quiz round. */
export async function adminCreateQuizSession(data: unknown, context: Ctx) {
  requireAuth(context);
  requireStaff(context);
  const input = validate(adminCreateQuizSessionSchema, data);

  const active = await db
    .collection("quizSessions")
    .where("status", "in", ["waiting", "active", "question"])
    .get();
  const liveSessions = active.docs.filter((doc) => {
    const data = doc.data()!;
    if (data.continuous === true) return true;
    const endsAt = timestampToMillis(data.endsAt as import("@shared/models").TimestampLike | null | undefined);
    return !endsAt || endsAt > Date.now();
  });
  const expired = active.docs.filter((doc) => !liveSessions.includes(doc));
  await Promise.all(expired.map((doc) => doc.ref.update({ status: "ended" })));
  if (liveSessions.length > 0) apiError("already-exists", "A quiz round is already active.");

  const questions = await db
    .collection("quizQuestions")
    .where("active", "==", true)
    .orderBy("points", "desc")
    .get();

  const seenQuestions = new Set<string>();
  const pool = questions.docs
    .filter((doc) => {
      const normalized = String(doc.data()?.question ?? "").trim().toLocaleLowerCase();
      if (!normalized || seenQuestions.has(normalized)) return false;
      seenQuestions.add(normalized);
      return true;
    })
    .map((doc) => doc.id)
    .sort();
  if (pool.length < ROUND_QUESTION_COUNT) {
    apiError("failed-precondition", `At least ${ROUND_QUESTION_COUNT} active questions are required.`);
  }
  const shuffleSeed = randomInt(1, 2_147_483_647);
  const questionOrder = pool;
  const firstCycle = shuffleQuizBank(questionOrder, shuffleSeed, 0);
  const startedAt = now();

  const ref = db.collection("quizSessions").doc();
  await ref.set({
    activityId: "quiz",
    status: "question",
    currentQuestionIndex: 0,
    currentQuestionId: firstCycle[0],
    questionOrder,
    totalQuestions: ROUND_QUESTION_COUNT,
    questionsPerRound: ROUND_QUESTION_COUNT,
    bankSize: questionOrder.length,
    shuffleSeed,
    startedAt,
    endsAt: null,
    questionDurationSec: QUESTION_DURATION_SEC,
    roundDurationSec: ROUND_DURATION_SEC,
    continuous: true,
    stationId: input.stationId ?? null,
  });
  return {
    sessionId: ref.id,
    totalQuestions: ROUND_QUESTION_COUNT,
    bankSize: questionOrder.length,
  };
}

/** adminListQuizQuestions — return the full bank for the control panel. */
export async function adminListQuizQuestions(_data: unknown, context: Ctx) {
  requireAuth(context);
  requireStaff(context);
  const snapshot = await db.collection("quizQuestions").limit(1000).get();
  const questions = snapshot.docs
    .map((doc): Record<string, unknown> & { id: string } => ({ ...doc.data(), id: doc.id }))
    .sort((a, b) => String(a.question ?? "").localeCompare(String(b.question ?? "")));
  return { questions, count: questions.length };
}

/** adminCreateQuizQuestion — validate and add one active question. */
export async function adminCreateQuizQuestion(data: unknown, context: Ctx) {
  requireAuth(context);
  requireAdmin(context);
  const input = validate(adminCreateQuizQuestionSchema, data);
  const ref = db.collection("quizQuestions").doc();
  await ref.set({
    ...input,
    active: true,
    seconds: QUESTION_DURATION_SEC,
    createdAt: now(),
  });
  return { id: ref.id, ...input, active: true };
}

/** adminDeleteQuizQuestion — remove a question while no live quiz is running. */
export async function adminDeleteQuizQuestion(data: unknown, context: Ctx) {
  requireAuth(context);
  requireAdmin(context);
  const input = validate(adminDeleteQuizQuestionSchema, data);
  const active = await db
    .collection("quizSessions")
    .where("status", "in", ["waiting", "active", "question"])
    .limit(1)
    .get();
  if (!active.empty) {
    apiError("failed-precondition", "Stop the live quiz before deleting questions.");
  }
  const ref = db.collection("quizQuestions").doc(input.questionId);
  const snapshot = await ref.get();
  if (!snapshot.exists) apiError("not-found", "Question not found.");
  await ref.delete();
  return { ok: true };
}

/** adminSetQuizQuestion — advance to a question index (-1 = waiting, n = show). */
export async function adminSetQuizQuestion(data: unknown, context: Ctx) {
  requireAuth(context);
  requireStaff(context);
  const input = validate(adminQuizControlSchema, data);

  const ref = db.collection("quizSessions").doc(input.sessionId);
  const snap = await ref.get();
  if (!snap.exists) apiError("not-found", "Session not found");
  const session = snap.data()!;
  const order = (session.questionOrder as string[]) ?? [];

  if (input.index === undefined) {
    await ref.update({
      status: "waiting",
      currentQuestionIndex: -1,
      currentQuestionId: null,
    });
    return { ok: true, index: -1 };
  }

  if (input.index < 0 || input.index >= order.length) {
    apiError("invalid-argument", "Index out of range.");
  }
  const questionId = order[input.index]!;

  const qSnap = await db.collection("quizQuestions").doc(questionId).get();
  if (!qSnap.exists) apiError("not-found", "Question not found");
  const q = qSnap.data()!;

  await ref.update({
    status: "question",
    currentQuestionIndex: input.index,
    currentQuestionId: questionId,
    startedAt: now(),
    endsAt: inSeconds(Number(q.seconds ?? 20)),
  });
  return { ok: true, index: input.index };
}

/** adminEndQuizSession — finalize a quiz round. */
export async function adminEndQuizSession(data: unknown, context: Ctx) {
  requireAuth(context);
  requireStaff(context);
  const input = validate(adminEndQuizSessionSchema, data);
  await db.collection("quizSessions").doc(input.sessionId).update({
    status: "ended",
    endsAt: now(),
  });
  return { ok: true };
}

/** adminCreateCat — add a cat for the hunt. */
export async function adminCreateCat(data: unknown, context: Ctx) {
  requireAuth(context);
  requireAdmin(context);
  const input = validate(adminCreateCatSchema, data);
  const ref = db.collection("cats").doc();
  const rewards = await getRewards();
  const xp = input.xp ?? (input.rarity === "rare" ? rewards.rareCat : rewards.cat);
  await ref.set({
    number: input.number,
    code: input.code,
    name: input.name,
    rarity: input.rarity,
    xp,
    active: true,
  });
  // Auto-create its QR code
  const qr = await createQrCode({ type: "CAT", targetId: ref.id, label: input.name });
  return { catId: ref.id, qr };
}

/** adminCreateWorkshop — add a workshop + auto QR. */
export async function adminCreateWorkshop(data: unknown, context: Ctx) {
  requireAuth(context);
  requireAdmin(context);
  const input = validate(adminCreateWorkshopSchema, data);
  const ref = db.collection("workshops").doc();
  const rewards = await getRewards();
  const xp = input.xp ?? rewards.workshop;
  await ref.set({
    code: input.code,
    title: input.title,
    location: input.location ?? "",
    summary: input.summary ?? "",
    postImageUrl: input.postImageUrl ?? "",
    contentUrl: input.contentUrl ?? "",
    xp,
    active: true,
  });
  const qr = await createQrCode({
    type: "WORKSHOP",
    targetId: ref.id,
    label: input.title,
  });
  return { workshopId: ref.id, qr };
}

/** adminStats — dashboard counts (admin only). */
export async function adminStats(_data: unknown, context: Ctx) {
  requireAuth(context);
  requireAdmin(context);
  const [users, catsFound, workshops, quizParts] = await Promise.all([
    db.collection("users").count().get(),
    db.collection("catFinds").count().get(),
    db.collection("workshopCheckins").count().get(),
    db.collection("quizParticipants").count().get(),
  ]);
  return {
    totalUsers: users.data().count,
    catsFound: catsFound.data().count,
    workshopCheckins: workshops.data().count,
    quizParticipants: quizParts.data().count,
  };
}

/** adminUpdateRewards — overwrite the XP reward config (admin only). */
export async function adminUpdateRewards(data: unknown, context: Ctx) {
  requireAuth(context);
  requireAdmin(context);
  const input = validate(adminUpdateRewardsSchema, data);
  await db.collection("settings").doc("rewards").set(input.rewards, { merge: true });
  return { ok: true };
}
