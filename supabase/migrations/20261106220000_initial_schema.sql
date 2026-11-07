create extension if not exists pgcrypto;

create table public.profiles (
  id text primary key,
  nickname text not null,
  nickname_key text not null,
  total_xp integer not null default 0 check (total_xp >= 0),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  legacy_firebase boolean not null default false
);
create unique index profiles_nickname_key_idx on public.profiles (nickname_key);
create index profiles_total_xp_idx on public.profiles (total_xp desc, created_at asc);

create table public.admin_roles (
  user_id text primary key,
  role text not null check (role in ('admin', 'staff')),
  created_at timestamptz not null default now(),
  legacy_firebase boolean not null default false
);

create table public.activities (
  id text primary key,
  name text not null,
  description text not null default '',
  points integer not null default 0 check (points >= 0),
  active boolean not null default true
);

create table public.cats (
  id text primary key,
  number integer not null,
  code text not null,
  name text not null,
  rarity text not null default 'normal' check (rarity in ('normal', 'rare')),
  xp integer not null default 0 check (xp >= 0),
  active boolean not null default true,
  unique (number),
  unique (code)
);

create table public.workshops (
  id text primary key,
  code text not null,
  title text not null,
  location text not null default '',
  summary text not null default '',
  post_image_url text not null default '',
  content_url text not null default '',
  xp integer not null default 0 check (xp >= 0),
  active boolean not null default true,
  start_at timestamptz,
  end_at timestamptz,
  unique (code)
);

create table public.qr_codes (
  token text primary key,
  type text not null check (type in ('ENTRY','GAME','QUIZ','MEMORY','PASSWORD','MYSTERY','CAT','WORKSHOP','ACTIVITY')),
  target_id text not null,
  label text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index qr_codes_type_active_idx on public.qr_codes (type, active);
create index qr_codes_created_at_idx on public.qr_codes (created_at desc);

create table public.reward_settings (
  id text primary key default 'rewards' check (id = 'rewards'),
  registration integer not null default 50 check (registration >= 0),
  workshop integer not null default 100 check (workshop >= 0),
  cat integer not null default 100 check (cat >= 0),
  rare_cat integer not null default 250 check (rare_cat >= 0),
  password integer not null default 500 check (password >= 0),
  mystery integer not null default 500 check (mystery >= 0),
  quiz_correct integer not null default 100 check (quiz_correct >= 0),
  memory_base integer not null default 75 check (memory_base >= 0),
  updated_at timestamptz not null default now()
);
insert into public.reward_settings (id) values ('rewards') on conflict do nothing;

create table public.xp_events (
  id text primary key default gen_random_uuid()::text,
  user_id text not null references public.profiles(id) on delete cascade,
  type text not null,
  source_id text not null,
  points integer not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index xp_events_user_created_idx on public.xp_events (user_id, created_at desc);

create table public.leaderboard (
  user_id text primary key references public.profiles(id) on delete cascade,
  nickname text not null,
  total_xp integer not null default 0 check (total_xp >= 0),
  updated_at timestamptz not null default now()
);
create index leaderboard_rank_idx on public.leaderboard (total_xp desc, updated_at asc);

create table public.cat_finds (
  id text primary key,
  user_id text not null references public.profiles(id) on delete cascade,
  cat_id text not null references public.cats(id) on delete cascade,
  cat_number integer,
  points integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, cat_id)
);

create table public.workshop_checkins (
  id text primary key,
  user_id text not null references public.profiles(id) on delete cascade,
  workshop_id text not null references public.workshops(id) on delete cascade,
  points integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, workshop_id)
);
create index workshop_checkins_workshop_idx on public.workshop_checkins (workshop_id, created_at desc);

