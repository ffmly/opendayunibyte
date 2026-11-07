-- Add email column to profiles for persistent reward notification
alter table public.profiles add column if not exists email text null;

-- Partial unique index ensuring non-null emails are case-insensitively unique across profiles
create unique index if not exists profiles_email_lower_idx on public.profiles (lower(trim(email))) where email is not null;

-- Drop obsolete 2-argument registration function
drop function if exists public.register_attendee(text, text);

-- Updated registration function requiring email for new attendees,
-- supporting completing existing profiles that lack an email,
-- and preventing duplicate email registration.
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
begin
  v_normalized_email := lower(trim(p_email));
  if v_normalized_email is null or v_normalized_email = '' then
    raise exception 'invalid-email';
  end if;

  -- Prevent duplicate email usage across participants
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
    -- Existing profile: update email, do not award registration XP again
    update public.profiles
       set email = v_normalized_email,
           last_active_at = now()
     where id = p_user_id;
    return query select true, 0;
    return;
  end if;

  -- New participant registration
  v_trimmed_nickname := trim(p_nickname);
  if v_trimmed_nickname is null or v_trimmed_nickname = '' then
    raise exception 'invalid-nickname';
  end if;

  select registration into v_reward from public.reward_settings where id = 'rewards';
  v_reward := coalesce(v_reward, 50);

  insert into public.profiles (id, nickname, nickname_key, email, total_xp, created_at, last_active_at)
  values (p_user_id, v_trimmed_nickname, lower(v_trimmed_nickname), v_normalized_email, 0, now(), now());

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
