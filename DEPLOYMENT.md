# Vercel deployment

## 1. Preflight

```bash
npm ci
npx tsc --noEmit
npm run lint
npm run build
node scripts/supabase/verify-data.mjs
```

Confirm `.env.local`, `ADMIN_CREDENTIALS.local.md`, migration exports, and all
secret keys are ignored and not staged.

## 2. Vercel variables

Add every key from `.env.example` to Production and Preview:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `DATABASE_URL`
- `NEXT_PUBLIC_APP_URL` (the final `https://...vercel.app` origin)
- `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`
- `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`

Never expose the secret key or database password with `NEXT_PUBLIC_`. After an
environment change, redeploy; existing deployments do not receive new values.

## 3. Supabase

- Email/password sign-in must remain enabled for staff/admin accounts.
- Anonymous sign-in should remain enabled for visitors. The app also has a
  server-side guest fallback so an event cannot be blocked by this setting.
- Keep RLS enabled and do not grant browser roles direct table writes.
- Promote the first admin with `scripts/supabase/promote-admin.mjs`.

## 4. Release test

1. Join from a private mobile browser and refresh; the session must persist.
2. Scan a workshop QR with the phone camera; attendance must be awarded once.
3. Confirm the workshop image, summary, link, and Back button.
4. Sign in at `/admin/signin`; a visitor must be rejected.
5. Start a quiz, open `/quiz/screen`, join from a second phone, and answer.
6. Confirm question/timer synchronization, round top 10, and all-time top 3.
7. Stop the quiz and verify late answers are rejected.

## 5. Event day

- Use stable Wi-Fi and keep one admin device plus one backup device ready.
- Open the projector page full screen and disable sleep on the TV computer.
- Print QRs only after the production URL is final.
- Export results and keep a database backup after the event.
