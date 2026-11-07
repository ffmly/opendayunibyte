create table public.legacy_firebase_auth_users (
  firebase_uid text primary key,
  email text,
  display_name text,
  disabled boolean not null default false,
  custom_claims jsonb not null default '{}'::jsonb,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  migrated_at timestamptz not null default now()
);

alter table public.legacy_firebase_auth_users enable row level security;
revoke all on public.legacy_firebase_auth_users from anon, authenticated;
grant all on public.legacy_firebase_auth_users to service_role;
