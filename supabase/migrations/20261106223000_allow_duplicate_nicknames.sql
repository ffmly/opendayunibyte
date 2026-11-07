drop index if exists public.profiles_nickname_key_idx;
create index if not exists profiles_nickname_lookup_idx on public.profiles (nickname_key);
