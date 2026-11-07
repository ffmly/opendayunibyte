# AI Handoff Prompt — Unibyte Open Day Platform

Continue development inside this project only:

```text
C:\Users\itsbe\Desktop\Projects\openday
```

Repository:

<https://github.com/ffmly/opendayunibyte.git>

Stack:

- Next.js 16.3.1 App Router
- React 19
- TypeScript
- Supabase Auth + PostgreSQL
- Vercel

## Before changing anything

1. Read `AGENTS.md` completely.
2. This Next.js version contains breaking changes. Read the relevant documentation from `node_modules/next/dist/docs/`.
3. At minimum, read the current documentation about Authentication, Server and Client Components, Navigation, and Data Fetching/Caching.
4. Run `git status` and inspect existing changes.
5. Preserve all user changes and unrelated work.
6. Do not use destructive Git commands.
7. Do not redesign the platform, change its colors, or rewrite unrelated pages.
8. The application has already been migrated to Supabase. Do not restore or introduce Firebase.
9. Never expose the Supabase service-role key, database password, admin credentials, or other private secrets in client code or Git.
10. `.env.local` contains private credentials and must remain ignored.
11. Inspect the current implementation before modifying it. Do not assume ordinary Next.js APIs behave exactly like older versions.

The last known pushed commit before this task was:

```text
83d3db5 — Use verified Webpack production build
```

No code changes were made during the previous interrupted attempt. The project should still be at its current existing state.

---

## Main objective

Improve visitor account persistence, require and save visitor email addresses, add private administrative leaderboards, add a safe test-account cleanup feature, and fix a workshop navigation/loading bug.

Do not break the existing:

- QR scanner
- Workshop check-ins
- Workshop pages
- Quiz
- Quiz projector screen
- XP system
- Public leaderboard
- Admin authentication
- Mobile layouts
- Existing Supabase data
- Existing visual design

## 1. Persistent visitor accounts

I want a visitor's account/session to remain saved in the same browser and device.

The current browser Supabase client already has:

```ts
persistSession: true;
autoRefreshToken: true;
detectSessionInUrl: true;
```

This is located in:

```text
src/lib/supabase/client.ts
```

Keep these settings.

Supabase should persist the anonymous session in browser storage. Do not build a separate custom authentication cache unless there is a proven need.

Verify that:

1. A visitor registers.
2. The visitor refreshes the page.
3. The visitor closes and reopens the site in the same browser.
4. The same profile remains available.
5. The visitor is not asked for their name and email again.

Do not manually store authentication tokens inside the service worker cache.

Inspect the current service worker and ensure it does not cache:

- Supabase authentication responses
- `/api/*` responses
- Requests containing authorization headers
- User-specific JSON responses
- Access tokens
- Refresh tokens

Static assets may remain cached.

Important limitation that must be documented:

- The account is saved in the same browser/device.
- Clearing browser data can remove the anonymous Supabase session.
- A session cannot safely be recovered on another device using only a nickname.

## 2. Require visitor email during initial registration

The current registration form asks only for a nickname.

Change first-time registration so it requires:

- Name/nickname
- Email address

The email is the address where the visitor could receive a gift.

Use clear text near the field, such as:

> We will only use this email to contact winners and deliver rewards.

Also add a small message explaining:

> Your account will remain saved on this browser.

Requirements:

- Email field must be required.
- Use `type="email"`.
- Use `autocomplete="email"`.
- Validate email on both client and server.
- Trim whitespace.
- Normalize email to lowercase.
- Maximum length: 254 characters.
- The nickname remains the visitor's visible identity in the application.
- Email must never be displayed publicly.

Do not implement insecure nickname-only authentication from another device. Anyone could impersonate another participant by entering their nickname.

The safe intended flow is:

1. Supabase creates an anonymous authenticated user.
2. The visitor provides nickname and email.
3. A profile is created and linked to the Supabase Auth user ID.
4. Supabase persists the session in the same browser.
5. Future visits from that browser open the existing account automatically.
6. The nickname is used as the display identity.
7. The email remains private and admin-only.

## 3. Support existing profiles without an email

Some existing profiles were created before email became required.

Do not break these profiles.

