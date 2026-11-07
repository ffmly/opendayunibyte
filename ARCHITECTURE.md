# Architecture

## Request path

`phone/browser → Next.js route or /api/call/* → authenticated server handler → Supabase/Postgres`

The browser never writes XP, attendance, quiz answers, or leaderboard totals
directly. It sends a Supabase access token to the Next.js callable route. The
server verifies the token and executes validated SQL/RPC operations with
server-only credentials.

## Identity

- Visitor: Supabase anonymous sign-in when enabled. If the project keeps that
  provider disabled, `/api/auth/guest` creates a confirmed random guest account
  server-side and the browser receives only its temporary credentials.
- Staff/admin: email/password user with `app_metadata.role` equal to `staff` or
  `admin`. `admin_roles` mirrors the role for auditing.
- Registration profile: `profiles` stores nickname, status, and total XP.

## Data integrity

- `xp_events` is the append-only reward ledger.
- PostgreSQL functions `award_xp`, `register_attendee`, `claim_workshop`,
  `claim_cat`, and `record_quiz_answer` make each mutation atomic.
- Unique constraints prevent duplicate workshop/cat claims and repeated quiz
  answers.
- RLS is enabled on public tables. Browser roles have no direct table writes;
  server operations use the service role and parameterized SQL.

## QR flow

Printed codes contain public URLs such as `/scan?token=...`. A visitor may use
the normal phone camera—installing the PWA first is not required. An unregistered
visitor is redirected to `/join`, enters a name once, then returns to the exact
QR activity. Legacy `UNIBYTE:` payloads remain readable.

## Quiz

The server owns the session, question order, deadlines, scoring, and answer
validation. Each question lasts 30 seconds; ten questions make a five-minute
round. The active question bank is shuffled deterministically and fully
exhausted before a new cycle, so questions do not repeat early.

## Workshop content

Each workshop supports title, location, clear summary text, optional central
image, optional website/Instagram link, reward, active state, and QR. Images can
be uploaded through the configured unsigned Cloudinary preset or entered as a
URL.

## Deployment

Next.js runs on Vercel. Supabase provides Auth and Postgres. Cloudinary is used
only for optional public workshop images. Environment variables are documented
in `.env.example`; server secrets never use a `NEXT_PUBLIC_` prefix.
