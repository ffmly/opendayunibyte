import { z } from "zod";
import type { Ctx } from "./common";
import { requireAuth, validate, ApiError } from "./common";
import { getSqlPool } from "./supabase-db";

function requireStaff(context: Ctx): void {
  const role = context.authToken?.role;
  if (role !== "admin" && role !== "staff") {
    throw new ApiError("permission-denied", "Staff only.");
  }
}

function requireAdmin(context: Ctx): void {
  if (context.authToken?.role !== "admin") {
    throw new ApiError("permission-denied", "Admins only.");
  }
}

const topSchema = z.object({ top: z.number().int().min(1).max(200).optional() });

export async function getActivityHistory(data: unknown, context: Ctx) {
  const uid = requireAuth(context);
  const input = validate(z.object({ count: z.number().int().min(1).max(100).optional() }), data);
  const result = await getSqlPool().query(
    `select id, type, source_id as "sourceId", points, metadata, created_at as "createdAt"
       from public.xp_events where user_id = $1 order by created_at desc limit $2`,
    [uid, input.count ?? 30],
  );
  return { events: result.rows };
}

export async function getCatsData(_data: unknown, context: Ctx) {
  const uid = requireAuth(context);
  const [cats, found] = await Promise.all([
    getSqlPool().query(`select id, number, code, name, rarity, xp, active from public.cats order by number asc`),
    getSqlPool().query(`select cat_id as "catId" from public.cat_finds where user_id = $1`, [uid]),
  ]);
  return { cats: cats.rows, found: found.rows.map((row) => row.catId) };
}

export async function getWorkshopsData(_data: unknown, context: Ctx) {
  const uid = requireAuth(context);
  const [workshops, checkins] = await Promise.all([
    getSqlPool().query(`select id, code, title, location, summary, post_image_url as "postImageUrl", content_url as "contentUrl", xp, active, start_at as "startAt", end_at as "endAt" from public.workshops order by code asc`),
    getSqlPool().query(`select workshop_id as "workshopId" from public.workshop_checkins where user_id = $1`, [uid]),
  ]);
  return { workshops: workshops.rows, checkedIn: checkins.rows.map((row) => row.workshopId) };
}

export async function getLeaderboard(data: unknown, context: Ctx) {
  const { top = 50 } = validate(topSchema, data);
  const entries = await getSqlPool().query(
    `select user_id as uid, nickname, total_xp as "totalXP", updated_at as "updatedAt"
       from public.leaderboard order by total_xp desc, updated_at asc limit $1`,
    [top],
  );
  let myEntry = null;
  if (context.auth?.uid) {
    const mine = await getSqlPool().query(
      `select user_id as uid, nickname, total_xp as "totalXP", updated_at as "updatedAt" from public.leaderboard where user_id = $1`,
      [context.auth.uid],
    );
    myEntry = mine.rows[0] ?? null;
  }
  return { entries: entries.rows, myEntry };
}

export async function getWorkshop(data: unknown) {
  const { id } = validate(z.object({ id: z.string().min(1).max(160) }), data);
  const result = await getSqlPool().query(
    `select id, code, title, location, summary, post_image_url as "postImageUrl", content_url as "contentUrl", xp, active, start_at as "startAt", end_at as "endAt" from public.workshops where id = $1`,
    [id],
  );
  if (!result.rows[0]) throw new ApiError("not-found", "Workshop not found.");
  return result.rows[0];
}

export async function listStationQrs() {
  const result = await getSqlPool().query(
    `select token as id, token, type, target_id as "targetId", label, active, created_at as "createdAt"
       from public.qr_codes where type in ('QUIZ','WORKSHOP') order by created_at desc limit 50`,
  );
  return { qrs: result.rows };
}

