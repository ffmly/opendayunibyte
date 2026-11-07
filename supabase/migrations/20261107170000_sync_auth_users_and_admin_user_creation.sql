-- Migration: 20261107170000_sync_auth_users_and_admin_user_creation.sql
-- Automatically sync any user added via Supabase Auth console / API to profiles and leaderboard,
-- and accurately award registration XP to attendees.

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer as $$
declare
  v_nickname text;
  v_email text;
begin
  v_email := lower(trim(coalesce(new.email, '')));

  -- Ignore guest / anonymous temporary tokens
  if v_email like '%@guest.unibyte.invalid' or v_email like '%@attendee.unibyte.invalid' then
    return new;
  end if;

  if not exists (select 1 from public.profiles where id = new.id::text) then
    v_nickname := coalesce(
      nullif(trim(new.raw_user_meta_data->>'nickname'), ''),
      nullif(split_part(v_email, '@', 1), ''),
      'User'
    );

    insert into public.profiles (id, nickname, nickname_key, email, total_xp, created_at, last_active_at, status)
    values (
      new.id::text,
      v_nickname,
      lower(v_nickname),
      nullif(v_email, ''),
      coalesce((new.raw_user_meta_data->>'totalXP')::int, 0),
      coalesce(new.created_at, now()),
      coalesce(new.last_sign_in_at, new.created_at, now()),
      'active'
    )
    on conflict (id) do update
      set email = coalesce(excluded.email, public.profiles.email),
          nickname = coalesce(public.profiles.nickname, excluded.nickname);
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Backfill any existing real auth users missing from profiles (e.g. unibyte@unibyte.com)
insert into public.profiles (id, nickname, nickname_key, email, total_xp, created_at, last_active_at, status)
select
  u.id::text,
  coalesce(
    nullif(trim(u.raw_user_meta_data->>'nickname'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'User'
  ),
  lower(coalesce(
    nullif(trim(u.raw_user_meta_data->>'nickname'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'User'
  )),
  u.email,
  coalesce((u.raw_user_meta_data->>'totalXP')::int, 0),
  coalesce(u.created_at, now()),
  coalesce(u.last_sign_in_at, u.created_at, now()),
  'active'
from auth.users u
where u.email is not null
  and u.email not like '%@guest.unibyte.invalid'
  and u.email not like '%@attendee.unibyte.invalid'
on conflict (id) do update
  set email = coalesce(excluded.email, public.profiles.email),
      status = 'active';

create or replace function public.register_attendee(
  p_user_id text,
  p_nickname text,
  p_email text
)
returns table(already_registered boolean, points integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_reward integer;
  v_normalized_email text;
  v_trimmed_nickname text;
  v_existing_profile record;
  v_already_awarded boolean := false;
begin
  v_normalized_email := lower(trim(p_email));
  if v_normalized_email is null or v_normalized_email = '' then
    raise exception 'invalid-email';
  end if;

  -- Prevent duplicate email usage across different participants
  if exists (
    select 1
      from public.profiles
     where id != p_user_id
       and lower(trim(coalesce(email, ''))) = v_normalized_email
  ) then
    raise exception 'email-already-used';
  end if;

  select * into v_existing_profile from public.profiles where id = p_user_id;

  if found then
    -- Check if this existing profile was already awarded registration XP or has accumulated XP
    if (v_existing_profile.total_xp > 0) or exists (
      select 1 from public.xp_events where user_id = p_user_id and type = 'REGISTRATION'
    ) or (v_existing_profile.email is not null and v_existing_profile.email not like '%@%.unibyte.invalid') then
      v_already_awarded := true;
    end if;
  end if;

  if v_already_awarded then
    -- Existing registered profile: update email and activity, do not award registration XP again
    update public.profiles
       set email = v_normalized_email,
           last_active_at = now()
     where id = p_user_id;
    return query select true, 0;
    return;
  end if;

  -- New participant registration (or first-time registration of uncompleted profile)
  v_trimmed_nickname := trim(p_nickname);
  if v_trimmed_nickname is null or v_trimmed_nickname = '' then
    raise exception 'invalid-nickname';
  end if;

  select registration into v_reward from public.reward_settings where id = 'rewards';
  v_reward := coalesce(v_reward, 50);

  insert into public.profiles (id, nickname, nickname_key, email, total_xp, created_at, last_active_at, status)
  values (p_user_id, v_trimmed_nickname, lower(v_trimmed_nickname), v_normalized_email, 0, now(), now(), 'active')
  on conflict (id) do update
    set nickname = excluded.nickname,
        nickname_key = excluded.nickname_key,
        email = excluded.email,
        status = 'active',
        last_active_at = now();

  perform public.award_xp(
    p_user_id,
    'REGISTRATION',
    'registration',
    v_reward,
    jsonb_build_object('nickname', v_trimmed_nickname)
  );

  return query select false, v_reward;
end;
$$;

revoke all on function public.register_attendee(text, text, text) from public, anon, authenticated;
grant execute on function public.register_attendee(text, text, text) to service_role;
