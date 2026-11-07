import {
  db,
  requireAuth,
  validate,
  now,
  apiError,
  type Transaction,
} from "./common";
import type { Ctx } from "./common";
import { solveChallengeSchema, startChallengeSchema } from "@shared/schemas";
import { resolveQr, getRewards } from "./qr";
import { awardXp } from "./xp";

type ChallengeType = "PASSWORD" | "MYSTERY";

/**
 * startChallenge — user scans the PASSWORD or MYSTERY QR. Validates that the
 * scanned QR matches the expected gameKey and that the challenge is active;
 * returns which game to load. No XP granted here.
 */
export async function startChallenge(
  gameKey: ChallengeType,
  data: unknown,
  context: Ctx,
) {
  const uid = requireAuth(context);
  const { token } = validate(startChallengeSchema, data);

  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists) apiError("unauthenticated", "Register first");

  const { qr, target } = await resolveQr(token);
  if (qr.type !== gameKey) {
    apiError("invalid-argument", `Not a ${gameKey} QR`);
  }

  return {
    gameKey: qr.type,
    challengeId: qr.targetId,
    title: target.name ?? qr.type,
  };
}

/**
 * solveChallenge — validate a password/mystery answer server-side against the
 * configured challenge document, prevent duplicate rewards, award XP.
 */
export async function solveChallenge(
  gameKey: ChallengeType,
  data: unknown,
  context: Ctx,
) {
  const uid = requireAuth(context);
  const { answer, token } = validate(solveChallengeSchema, data);

  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists) apiError("unauthenticated", "Register first");

  // Participation is only possible through a valid QR scan: the token the
  // visitor scanned must exist, be active, and match this challenge type.
  const { qr } = await resolveQr(token);
  if (qr.type !== gameKey) {
    apiError("invalid-argument", `Not a ${gameKey} QR`);
  }

  // Single configured challenge per game: doc id is "main"
  const challengeRef = db
    .collection(gameKey === "PASSWORD" ? "passwordChallenges" : "mysteryChallenges")
    .doc("main");
  const challengeSnap = await challengeRef.get();
  if (!challengeSnap.exists) apiError("not-found", "Challenge not configured");
  const challenge = challengeSnap.data()!;
  if (challenge.active === false) {
    apiError("failed-precondition", "This challenge is closed.");
  }

  const solution = String(challenge.solution ?? "").toLowerCase().trim();
  const correct = answer.trim().toLowerCase() === solution;

  // Record the attempt (kept for analytics + anti-cheat auditing)
  await db
    .collection(
      gameKey === "PASSWORD" ? "passwordAttempts" : "mysteryAttempts",
    )
    .add({
      userId: uid,
      answerHash: hash(answer.trim().toLowerCase()),
      correct,
      createdAt: now(),
    });

  if (!correct) {
    return { solved: false, points: 0, correct: false };
  }

  const rewards = await getRewards();
  const points = gameKey === "PASSWORD" ? rewards.password : rewards.mystery;
  const type = gameKey === "PASSWORD" ? "PASSWORD" : "MYSTERY";

  // Duplicate protection: a claim doc per game
  const claimRef = db.collection("challengeClaims").doc(`${gameKey}_${uid}`);
  const existing = await claimRef.get();
  if (existing.exists) {
    return { solved: true, points: 0, correct: true, alreadySolved: true };
  }

  await db.runTransaction(async (tx: Transaction) => {
    const cur = await tx.get(claimRef);
    if (cur.exists) return;
    tx.set(claimRef, {
      gameKey,
      userId: uid,
      points,
      solvedAt: now(),
    });
  });

  const claimAfter = await claimRef.get();
  if (!claimAfter.exists) {
    return { solved: true, points: 0, correct: true, alreadySolved: true };
  }

  await awardXp({
    userId: uid,
    type,
    sourceId: gameKey,
    points,
    metadata: { solved: true },
  });

  return { solved: true, points, correct: true, alreadySolved: false };
}

function hash(s: string): string {
  // Lightweight non-crypto hash for analytics only (not used for validation)
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}