export async function getQuizLiveState(data: unknown) {
  const { participantLimit = 200, leaderboardLimit = 3 } = validate(z.object({
    participantLimit: z.number().int().min(1).max(500).optional(),
    leaderboardLimit: z.number().int().min(1).max(20).optional(),
  }), data);
  const sessions = await getSqlPool().query(
    `select id, activity_id as "activityId", status, current_question_index as "currentQuestionIndex",
            current_question_id as "currentQuestionId", question_order as "questionOrder", total_questions as "totalQuestions",
            questions_per_round as "questionsPerRound", bank_size as "bankSize", shuffle_seed as "shuffleSeed",
            started_at as "startedAt", ends_at as "endsAt", question_duration_sec as "questionDurationSec",
            round_duration_sec as "roundDurationSec", continuous, station_id as "stationId"
       from public.quiz_sessions order by started_at desc nulls last limit 20`,
  );
  const session = sessions.rows.find((item) => item.status !== "ended") ?? null;
  let participants = [];
  if (session) {
    const result = await getSqlPool().query(
      `select user_id as "userId", nickname, points, round_number as "roundNumber", round_points as "roundPoints", joined_at as "joinedAt"
         from public.quiz_participants where session_id = $1
         order by round_points desc, joined_at asc limit $2`,
      [session.id, participantLimit],
    );
    participants = result.rows;
  }
  const allTime = await getSqlPool().query(
    `select user_id as uid, nickname, total_xp as "totalXP", updated_at as "updatedAt"
       from public.leaderboard order by total_xp desc, updated_at asc limit $1`,
    [leaderboardLimit],
  );
  return { session, participants, allTime: allTime.rows };
}

export async function getQuizParticipantState(data: unknown, context: Ctx) {
  const uid = requireAuth(context);
  const { sessionId } = validate(z.object({ sessionId: z.string().min(1).max(160) }), data);
  const result = await getSqlPool().query(
    `select user_id as "userId", nickname, points, round_number as "roundNumber", round_points as "roundPoints", joined_at as "joinedAt"
       from public.quiz_participants where session_id = $1 and user_id = $2`,
    [sessionId, uid],
  );
  return { participant: result.rows[0] ?? null };
}

export async function adminDashboardData(_data: unknown, context: Ctx) {
  requireAdmin(context);
  const result = await getSqlPool().query(`
    select
      (select count(*)::int from public.profiles where legacy_firebase = false) as "totalUsers",
      (select count(*)::int from public.cat_finds) as "catsFound",
      (select count(*)::int from public.workshop_checkins) as "workshopCheckins",
      (select count(*)::int from public.quiz_participants) as "quizParticipants"
  `);
  const leaderboard = await getSqlPool().query(
    `select user_id as uid, nickname, total_xp as "totalXP" from public.leaderboard order by total_xp desc, updated_at asc limit 10`,
  );
  return { stats: result.rows[0], leaderboard: leaderboard.rows };
}

export async function adminListQrs(_data: unknown, context: Ctx) {
  requireStaff(context);
  const result = await getSqlPool().query(
    `select token as id, token, type, target_id as "targetId", label, active, created_at as "createdAt" from public.qr_codes order by created_at desc limit 200`,
  );
  return { qrs: result.rows };
}

export async function adminListUsers(_data: unknown, context: Ctx) {
  requireAdmin(context);
  const result = await getSqlPool().query(
    `select id as uid, nickname, total_xp as "totalXP", status, created_at as "createdAt", last_active_at as "lastActiveAt", legacy_firebase as "legacyFirebase"
       from public.profiles order by total_xp desc, created_at asc limit 500`,
  );
  return { users: result.rows };
}

export async function adminListWorkshops(_data: unknown, context: Ctx) {
  requireStaff(context);
  const result = await getSqlPool().query(
    `select id, code, title, location, summary, post_image_url as "postImageUrl", content_url as "contentUrl", xp, active from public.workshops order by title asc`,
  );
  return { workshops: result.rows };
}

export async function adminGetSettings(_data: unknown, context: Ctx) {
  requireAdmin(context);
  const result = await getSqlPool().query(
    `select registration, workshop, cat, rare_cat as "rareCat", password, mystery, quiz_correct as "quizCorrect", memory_base as "memoryBase" from public.reward_settings where id = 'rewards'`,
  );
  return { rewards: result.rows[0] };
}

export async function adminQuizState(_data: unknown, context: Ctx) {
  requireStaff(context);
  const sessions = await getSqlPool().query(
    `select id, activity_id as "activityId", status, current_question_index as "currentQuestionIndex", current_question_id as "currentQuestionId",
            question_order as "questionOrder", total_questions as "totalQuestions", questions_per_round as "questionsPerRound",
            bank_size as "bankSize", shuffle_seed as "shuffleSeed", started_at as "startedAt", ends_at as "endsAt",
            question_duration_sec as "questionDurationSec", round_duration_sec as "roundDurationSec", continuous, station_id as "stationId"
       from public.quiz_sessions order by started_at desc nulls last limit 20`,
  );
  return { sessions: sessions.rows };
}
