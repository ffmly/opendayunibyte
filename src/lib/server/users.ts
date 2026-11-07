import { db, now, requireAuth, validate, apiError } from "./common";
import type { Ctx } from "./common";
import { ApiError } from "./errors";
import {
  registerUserSchema,
  adminAdjustXpSchema,
  adminSetUserActiveSchema,
} from "@shared/schemas";
import { getSqlPool } from "./supabase-db";

/**
 * registerUser — anonymous visitor picks a nickname.
 * Creates users/{uid}, grants the registration reward, seeds the leaderboard.
 */
export async function registerUser(data: unknown, context: Ctx) {
  const uid = requireAuth(context);
  const { nickname } = validate(registerUserSchema, data);

  const nicknameTrimmed = nickname.trim();
  const result = await getSqlPool().query(
    `select already_registered as "alreadyRegistered", points
       from public.register_attendee($1, $2)`,
    [uid, nicknameTrimmed],
  );
  return result.rows[0] ?? { points: 0, alreadyRegistered: true };
}

export async function getMyProfile(_data: unknown, context: Ctx) {
  const uid = requireAuth(context);
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) apiError("not-found", "Profile not found");
  return snap.data();
}

function requireRole(context: Ctx, roles: Array<"admin" | "staff">) {
  const role = context.authToken?.role;
  if (typeof role !== "string" || !roles.includes(role as "admin" | "staff")) {
    throw new ApiError("permission-denied", "Admins only.");
  }
}

/**
 * adjustUserXP — admin-only. Records an ADMIN_ADJUSTMENT ledger entry so
 * adjustments are never silent.
 */
export async function adjustUserXp(data: unknown, context: Ctx) {
  const adminUid = requireAuth(context);
  requireRole(context, ["admin"]);
  const input = validate(adminAdjustXpSchema, data);

  const userRef = db.collection("users").doc(input.userId);
  const userSnap = await userRef.get();
  if (!userSnap.exists) apiError("not-found", "User not found");
  const user = userSnap.data()!;
  const currentXp = (user.totalXP as number) ?? 0;
  const nextXp = Math.max(0, currentXp + input.points);

  const batch = db.batch();
  batch.update(userRef, { totalXP: nextXp, lastActiveAt: now() });
  batch.set(
    db.collection("leaderboard").doc(input.userId),
    { totalXP: nextXp, nickname: user.nickname ?? "unknown", updatedAt: now() },
    { merge: true },
  );
  batch.set(db.collection("xpEvents").doc(), {
    userId: input.userId,
    type: "ADMIN_ADJUSTMENT",
    sourceId: "manual",
    points: input.points,
    createdAt: now(),
    metadata: { adminId: adminUid, reason: input.reason },
  });
  await batch.commit();

  return { points: input.points, totalXP: nextXp };
}

export async function setUserActive(data: unknown, context: Ctx) {
  requireAuth(context);
  requireRole(context, ["admin"]);
  const input = validate(adminSetUserActiveSchema, data);
  await db.collection("users").doc(input.userId).update({
    status: input.active ? "active" : "disabled",
  });
  return { ok: true };
}