If an authenticated visitor has a profile but its email is null or missing:

- Do not redirect directly to the dashboard.
- Show the registration/completion page.
- Prefill the existing nickname if possible.
- Ask the visitor to add an email.
- Save the email.
- Do not grant registration XP a second time.
- Then continue to the original destination.

If a profile already has both nickname and email:

- Redirect normally.
- Do not show the registration page again.

Existing QR deep-link behavior must continue working:

- If a visitor opened a QR code before registration, after completing the name/email step they must continue to the intended QR destination.
- Do not send all QR visitors to the dashboard by mistake.

## 4. Database migration

Create a new Supabase migration. Do not modify previously applied migrations.

Use Supabase CLI if available, for example:

```bash
supabase migration new add_profile_email_and_admin_leaderboards
```

Add an email column to `public.profiles`.

Recommended initial structure:

```sql
email text null
```

It should initially be nullable for compatibility with existing imported profiles, but all new registrations must require it.

Normalize saved email addresses with:

```sql
lower(trim(email))
```

Add a case-insensitive unique partial index for non-null email addresses.

The goal is to prevent multiple visitor reward accounts from using the same email.

Update the registration RPC/function, currently similar to:

```sql
public.register_attendee(p_user_id, p_nickname)
```

It should accept:

```text
p_user_id
p_nickname
p_email
```

Required behavior:

### New participant

- Save nickname.
- Save normalized email.
- Grant registration XP once.
- Seed/update the leaderboard normally.

### Existing profile without email

- Update the email.
- Keep the existing account and nickname.
- Do not grant registration XP again.
- Do not duplicate leaderboard or XP events.

### Fully registered profile

- Do not grant registration XP again.
- Return the existing registration state safely.

### Duplicate email

If another profile already owns the email:

- Reject the registration.
- Return a stable application error such as `email-already-used`.
- Display a clear user-friendly error in the registration page.

Do not allow clients to directly update arbitrary profiles.

Continue routing sensitive profile writes through validated server handlers or protected RPC functions.

After applying the migration, verify:

- RLS remains enabled.
- `anon` and `authenticated` roles do not receive broad direct access to private profile data.
- Email is not readable through public tables or public API handlers.
- Service-role credentials remain server-only.

## 5. Shared schema and models

Inspect and update:

```text
shared/schemas.ts
shared/models.ts
```

Add an email schema with:

- Trim
- Lowercase normalization
- Valid email format
- Maximum 254 characters

Update `registerUserSchema` from nickname-only to:

```ts
{
  nickname,
  email,
}
```

Update `UserProfile` to include:

```ts
email: string | null;
```

Ensure `getMyProfile` can return the email only to the authenticated owner of that profile.

## 6. Client authentication helper

Inspect:

```text
src/lib/auth/auth.ts
```

The current helper is approximately:

```ts
registerWithNickname(nickname);
```

Replace it with a clearer function such as:

```ts
registerProfile(nickname, email);
```

It must:

- Validate nickname and email.
- Send both fields to the server.
- Preserve the current anonymous authentication flow.
- Preserve existing fallback behavior only if it is still required.
- Not create a second anonymous account when a valid current session already exists.
- Not implement nickname-only reauthentication.

## 7. Registration page

Inspect:

```text
src/app/(public)/join/page.tsx
```

Add the required email field while preserving the current design.

Requirements:

- Preserve the existing visual identity.
- Keep it responsive on mobile.
- Keep QR redirect behavior.
- Use accessible labels.
- Use correct input types and autocomplete attributes.
- Show a clear duplicate-email error.
- Show generic errors only when the real error cannot be safely shown.
- Existing profiles missing email must be able to complete their profile.
- Existing complete profiles should redirect automatically.

Do not redesign this page.

## 8. Admin-only leaderboards

Add three separate administrative leaderboards:

1. Quiz leaderboard
2. All-time Open Day leaderboard
3. Workshop visits leaderboard

Emails must appear only inside the protected admin dashboard.

Create a protected server handler, for example:

```text
adminLeaderboards
```

Register it in:

```text
src/lib/server/handlers.ts
```

The server response may look like:

```ts
{
  quiz: [],
  allTime: [],
  workshops: [],
}
```

