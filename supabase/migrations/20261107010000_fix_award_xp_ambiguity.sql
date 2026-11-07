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
    select profile.nickname, profile.total_xp
      into v_nickname, v_total
      from public.profiles as profile
     where profile.id = p_user_id
       for update;
    return query select ''::text, 0, coalesce(v_total, 0);
    return;
  end if;

  update public.profiles as profile
     set total_xp = greatest(0, profile.total_xp + p_points),
         last_active_at = now()
   where profile.id = p_user_id
   returning profile.nickname, profile.total_xp into v_nickname, v_total;
  if not found then raise exception 'user_not_found'; end if;

  insert into public.leaderboard(user_id, nickname, total_xp, updated_at)
  values (p_user_id, v_nickname, v_total, now())
  on conflict (user_id) do update
    set nickname = excluded.nickname,
        total_xp = excluded.total_xp,
        updated_at = excluded.updated_at;

  insert into public.xp_events(id, user_id, type, source_id, points, metadata)
  values (p_event_id, p_user_id, p_type, p_source_id, p_points, coalesce(p_metadata, '{}'::jsonb));

  return query select p_event_id, p_points, v_total;
end;
$$;

revoke all on function public.award_xp(text,text,text,integer,jsonb,text) from public, anon, authenticated;
grant execute on function public.award_xp(text,text,text,integer,jsonb,text) to service_role;