create table public.quiz_questions (
  id text primary key,
  question text not null,
  options text[] not null check (cardinality(options) = 4),
  correct_answer smallint not null check (correct_answer between 0 and 3),
  points integer not null default 100 check (points > 0),
  active boolean not null default true,
  seconds integer not null default 30 check (seconds between 5 and 300),
  category text,
  bank_version integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quiz_questions_active_idx on public.quiz_questions (active, points desc);
create index quiz_questions_category_idx on public.quiz_questions (category);

create table public.quiz_sessions (
  id text primary key,
  activity_id text not null default 'quiz',
  status text not null check (status in ('waiting','active','question','ended')),
  current_question_index integer not null default 0,
  current_question_id text references public.quiz_questions(id) on delete set null,
  question_order text[] not null default '{}',
  total_questions integer not null default 10,
  questions_per_round integer,
  bank_size integer,
  shuffle_seed integer,
  started_at timestamptz,
  ends_at timestamptz,
  question_duration_sec integer not null default 30,
  round_duration_sec integer not null default 300,
  continuous boolean not null default true,
  station_id text
);
create index quiz_sessions_live_idx on public.quiz_sessions (status, started_at desc);

create table public.quiz_participants (
  id text primary key,
  session_id text not null references public.quiz_sessions(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade,
  nickname text not null,
  points integer not null default 0,
  round_number integer,
  round_points integer not null default 0,
  joined_at timestamptz not null default now(),
  unique (session_id, user_id)
);
create index quiz_participants_round_rank_idx on public.quiz_participants (session_id, round_number, round_points desc, joined_at asc);

create table public.quiz_answers (
  id text primary key,
  session_id text not null references public.quiz_sessions(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade,
  question_id text not null references public.quiz_questions(id) on delete cascade,
  round_number integer not null,
  answer_index smallint not null check (answer_index between 0 and 3),
  correct boolean not null,
  points integer not null default 0,
  latency_ms integer not null default 0 check (latency_ms >= 0),
  created_at timestamptz not null default now(),
  unique (session_id, user_id, round_number, question_id)
);

create table public.game_sessions (
  id text primary key,
  game_key text not null,
  activity_id text,
  status text not null check (status in ('waiting','active','ended')),
  started_at timestamptz,
  ends_at timestamptz,
  station_id text,
  meta jsonb not null default '{}'::jsonb
);

create table public.game_scores (
  id text primary key,
  user_id text not null references public.profiles(id) on delete cascade,
  game_key text not null,
  session_id text,
  score double precision not null,
  proof text,
  points integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index game_scores_session_user_idx on public.game_scores (session_id, user_id) where session_id is not null;

create table public.password_challenges (
  id text primary key,
  name text not null,
  solution text not null,
  active boolean not null default true
);
create table public.mystery_challenges (
  id text primary key,
  name text not null,
  solution text not null,
  active boolean not null default true
);
create table public.password_attempts (
  id text primary key,
  user_id text not null references public.profiles(id) on delete cascade,
  answer_hash text not null,
  correct boolean not null,
  created_at timestamptz not null default now()
);
create table public.mystery_attempts (
  id text primary key,
  user_id text not null references public.profiles(id) on delete cascade,
  answer_hash text not null,
  correct boolean not null,
  created_at timestamptz not null default now()
);
create table public.challenge_claims (
  id text primary key,
  game_key text not null,
  user_id text not null references public.profiles(id) on delete cascade,
  points integer not null default 0,
  solved_at timestamptz not null default now(),
  unique (game_key, user_id)
);

create table public.campaigns (
  id text primary key,
  claimed integer not null default 0,
  "limit" integer not null default 15 check ("limit" >= 0),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
create table public.canva_giveaway_entries (
  id text primary key,
  campaign_id text not null references public.campaigns(id) on delete cascade,
  full_name text not null,
  email text not null,
  study_year text,
  heard_about_unibyte text,
  will_attend text,
  discovery_source text,
  interest text,
  preferred_activity text,
  quiz_answers jsonb not null default '[]'::jsonb,
  score integer not null default 0,
  winner boolean not null default false,
  rank integer,
  activated boolean not null default false,
  submitted_at timestamptz not null default now()
);
create unique index canva_giveaway_email_campaign_idx on public.canva_giveaway_entries (campaign_id, lower(email));

create or replace function public.award_xp(
  p_user_id text,
  p_type text,
  p_source_id text,
  p_points integer,
  p_metadata jsonb default '{}'::jsonb,
  p_event_id text default gen_random_uuid()::text
) returns table(event_id text, points integer, total_xp integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_nickname text;
  v_total integer;
begin
  if p_points = 0 then
    select p.nickname, p.total_xp into v_nickname, v_total from public.profiles p where p.id = p_user_id for update;
    return query select ''::text, 0, coalesce(v_total, 0);
    return;
  end if;

  update public.profiles as profile
     set total_xp = greatest(0, profile.total_xp + p_points), last_active_at = now()
   where profile.id = p_user_id
   returning profile.nickname, profile.total_xp into v_nickname, v_total;
  if not found then raise exception 'user_not_found'; end if;

  insert into public.leaderboard(user_id, nickname, total_xp, updated_at)
  values (p_user_id, v_nickname, v_total, now())
  on conflict (user_id) do update
    set nickname = excluded.nickname, total_xp = excluded.total_xp, updated_at = excluded.updated_at;

  insert into public.xp_events(id, user_id, type, source_id, points, metadata)
  values (p_event_id, p_user_id, p_type, p_source_id, p_points, coalesce(p_metadata, '{}'::jsonb));

  return query select p_event_id, p_points, v_total;
end;
$$;

create or replace function public.register_attendee(p_user_id text, p_nickname text)
returns table(already_registered boolean, points integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_reward integer;
begin
  if exists(select 1 from public.profiles where id = p_user_id) then
    return query select true, 0;
    return;
  end if;
  select registration into v_reward from public.reward_settings where id = 'rewards';
  v_reward := coalesce(v_reward, 50);
  insert into public.profiles(id, nickname, nickname_key, total_xp)
  values (p_user_id, trim(p_nickname), lower(trim(p_nickname)), 0);
  perform public.award_xp(p_user_id, 'REGISTRATION', 'registration', v_reward, jsonb_build_object('nickname', trim(p_nickname)));
  return query select false, v_reward;
end;
$$;

create or replace function public.claim_workshop(p_user_id text, p_workshop_id text)
returns table(already_checked_in boolean, points integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_points integer;
  v_id text := p_user_id || '_' || p_workshop_id;
begin
  select workshop into v_points from public.reward_settings where id = 'rewards';
  v_points := coalesce(v_points, 100);
  insert into public.workshop_checkins(id, user_id, workshop_id, points)
  values (v_id, p_user_id, p_workshop_id, v_points)
  on conflict (user_id, workshop_id) do nothing;
  if not found then
    return query select true, v_points;
    return;
  end if;
  perform public.award_xp(p_user_id, 'WORKSHOP', p_workshop_id, v_points, '{}'::jsonb);
  return query select false, v_points;
end;
$$;

create or replace function public.claim_cat(p_user_id text, p_cat_id text)
returns table(already_found boolean, points integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_points integer;
  v_number integer;
  v_rarity text;
  v_id text := p_user_id || '_' || p_cat_id;
begin
  select c.number, c.rarity,
         case when c.rarity = 'rare' then r.rare_cat else r.cat end
    into v_number, v_rarity, v_points
    from public.cats c cross join public.reward_settings r
   where c.id = p_cat_id and r.id = 'rewards';
  if v_number is null then raise exception 'cat_not_found'; end if;
  insert into public.cat_finds(id, user_id, cat_id, cat_number, points)
  values (v_id, p_user_id, p_cat_id, v_number, v_points)
  on conflict (user_id, cat_id) do nothing;
  if not found then
    return query select true, v_points;
    return;
  end if;
  perform public.award_xp(p_user_id, 'CAT', p_cat_id, v_points, jsonb_build_object('catNumber', v_number, 'rarity', v_rarity));
  return query select false, v_points;
end;
$$;

create or replace function public.record_quiz_answer(
  p_id text,
  p_session_id text,
  p_user_id text,
  p_question_id text,
  p_round_number integer,
  p_answer_index integer,
  p_correct boolean,
  p_points integer,
  p_latency_ms integer
) returns table(inserted boolean, stored_correct boolean, awarded_points integer)
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.quiz_answers(id, session_id, user_id, question_id, round_number, answer_index, correct, points, latency_ms)
  values (p_id, p_session_id, p_user_id, p_question_id, p_round_number, p_answer_index, p_correct, p_points, p_latency_ms)
  on conflict (session_id, user_id, round_number, question_id) do nothing;
  if not found then
    return query select false, qa.correct, 0 from public.quiz_answers qa
      where qa.session_id = p_session_id and qa.user_id = p_user_id
        and qa.round_number = p_round_number and qa.question_id = p_question_id;
    return;
  end if;
  update public.quiz_participants
     set points = public.quiz_participants.points + p_points,
         round_points = case when round_number = p_round_number then round_points + p_points else p_points end,
         round_number = p_round_number
   where session_id = p_session_id and user_id = p_user_id;
  if not found then raise exception 'participant_not_found'; end if;
  if p_points > 0 then
    perform public.award_xp(p_user_id, 'QUIZ', p_session_id || '_r' || p_round_number || '_' || p_question_id, p_points, jsonb_build_object('sessionId', p_session_id, 'correct', true));
  end if;
  return query select true, p_correct, p_points;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','admin_roles','activities','cats','workshops','qr_codes','reward_settings',
    'xp_events','leaderboard','cat_finds','workshop_checkins','quiz_questions','quiz_sessions',
    'quiz_participants','quiz_answers','game_sessions','game_scores','password_challenges',
    'mystery_challenges','password_attempts','mystery_attempts','challenge_claims','campaigns',
    'canva_giveaway_entries'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

revoke all on all tables in schema public from anon, authenticated;
revoke all on function public.award_xp(text,text,text,integer,jsonb,text) from public, anon, authenticated;
revoke all on function public.register_attendee(text,text) from public, anon, authenticated;
revoke all on function public.claim_workshop(text,text) from public, anon, authenticated;
revoke all on function public.claim_cat(text,text) from public, anon, authenticated;
revoke all on function public.record_quiz_answer(text,text,text,text,integer,integer,boolean,integer,integer) from public, anon, authenticated;
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;
