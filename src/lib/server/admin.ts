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
  adminCleanupParticipantsSchema,
  adminCreateUserSchema,
} from "@shared/schemas";
import { getSqlPool, getAdminClient } from "./supabase-db";
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

/**
 * adminCleanupParticipants — safely delete all non-admin test accounts,
 * their activity, and auth entries while preserving all admin/staff accounts,
 * questions, workshops, QR codes, and event configurations.
 */
export async function adminCleanupParticipants(data: unknown, context: Ctx) {
  const currentAdminUid = requireAuth(context);
  requireAdmin(context);
  validate(adminCleanupParticipantsSchema, data);

  const pool = getSqlPool();
  const supabase = getAdminClient();

  // 1. Identify all admin and staff IDs to preserve
  const adminRows = await pool.query(`select user_id from public.admin_roles`);
  const preservedUids = new Set<string>(adminRows.rows.map((r) => r.user_id));
  preservedUids.add(currentAdminUid);
  const preservedArray = Array.from(preservedUids);

  // 2. Identify all participant profiles to delete
  const participantProfiles = await pool.query(
    `select id from public.profiles where not (id = any($1::text[]))`,
    [preservedArray],
  );
  const participantUidsToDelete = participantProfiles.rows.map((r) => r.id);

  // 3. Delete participant database records in a single transaction
  const client = await pool.connect();
  let deletedProfilesCount = 0;
  try {
    await client.query("begin");

    await client.query(
      `delete from public.quiz_answers where not (user_id = any($1::text[]))`,
      [preservedArray],
    );
    await client.query(
      `delete from public.quiz_participants where not (user_id = any($1::text[]))`,
      [preservedArray],
    );
    await client.query(
      `delete from public.workshop_checkins where not (user_id = any($1::text[]))`,
      [preservedArray],
    );
    await client.query(
      `delete from public.cat_finds where not (user_id = any($1::text[]))`,
      [preservedArray],
    );
    await client.query(
      `delete from public.game_scores where not (user_id = any($1::text[]))`,
      [preservedArray],
    );
    await client.query(
      `delete from public.password_attempts where not (user_id = any($1::text[]))`,
      [preservedArray],
    );
    await client.query(
      `delete from public.mystery_attempts where not (user_id = any($1::text[]))`,
      [preservedArray],
    );
    await client.query(
      `delete from public.challenge_claims where not (user_id = any($1::text[]))`,
      [preservedArray],
    );
    await client.query(
      `delete from public.xp_events where not (user_id = any($1::text[]))`,
      [preservedArray],
    );
    await client.query(
      `delete from public.leaderboard where not (user_id = any($1::text[]))`,
      [preservedArray],
    );

    const deleteProfilesResult = await client.query(
      `delete from public.profiles where not (id = any($1::text[]))`,
      [preservedArray],
    );
    deletedProfilesCount = deleteProfilesResult.rowCount ?? 0;

    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }

  // 4. Delete Supabase Auth users for participants
  let deletedAuthUsersCount = 0;
  const authUsersToDelete = new Set<string>(participantUidsToDelete);

  try {
    const listRes = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listRes.data?.users) {
      for (const u of listRes.data.users) {
        const role = u.app_metadata?.role;
        if (!preservedUids.has(u.id) && role !== "admin" && role !== "staff") {
          authUsersToDelete.add(u.id);
        }
      }
    }
  } catch {
    // Proceed with known participant profile auth users if listUsers fails
  }

  for (const uid of authUsersToDelete) {
    if (preservedUids.has(uid)) continue;
    try {
      const res = await supabase.auth.admin.deleteUser(uid);
      if (!res.error) {
        deletedAuthUsersCount++;
      }
    } catch {
      // Continue on individual failure
    }
  }

  return {
    ok: true,
    deletedProfiles: deletedProfilesCount,
    deletedAuthUsers: deletedAuthUsersCount,
    preservedAdmins: preservedUids.size,
  };
}

/**
 * adminCreateUser — admin creates a new attendee user account directly from the admin panel.
 * Creates both the auth user and profile, automatically entering them into the leaderboard.
 */
export async function adminCreateUser(data: unknown, context: Ctx) {
  requireAuth(context);
  requireAdmin(context);
  const input = validate(adminCreateUserSchema, data);

  const nicknameTrimmed = input.nickname.trim();
  const emailNormalized = input.email.trim().toLowerCase();
  const initialXp = input.totalXP ?? 50;

  const pool = getSqlPool();

  // Check if profile with email already exists
  const existing = await pool.query(
    `select id from public.profiles where lower(trim(coalesce(email, ''))) = $1 limit 1`,
    [emailNormalized],
  );
  if (existing.rows.length > 0) {
    throw new ApiError("already-exists", "A user with this email address already exists.");
  }

  // Create auth user
  const supabase = getAdminClient();
  const { data: createdAuth, error: authError } = await supabase.auth.admin.createUser({
    email: emailNormalized,
    email_confirm: true,
    user_metadata: { nickname: nicknameTrimmed, totalXP: initialXp },
  });

  if (authError || !createdAuth?.user) {
    throw new ApiError("internal", authError?.message ?? "Failed to create authentication user.");
  }

  const newUid = createdAuth.user.id;

  // Insert or update profile
  await pool.query(
    `insert into public.profiles (id, nickname, nickname_key, email, total_xp, created_at, last_active_at, status)
     values ($1, $2, lower($2), $3, $4, now(), now(), 'active')
     on conflict (id) do update
       set nickname = excluded.nickname,
           email = excluded.email,
           total_xp = excluded.total_xp,
           status = 'active'`,
    [newUid, nicknameTrimmed, emailNormalized, initialXp],
  );

  return {
    ok: true,
    user: {
      uid: newUid,
      nickname: nicknameTrimmed,
      email: emailNormalized,
      totalXP: initialXp,
      status: "active",
    },
  };
}