This handler must verify the admin role on the server.

Do not rely only on hiding the UI.

A normal visitor, anonymous user, or unauthorized staff account must not receive private email addresses.

### Quiz leaderboard

Calculate overall quiz performance across quiz sessions/rounds.

Include:

- User ID
- Nickname
- Email
- Total quiz points
- Number of correct answers
- Number of quiz sessions or rounds joined

Recommended ordering:

1. Total quiz points descending
2. Correct answers descending
3. Stable deterministic tie-breaker

Use trusted stored quiz data such as `quiz_answers`.

Do not use total Open Day XP as the quiz score.

### All-time Open Day leaderboard

Join the existing leaderboard data with private profiles.

Include:

- User ID
- Nickname
- Email
- Total XP

Order by total XP descending, using a stable tie-breaker.

### Workshop leaderboard

Aggregate `workshop_checkins`.

Include:

- User ID
- Nickname
- Email
- Number of distinct workshops visited
- Total workshop points

Recommended ordering:

1. Distinct workshops visited descending
2. Workshop points descending
3. Stable deterministic tie-breaker

Do not count duplicate check-ins for the same user and workshop.

## 9. Admin dashboard UI

Inspect and update:

```text
src/app/admin/page.tsx
src/app/admin/users/page.tsx
```

Add three clearly separated sections:

- Quiz leaderboard
- All-time leaderboard
- Workshop visits leaderboard

Each administrative leaderboard should show:

- Rank
- Participant name
- Email
- Main score
- Relevant secondary metric

Examples:

### Quiz

- Rank
- Name
- Email
- Quiz points
- Correct answers
- Sessions/rounds

### All-time

- Rank
- Name
- Email
- Total XP

### Workshops

- Rank
- Name
- Email
- Workshops visited
- Workshop points

Make email addresses clickable with `mailto:`.

Do not send emails automatically.

For old profiles without an email, display:

```text
No email provided
```

Make the dashboard responsive:

- Good desktop table
- Mobile-friendly cards or safe horizontal scrolling
- Do not break the existing admin navigation or design

Update the admin users page to show participant emails as well.

## 10. Admin cleanup button for test accounts

Add an admin-only cleanup feature for removing test participant accounts.

The user has created test accounts and needs a safe way to delete them.

Add a button in the admin dashboard such as:

```text
Delete all participant accounts
```

This is a destructive operation and must be implemented carefully.

### Required behavior

When confirmed, it must:

- Delete all non-admin participant accounts.
- Delete their Supabase Auth users.
- Delete their participant profiles.
- Clear the participant leaderboard.
- Remove participant-owned/generated activity records when required for referential integrity.

It must preserve:

- Every admin account
- Every staff/admin account that must remain operational
- Admin authentication
- Quiz question bank
- Workshops
- Workshop definitions
- Workshop images and content
- QR codes
- Cats/activity definitions
- Reward settings
- Platform configuration
- Event configuration
- Static content

Do not delete the admin's own account.

If participant records reference profiles through foreign keys, safely remove or cascade user-generated records such as:

- Participant leaderboard rows
- Quiz answers
- Quiz participant rows
- Workshop check-ins
- XP events
- User achievements
- Cat finds
- User game scores or attempts
- Other rows owned by deleted participant IDs

Do not delete the quiz questions, workshops, QR codes, or configuration.

### Safety requirements

The cleanup endpoint must:

- Be server-side.
- Require a valid admin role.
- Never expose the service-role key to the browser.
- Use the Supabase Admin API only on the server to delete Auth users.
- Return a summary of what was deleted.
- Handle partial failure carefully.
- Be idempotent where practical.
- Never delete the currently authenticated admin.

The UI must require strong confirmation.

Recommended confirmation flow:

1. Show a warning explaining exactly what is deleted.
2. Require typing the phrase `DELETE PARTICIPANTS`.
3. Require a second confirmation button.
4. Disable the button during processing.
5. Show a result summary.
6. Refresh all admin statistics and leaderboards afterward.

Do not create a single unprotected delete endpoint.

Add tests proving:

