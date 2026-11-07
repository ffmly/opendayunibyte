import { db, now, requireAuth, validate, apiError } from "./common";
import type { Ctx } from "./common";
import { ApiError } from "./errors";
import {
  registerUserSchema,
  adminAdjustXpSchema,
  adminSetUserActiveSchema,
} from "@shared/schemas";
import { getSqlPool, getAdminClient } from "./supabase-db";
import { createHmac } from "node:crypto";

/**
 * registerUser — attendee registers or recovers their account using Nickname + Email.
 * - If the email exists with the matching nickname, their account and XP are seamlessly restored.
 * - If the email exists with a mismatched nickname, it rejects to prevent account collisions.
 * - If the email does not exist, a new attendee is registered and welcome XP is awarded.
 */
export async function registerUser(data: unknown, context: Ctx) {
  const uid = requireAuth(context);
  const { nickname, email } = validate(registerUserSchema, data);

  const nicknameTrimmed = nickname.trim();
  const emailNormalized = email.trim().toLowerCase();
  const pool = getSqlPool();

  // Check if a profile with this email already exists
  const existingRes = await pool.query<{
    id: string;
    nickname: string;
    email: string;
    total_xp: number;
  }>(
    `select id, nickname, email, total_xp
       from public.profiles
      where lower(trim(coalesce(email, ''))) = $1
      limit 1`,
    [emailNormalized],
  );

  const existing = existingRes.rows[0];

  if (existing) {
    // If the profile belongs to another uid (e.g. user cleared cookies or switched device)
    if (existing.id !== uid) {
      const storedNick = existing.nickname.trim().toLowerCase();
      const enteredNick = nicknameTrimmed.toLowerCase();
      if (storedNick !== enteredNick) {
        throw new ApiError(
          "already-exists",
          "This email address is registered under a different nickname. Please enter the same nickname or use a different email.",
        );
      }

      // Exact match on Nickname + Email: Recover account!
      const secret = process.env.SUPABASE_SECRET_KEY || "recovery-secret";
      const authEmail = `user-${existing.id}@attendee.unibyte.invalid`;
      const recoveryPassword = createHmac("sha256", secret)
        .update(`${existing.id}:${emailNormalized}`)
        .digest("base64url");

      const admin = getAdminClient();
      await admin.auth.admin.updateUserById(existing.id, {
        email: authEmail,
        password: recoveryPassword,
        email_confirm: true,
        user_metadata: { recovered_at: new Date().toISOString() },
      });

      // Cleanup temporary anonymous user if it was created
      if (uid && uid !== existing.id) {
        await admin.auth.admin.deleteUser(uid).catch(() => {});
      }

      return {
        recovered: true,
        alreadyRegistered: true,
        points: 0,
        authEmail,
        recoveryPassword,
        userId: existing.id,
        nickname: existing.nickname,
      };
    }

    // Already the same user session
    return {
      recovered: false,
      alreadyRegistered: true,
      points: 0,
      userId: existing.id,
      nickname: existing.nickname,
    };
  }

  // New participant registration
  try {
    const result = await pool.query(
      `select already_registered as "alreadyRegistered", points
         from public.register_attendee($1, $2, $3)`,
      [uid, nicknameTrimmed, emailNormalized],
    );
    const row = result.rows[0] ?? { points: 50, alreadyRegistered: false };

    return {
      recovered: false,
      alreadyRegistered: Boolean(row.alreadyRegistered),
      points: Number(row.points ?? 0),
    };
  } catch (err: unknown) {
    const message = (err as Error)?.message ?? "";
    if (message.includes("email-already-used")) {
      throw new ApiError("already-exists", "This email address is already registered.");
    }
    if (message.includes("invalid-email")) {
      throw new ApiError("invalid-argument", "A valid email address is required.");
    }
    throw err;
  }
}


export async function getMyProfile(_data: unknown, context: Ctx) {
  const uid = requireAuth(context);
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) apiError("not-found", "Profile not found");
  return { id: snap.id, ...snap.data() };
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
