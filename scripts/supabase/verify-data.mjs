import nextEnv from "@next/env";
import pg from "pg";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing");

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const tableNames = [
  "profiles", "admin_roles", "activities", "cats", "workshops", "qr_codes",
  "xp_events", "leaderboard", "cat_finds", "workshop_checkins", "quiz_questions",
  "quiz_sessions", "quiz_participants", "quiz_answers", "game_sessions", "game_scores",
  "password_challenges", "mystery_challenges", "password_attempts", "mystery_attempts",
  "challenge_claims", "campaigns", "canva_giveaway_entries", "legacy_firebase_auth_users",
];

const counts = {};
for (const table of tableNames) {
  const result = await client.query(`select count(*)::int as count from public."${table}"`);
  counts[table] = result.rows[0].count;
}

const rls = await client.query(`
  select c.relname as table_name, c.relrowsecurity as rls_enabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by c.relname
`);

const integrity = await client.query(`
  select
    (select count(*) from public.xp_events x left join public.profiles p on p.id=x.user_id where p.id is null)::int as orphan_xp_events,
    (select count(*) from public.qr_codes q where q.type='WORKSHOP' and not exists(select 1 from public.workshops w where w.id=q.target_id))::int as orphan_workshop_qr,
    (select count(*) from public.qr_codes q where q.type='QUIZ' and not exists(select 1 from public.activities a where a.id=q.target_id))::int as orphan_quiz_qr,
    (select count(*) from public.quiz_participants qp left join public.profiles p on p.id=qp.user_id where p.id is null)::int as orphan_quiz_participants,
    (select count(*) from public.workshop_checkins wc left join public.workshops w on w.id=wc.workshop_id where w.id is null)::int as orphan_workshop_checkins
`);

const quiz = await client.query(`
  select
    (select count(*)::int from public.quiz_questions where active = true) as active_questions,
    (select count(*)::int from (
      select lower(trim(question)) from public.quiz_questions where active = true
      group by lower(trim(question)) having count(*) > 1
    ) duplicates) as duplicate_active_questions,
    (select count(*)::int from public.quiz_sessions where status in ('waiting','active','question')) as live_sessions
`);

const browserGrants = await client.query(`
  select count(*)::int as direct_table_grants
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated')
`);

console.log(JSON.stringify({
  counts,
  rls: rls.rows,
  integrity: integrity.rows[0],
  quiz: quiz.rows[0],
  security: browserGrants.rows[0],
}, null, 2));
await client.end();
