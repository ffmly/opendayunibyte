# Architecture

## Request path

`phone/browser → Next.js route or /api/call/* → authenticated server handler → Supabase/Postgres`

The browser never writes XP, attendance, quiz answers, or leaderboard totals
directly. It sends a Supabase access token to the Next.js callable route. The
server verifies the token and executes validated SQL/RPC operations with
server-only credentials.

## Identity and session persistence

- **Visitor identity:** When a visitor arrives, Supabase Auth initializes an
  anonymous session. The session is persisted in browser storage (`localStorage`)
  via `@supabase/supabase-js` with `persistSession: true, autoRefreshToken: true`.
- **Browser/device bound:** The session remains available across page refreshes,
  tab closes, and later visits on the same browser and device.
- **Why nickname-only recovery is not supported:** Nicknames are publicly visible
  on the live leaderboard and projector screens. Permitting sign-in with only a
  nickname would allow any attendee to impersonate another player and claim their
  rewards. Therefore, sessions are strictly bound to the authenticated browser
  token. If a visitor clears their browser data or switches devices, their previous
  anonymous session cannot be recovered via nickname alone.
- **Staff/admin identity:** Email/password user with `app_metadata.role` set to
  `staff` or `admin`. Table `admin_roles` mirrors the role for auditing and
  authorization checks.
- **Registration profile:** Table `profiles` stores `nickname`, `nickname_key`,
  `email` (nullable for legacy profiles, required for all new registrations),
  `total_xp`, and timestamps.

## Email privacy and security model

Participant email addresses are treated as strictly confidential contact
information intended exclusively for awarding prizes after the event:

- **Database level:** Row Level Security (RLS) is enabled on `profiles`. Direct
  table access is revoked from `anon` and `authenticated` roles.
- **Public API endpoints:** Endpoints such as `getLeaderboard`, `getQuizLiveState`,
  and workshop details never select or return the `email` column.
- **Client isolation:** The service worker (`public/sw.js`) explicitly ignores
  `/api/*`, `/auth/*`, and requests containing `Authorization` headers. Emails
  are never cached in service worker caches.
- **Private owner access:** `getMyProfile` returns the email only to the
  authenticated session owner whose UID matches the profile.
- **Admin-only access:** Only the server handlers `adminLeaderboards` and
  `adminListUsers` return email addresses, and both enforce `requireAdmin(context)`.

## Administrative leaderboards

The server provides three dedicated administrative leaderboards through the
`adminLeaderboards` callable:

1. **Quiz leaderboard:** Aggregates `quiz_answers` (with fallback to `quiz_participants`
   points) joined with `profiles`. Calculates total quiz points, correct answers,
   and distinct rounds joined. Ordered by `quizPoints desc, correctAnswers desc, roundsJoined desc`.
2. **All-time leaderboard:** Joins `public.leaderboard` with `profiles` to pair
   total Open Day XP with contact emails. Ordered by `totalXP desc`.
3. **Workshop visits leaderboard:** Aggregates `workshop_checkins` joined with
   `profiles`. Calculates distinct workshops visited and total workshop points.
   Ordered by `workshopsVisited desc, workshopPoints desc`.

All three display clickable `mailto:` links in the admin dashboard for contacting
winners directly.

## Admin participant cleanup mechanism

The `adminCleanupParticipants` endpoint provides a safe way to wipe test attendees:

1. Requires an authenticated caller with `admin` role.
2. Requires the exact confirmation phrase `DELETE PARTICIPANTS`.
3. Queries `admin_roles` and includes the calling admin ID to assemble a preserved
   UID whitelist.
4. Cascades deletion of participant records from `profiles`, `quiz_answers`,
   `quiz_participants`, `workshop_checkins`, `cat_finds`, `game_scores`,
   `password_attempts`, `mystery_attempts`, `challenge_claims`, `xp_events`,
   and `leaderboard`.
5. Uses the Supabase Admin API (`supabase.auth.admin.deleteUser`) to delete
   temporary attendee Auth accounts.
6. **Strictly preserves:** All admin/staff accounts, workshop definitions, quiz
   question bank, QR codes, cat hunt definitions, and event reward configurations.

## Workshop back-navigation architecture

The workshop viewing and back-navigation bug was caused by three interacting factors:
1. **Missing Suspense boundary:** Dynamic routes calling `useSearchParams()` or
   `useParams()` in Next.js 16 require a `<Suspense>` boundary to avoid hydration
   bailout during client navigation.
2. **Service worker catch fallback:** The service worker previously caught
   aborted navigation fetches during back-navigation and served cached root HTML,
   corrupting the workshop view.
3. **QR scanner history stack:** Scanning pushed `/workshops/[id]` on top of
   `/scan?token=...`. Pressing Back returned to `/scan?token=...`, which
   re-triggered automatic check-in.

**Resolution:**
- Wrapped `WorkshopExperiencePage` in `<Suspense fallback={<FullPageLoader />}>`.
- Moved `UserShell` to wrap the workshop content directly.
- Safely extracted and decoded `workshopId` with unmount/cancellation guards.
- Updated `BackButton` fallback from non-existent `/workshops` to `/activities`.
- Changed `/scan` redirects to `router.replace`, preventing `/scan?token=...`
  from trapping back-navigation.
- Service worker navigation fallback is restricted to static root pages only.
