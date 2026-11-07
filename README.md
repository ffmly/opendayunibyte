# UniByte Open Day Platform

Mobile-first Open Day platform for UniByte Scientific Club: public QR scanning,
workshop attendance, an automatic live quiz, leaderboard, and an admin control
panel. The active application uses **Next.js 16 + Supabase**.

## What is included

- Visitors join with a display name only; no email or password is requested.
- Any phone camera can open the printed workshop/quiz QR links.
- Workshop attendance is awarded once, with an optional image, description,
  location, and website/Instagram link.
- The live quiz advances automatically every 30 seconds. A round lasts five
  minutes, uses ten questions, and exhausts the active bank before reshuffling.
- Projector mode shows the current question, QR, round top 10, and all-time top 3.
- Admin pages manage users, XP, QR codes, workshops, questions, and quiz sessions.
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

## Verification

```bash
npx tsc --noEmit
npm run lint
npm run build
node scripts/supabase/verify-data.mjs
node scripts/supabase/test-guest-auth.mjs http://localhost:3000
node scripts/supabase/test-visitor-flow.mjs http://localhost:3000
node scripts/supabase/test-quiz-flow.mjs http://localhost:3000
```

The last command creates a temporary guest, verifies sign-in, and deletes it.

## Main routes

- `/join` visitor registration
- `/scan` QR scanner and direct QR resolution
- `/dashboard`, `/workshops`, `/leaderboard`, `/profile`
- `/quiz` participant view
- `/quiz/screen` projector view
- `/station` QR station view
- `/admin/signin` and `/admin/*` event control

See [TEAM_OPEN_DAY_GUIDE.md](./TEAM_OPEN_DAY_GUIDE.md) for the event-day runbook
and [DEPLOYMENT.md](./DEPLOYMENT.md) for Vercel setup.
