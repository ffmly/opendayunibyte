-- Migration: 20261107160000_auto_sync_leaderboard_and_show_all.sql
-- Keep public.leaderboard automatically in sync with public.profiles at all times.

create or replace function public.sync_profile_to_leaderboard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    delete from public.leaderboard where user_id = old.id;
    return old;
  end if;

  if coalesce(new.status, 'active') = 'disabled' then
    delete from public.leaderboard where user_id = new.id;
  else
    insert into public.leaderboard (user_id, nickname, total_xp, updated_at)
    values (
      new.id,
      new.nickname,
      coalesce(new.total_xp, 0),
      coalesce(new.last_active_at, new.created_at, now())
    )
    on conflict (user_id) do update
      set nickname = excluded.nickname,
          total_xp = excluded.total_xp,
          updated_at = excluded.updated_at;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_profile_leaderboard on public.profiles;
create trigger trg_sync_profile_leaderboard
after insert or update of nickname, total_xp, last_active_at, status or delete
on public.profiles
for each row
execute function public.sync_profile_to_leaderboard();

-- Backfill all active profiles into leaderboard
insert into public.leaderboard (user_id, nickname, total_xp, updated_at)
select
  p.id,
  p.nickname,
  coalesce(p.total_xp, 0),
  coalesce(p.last_active_at, p.created_at, now())
from public.profiles p
where coalesce(p.status, 'active') != 'disabled'
on conflict (user_id) do update
  set nickname = excluded.nickname,
      total_xp = excluded.total_xp,
      updated_at = excluded.updated_at;
