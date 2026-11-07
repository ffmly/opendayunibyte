import { z } from "zod";
import type { Ctx } from "./common";
import { requireAuth, validate, ApiError } from "./common";
import { getSqlPool } from "./supabase-db";
import type { WorkshopAttendanceResult, WorkshopAttendee, WorkshopWithAttendance } from "@shared/models";

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

const topSchema = z.object({ top: z.number().int().min(1).max(1000).optional() });

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
  const { top = 100 } = validate(topSchema, data);
  const pool = getSqlPool();
  const entries = await pool.query(
    `select
       p.id as uid,
       p.nickname,
       coalesce(l.total_xp, p.total_xp, 0)::int as "totalXP",
       coalesce(l.updated_at, p.last_active_at, p.created_at) as "updatedAt"
     from public.profiles p
     left join public.leaderboard l on l.user_id = p.id
     where coalesce(p.status, 'active') != 'disabled'
     order by "totalXP" desc, "updatedAt" asc, p.id asc
     limit $1`,
    [top],
  );
  let myEntry: { uid: string; nickname: string; totalXP: number; updatedAt: unknown; rank?: number } | null = null;
  if (context.auth?.uid) {
    const mine = await pool.query(
      `select
         p.id as uid,
         p.nickname,
         coalesce(l.total_xp, p.total_xp, 0)::int as "totalXP",
         coalesce(l.updated_at, p.last_active_at, p.created_at) as "updatedAt"
       from public.profiles p
       left join public.leaderboard l on l.user_id = p.id
       where p.id = $1`,
      [context.auth.uid],
    );
    if (mine.rows[0]) {
      const myRow = mine.rows[0];
      const rankRes = await pool.query<{ rank: number }>(
        `select count(*)::int + 1 as rank
           from public.profiles
          where coalesce(status, 'active') != 'disabled'
            and (
              total_xp > $1
              or (total_xp = $1 and coalesce(last_active_at, created_at) < $2)
            )`,
        [myRow.totalXP, myRow.updatedAt],
      );
      myEntry = { ...myRow, rank: rankRes.rows[0]?.rank ?? 1 };
    }
  }
  const total = await pool.query(
    `select count(*)::int as count from public.profiles where coalesce(status, 'active') != 'disabled'`,
  );
  return { entries: entries.rows, myEntry, totalUsers: total.rows[0]?.count ?? entries.rows.length };
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
    `select
       p.id as uid,
       p.nickname,
       coalesce(l.total_xp, p.total_xp, 0)::int as "totalXP",
       coalesce(l.updated_at, p.last_active_at, p.created_at) as "updatedAt"
     from public.profiles p
     left join public.leaderboard l on l.user_id = p.id
     where coalesce(p.status, 'active') != 'disabled'
     order by "totalXP" desc, "updatedAt" asc, p.id asc
     limit $1`,
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
    `select
       coalesce(p.id, u.id::text) as uid,
       coalesce(p.nickname, nullif(split_part(coalesce(u.email, p.email, ''), '@', 1), ''), 'User') as nickname,
       coalesce(p.email, u.email) as email,
       coalesce(p.total_xp, 0)::int as "totalXP",
       coalesce(p.status, 'active') as status,
       coalesce(p.created_at, u.created_at) as "createdAt",
       coalesce(p.last_active_at, u.last_sign_in_at, p.created_at, u.created_at) as "lastActiveAt",
       coalesce(p.legacy_firebase, false) as "legacyFirebase"
     from public.profiles p
     full outer join auth.users u on u.id::text = p.id
     order by "totalXP" desc, "createdAt" desc nulls last
     limit 1000`,
  );
  return { users: result.rows };
}