- A normal visitor cannot call it.
- Staff cannot call it if only full admins are authorized.
- Admin accounts are preserved.
- Participant accounts are removed.
- Quiz questions, workshops, QR codes, and settings remain.
- Leaderboards are cleared or rebuilt correctly.

## 11. Workshop back-navigation/loading bug

There is an existing bug that must be investigated and fixed.

Current behavior:

1. The visitor scans a workshop QR code.
2. The visitor opens the workshop page.
3. The workshop page correctly shows the workshop image, information, description, and optional content link.
4. The visitor navigates away or uses the back button.
5. When returning to the workshop page, it may remain stuck on loading or appear blank.
6. The workshop information only appears after manually refreshing the page.

Fix this properly.

Do not solve it by forcing a full browser reload unless absolutely necessary.

Inspect:

- Workshop page components
- Router navigation
- Back buttons
- Browser history behavior
- AuthProvider loading state
- Data-fetching effects
- Effect dependency arrays
- AbortController or cleanup logic
- Cached request state
- React Strict Mode behavior
- Supabase session initialization
- Route transitions
- Any `startedRef` or already-loaded guard
- Suspense boundaries
- Service worker caching
- State that is not reset when a route remounts
- Cases where loading remains true after an exception

Required result:

- Workshop information loads on first visit.
- Navigating away and returning works.
- Browser back works.
- The in-app back button works.
- Mobile back navigation works.
- No manual refresh is required.
- No infinite loading state.
- No blank page.
- No duplicate workshop check-in is created merely by revisiting the page.
- Existing QR/check-in behavior remains correct.

Add a regression test or at least a reproducible automated navigation test covering:

```text
Scan/open workshop → navigate away → browser back → workshop content visible
```

Test it on a mobile-sized viewport.

## 12. Privacy and security rules

Email must never appear in:

- Public leaderboard
- `/leaderboard`
- Quiz projector screen
- `getLeaderboard` public response
- `getQuizLiveState` public response
- QR pages
- Workshop public responses unless it is the current user's own profile and genuinely required
- Public HTML source
- Client console logs
- Service worker cache
- Public API error messages

Email may appear only in:

- The owner's private profile response
- Protected admin endpoints
- Protected admin dashboard

Check both UI and raw API responses.

Do not assume that hiding a column in React is enough.

The server must not return private email data to public calls.

## 13. Important current files

These files were already identified as relevant:

```text
shared/models.ts
shared/schemas.ts
src/lib/auth/auth.ts
src/app/(public)/join/page.tsx
src/components/providers/auth-provider.tsx
src/lib/server/users.ts
src/lib/server/reads.ts
src/lib/server/handlers.ts
src/lib/supabase/client.ts
src/app/admin/page.tsx
src/app/admin/users/page.tsx
src/components/providers/service-worker-register.tsx
public/sw.js
supabase/migrations/
scripts/supabase/test-visitor-flow.mjs
scripts/supabase/test-quiz-flow.mjs
```

Search for all usages before renaming functions or changing response types.

## 14. Current known implementation details

The current shared registration schema accepts only:

```ts
{
  nickname;
}
```

The current registration helper is approximately:

```ts
registerWithNickname(nickname);
```

The current server registration calls:

```sql
public.register_attendee(uid, nickname)
```

The current `public.profiles` table contains approximately:

- `id`
- `nickname`
- `nickname_key`
- `total_xp`
- `status`
- `created_at`
- `last_active_at`
- `legacy_firebase`

It does not currently have an email column.

The public leaderboard currently contains:

- `user_id`
- `nickname`
- `total_xp`
- `updated_at`

Do not add email to the public leaderboard table unless there is an unavoidable reason. Prefer joining profiles only inside protected admin queries.

The existing `adminDashboardData` currently returns general statistics and one small all-time leaderboard. Expand or supplement it without breaking existing consumers.

## 15. Update tests and scripts

Update test scripts that currently register with nickname only, including:

```text
scripts/supabase/test-visitor-flow.mjs
scripts/supabase/test-quiz-flow.mjs
```

Every test participant should use a unique valid email address.

Add or extend tests for:

1. New registration with nickname and email.
2. Email saved in lowercase.
3. Email whitespace trimmed.
4. Invalid email rejected.
5. Duplicate email rejected.
6. Existing profile without email can complete registration.
7. Existing profile does not receive registration XP twice.
8. Session survives a page refresh.
9. Complete profile skips registration on later visits.
10. Public leaderboard contains no email.
11. Public quiz state contains no email.
12. Admin leaderboard includes email.
13. Non-admin cannot access administrative leaderboards.
14. Quiz leaderboard aggregation is correct.
15. Workshop leaderboard aggregation is correct.
16. All-time leaderboard is correct.
17. Admin cleanup preserves admin accounts.
18. Admin cleanup deletes participant accounts and leaderboard data.
19. Admin cleanup preserves workshops, quiz questions, QR codes, and configuration.
20. Workshop page works after navigating away and returning.
21. Revisiting a workshop does not duplicate its check-in.

Remove test data after tests complete.

Do not leave large collections of temporary users in Supabase Auth.

## 16. Verification

Before finishing, run all relevant checks:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

The current production build intentionally uses:

```bash
next build --webpack
```

Do not change that without a proven reason.

Also run:

- Supabase migration verification
- Visitor registration test
- Anonymous authentication test
- Workshop check-in test
- Workshop navigation regression test
- Quiz flow test
- Admin authorization test
- Admin leaderboard test
- Cleanup safety test
- Secret scan
- `git diff` review
- `git status`

Verify the production build succeeds.

Test the important flows at a mobile viewport.

## 17. Apply migration and deploy

After reviewing the migration and tests:

1. Apply the migration to the existing Supabase project.
2. Do not create a new Supabase project.
3. Do not add Firebase back.
4. Do not add new environment variables unless truly necessary.
5. Keep private variables server-only.
6. Commit the changes with a clear commit message.
7. Push to the existing GitHub `main` branch: <https://github.com/ffmly/opendayunibyte.git>
8. Check the Vercel deployment if the required tools and access are available.
9. If Vercel fails, inspect the actual build/runtime logs instead of guessing.

## 18. Documentation

Update the existing documentation where appropriate:

```text
README.md
ARCHITECTURE.md
DEPLOYMENT.md
TEAM_OPEN_DAY_GUIDE.md
```

Document:

- How browser session persistence works.
- That the account is retained on the same browser/device.
- That clearing browser data may lose the anonymous session.
- Why nickname-only account recovery is not supported.
- How participant emails are protected.
- How to view the three admin leaderboards.
- How to contact winners using the displayed email.
- How the admin participant-cleanup button works.
- Exactly what cleanup deletes and preserves.
- How to test workshop QR navigation.
- How to safely clean test accounts before the Open Day.
- How to verify that admin accounts were preserved.

Do not put real passwords or secrets in tracked Markdown files.

## 19. Things that must not change

Do not:

- Redesign the website.
- Change the platform's colors or visual identity.
- Remove the quiz.
- Remove workshop functionality.
- Remove the scanner.
- Break QR deep links.
- Change the XP rules unnecessarily.
- Restore Firebase.
- Delete current production data during development.
- Grant registration XP twice.
- Expose emails publicly.
- Expose service-role credentials.
- Implement nickname-only authentication.
- Delete the admin account.
- Delete quiz questions during participant cleanup.
- Delete workshops during participant cleanup.
- Delete QR codes during participant cleanup.
- Delete reward or event settings.
- Reset the Git repository.
- Overwrite unrelated user changes.
- Force a full page refresh as the normal fix for the workshop navigation bug.
- Commit `.env.local`.
- Commit generated secrets or credentials.

## 20. Expected final report

When finished, provide:

1. A concise summary of everything implemented.
2. The new Supabase migration filename.
3. The important files changed.
4. How session persistence now works.
5. How missing emails are collected from old profiles.
6. How each of the three leaderboards is calculated.
7. How email privacy is enforced.
8. How to use the participant cleanup button.
9. Exactly what the cleanup operation deletes.
10. Exactly what it preserves.
11. The cause of the workshop back-navigation bug.
12. How that bug was fixed.
13. Test results.
14. TypeScript, lint, and production build results.
15. The commit hash.
16. The GitHub repository link.
17. Vercel deployment status.
18. Any remaining action required from me.

Do not claim success without running the relevant verification.
