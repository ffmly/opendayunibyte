# UniByte Open Day Platform

Mobile-first Open Day platform for UniByte Scientific Club: public QR scanning,
workshop attendance, an automatic live quiz, public and administrative leaderboards,
and an admin control panel. The active application uses **Next.js 16 + Supabase**.

## What is included

- **Visitor registration:** Visitors register once with a visible nickname and a private email address for reward notifications.
- **Session persistence:** The anonymous Supabase session is automatically persisted in the browser storage (`localStorage`). Clearing browser data will reset the local session; accounts cannot be recovered on other devices with only a nickname to prevent impersonation.
- **Email privacy:** Participant emails are strictly private and accessible only to verified administrators inside the protected dashboard. They never appear in public leaderboards, quiz screens, or public API responses.
- **Profile completion:** Existing profiles without an email are prompted to provide one upon visiting the site, without receiving registration XP twice.
- **Workshop attendance:** Scanning a workshop QR records attendance once and displays workshop info, summary, optional image, location, and content link. Navigating away and back works smoothly with no stuck loading states.
- **Live Quiz:** Advances automatically every 30 seconds. Rounds last 5 minutes with 10 questions each, drawing from an active bank of 540 questions without repeating until exhausted.
- **Three administrative leaderboards:**
  1. *All-time leaderboard:* Ranked by total Open Day XP.
  2. *Quiz leaderboard:* Ranked by quiz points, correct answers, and joined rounds.
  3. *Workshops leaderboard:* Ranked by distinct workshops visited and workshop points.
  All three include clickable `mailto:` links to contact winners directly.
- **Admin participant cleanup:** One-click safe cleanup in the admin dashboard to delete test participant accounts, auth entries, and attendee activity before the event while strictly preserving all admin accounts, workshops, quiz questions, and settings.
- Arabic, English, French, RTL, PWA, and mobile back navigation are supported.

## Local development

Requirements: Node.js 20+ and the variables listed in `.env.example`.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Admin sign-in is at `/admin/signin`.

## Environment

Copy `.env.example` to `.env.local` and fill in the values. Browser-safe values
start with `NEXT_PUBLIC_`. `SUPABASE_SECRET_KEY` and `DATABASE_URL` are
server-only and must never be exposed to client code or committed.

On Vercel set `NEXT_PUBLIC_APP_URL` to the final production origin. Printed QR
codes use this value, so redeploy after changing it.

## Admin setup

Create a normal email/password user in Supabase Auth, then run:

```bash
node scripts/supabase/promote-admin.mjs your-email@example.com admin
```

Sign out and sign in again so the browser receives the new role claim. To
inspect Auth users without printing passwords or tokens:

```bash
node scripts/supabase/list-auth-users.mjs
```

## Verification and test suite

```bash
npx tsc --noEmit
npm run lint
npm run build
node scripts/supabase/verify-data.mjs
node scripts/supabase/test-all-requirements.mjs http://localhost:3000
node scripts/supabase/test-workshop-navigation.mjs http://localhost:3000
node scripts/supabase/test-visitor-flow.mjs http://localhost:3000
node scripts/supabase/test-quiz-flow.mjs http://localhost:3000
```

## Main routes

- `/join` visitor registration & email completion
- `/scan` QR scanner and direct QR resolution
- `/dashboard`, `/activities`, `/leaderboard`, `/profile`
- `/workshops/[id]` workshop experience and details
- `/quiz` participant view
- `/quiz/screen` projector view
- `/station` QR station view
- `/admin/signin` and `/admin/*` event control

See [TEAM_OPEN_DAY_GUIDE.md](./TEAM_OPEN_DAY_GUIDE.md) for the event-day runbook,
[ARCHITECTURE.md](./ARCHITECTURE.md) for security and data flow details,
and [DEPLOYMENT.md](./DEPLOYMENT.md) for Vercel setup.