export async function adminLeaderboards(_data: unknown, context: Ctx) {
  requireAdmin(context);
  const pool = getSqlPool();

  const [quizRes, allTimeRes, workshopsRes] = await Promise.all([
    pool.query(`
      with ans as (
        select
          user_id,
          coalesce(sum(points), 0)::int as quiz_points,
          count(case when correct then 1 end)::int as correct_answers,
          count(distinct session_id || ':' || round_number::text)::int as answered_rounds
        from public.quiz_answers
        group by user_id
      ),
      part as (
        select
          user_id,
          coalesce(sum(points), 0)::int as part_points,
          count(distinct session_id || ':' || coalesce(round_number::text, '0'))::int as joined_rounds
        from public.quiz_participants
        group by user_id
      )
      select
        p.id as "userId",
        p.nickname,
        p.email,
        greatest(coalesce(ans.quiz_points, 0), coalesce(part.part_points, 0))::int as "quizPoints",
        coalesce(ans.correct_answers, 0)::int as "correctAnswers",
        greatest(coalesce(part.joined_rounds, 0), coalesce(ans.answered_rounds, 0))::int as "roundsJoined"
      from public.profiles p
      left join ans on ans.user_id = p.id
      left join part on part.user_id = p.id
      where (ans.quiz_points is not null and ans.quiz_points > 0)
         or (part.part_points is not null and part.part_points > 0)
         or (ans.correct_answers is not null and ans.correct_answers > 0)
         or (part.joined_rounds is not null and part.joined_rounds > 0)
      order by "quizPoints" desc, "correctAnswers" desc, "roundsJoined" desc, p.nickname asc, p.id asc
      limit 200
    `),
    pool.query(`
      select
        p.id as "userId",
        p.nickname,
        p.email,
        coalesce(l.total_xp, p.total_xp, 0)::int as "totalXP"
      from public.profiles p
      left join public.leaderboard l on l.user_id = p.id
      order by "totalXP" desc, coalesce(l.updated_at, p.last_active_at) asc, p.id asc
      limit 200
    `),
    pool.query(`
      with ws as (
        select
          wc.user_id,
          count(distinct wc.workshop_id)::int as workshops_visited,
          coalesce(sum(wc.points), 0)::int as workshop_points
        from public.workshop_checkins wc
        group by wc.user_id
      )
      select
        p.id as "userId",
        p.nickname,
        p.email,
        coalesce(ws.workshops_visited, 0)::int as "workshopsVisited",
        coalesce(ws.workshop_points, 0)::int as "workshopPoints"
      from ws
      join public.profiles p on p.id = ws.user_id
      order by "workshopsVisited" desc, "workshopPoints" desc, p.nickname asc, p.id asc
      limit 200
    `),
  ]);

  return {
    quiz: quizRes.rows,
    allTime: allTimeRes.rows,
    workshops: workshopsRes.rows,
  };
}

export async function adminListWorkshops(_data: unknown, context: Ctx) {
  requireStaff(context);
  const result = await getSqlPool().query(
    `select w.id, w.code, w.title, w.location, w.summary, w.post_image_url as "postImageUrl", w.content_url as "contentUrl", w.xp, w.active,
            coalesce(c.attendance_count, 0)::int as "attendanceCount"
       from public.workshops w
       left join (
         select workshop_id, count(*)::int as attendance_count
         from public.workshop_checkins
         group by workshop_id
       ) c on c.workshop_id = w.id
      order by w.code asc`,
  );
  return { workshops: result.rows };
}

export async function adminWorkshopAttendance(_data: unknown, context: Ctx): Promise<WorkshopAttendanceResult> {
  requireStaff(context);
  const pool = getSqlPool();

  const workshopsRes = await pool.query<{
    id: string;
    code: string;
    title: string;
    location: string;
    summary: string;
    postImageUrl: string;
    contentUrl: string;
    xp: number;
    active: boolean;
    attendanceCount: number;
  }>(`
    select w.id, w.code, w.title, w.location, w.summary, w.post_image_url as "postImageUrl", w.content_url as "contentUrl", w.xp, w.active,
           coalesce(c.attendance_count, 0)::int as "attendanceCount"
      from public.workshops w
      left join (
        select workshop_id, count(*)::int as attendance_count
        from public.workshop_checkins
        group by workshop_id
      ) c on c.workshop_id = w.id
     order by "attendanceCount" desc, w.code asc
  `);

  const attendeesRes = await pool.query<{
    workshopId: string;
    userId: string;
    points: number;
    checkedInAt: string | Date;
    nickname: string;
    email: string | null;
  }>(`
    select wc.workshop_id as "workshopId",
           wc.user_id as "userId",
           wc.points,
           wc.created_at as "checkedInAt",
           coalesce(p.nickname, 'Attendee') as nickname,
           coalesce(p.email, u.email) as email
      from public.workshop_checkins wc
      left join public.profiles p on p.id = wc.user_id
      left join auth.users u on u.id::text = wc.user_id
     order by wc.created_at desc
  `);

  const attendeesByWorkshop = new Map<string, WorkshopAttendee[]>();
  const uniqueUsers = new Set<string>();

  for (const row of attendeesRes.rows) {
    uniqueUsers.add(row.userId);
    const list = attendeesByWorkshop.get(row.workshopId) ?? [];
    list.push({
      userId: row.userId,
      nickname: row.nickname,
      email: row.email,
      points: Number(row.points ?? 0),
      checkedInAt: typeof row.checkedInAt === "string" ? row.checkedInAt : new Date(row.checkedInAt).toISOString(),
    });
    attendeesByWorkshop.set(row.workshopId, list);
  }

  const workshops: WorkshopWithAttendance[] = workshopsRes.rows.map((w) => ({
    ...w,
    attendees: attendeesByWorkshop.get(w.id) ?? [],
  }));

  const totalCheckins = attendeesRes.rows.length;

  return {
    stats: {
      totalWorkshops: workshops.length,
      totalCheckins,
      uniqueAttendees: uniqueUsers.size,
    },
    workshops,
  };
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
