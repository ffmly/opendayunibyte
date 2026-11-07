# Vercel deployment

## 1. Preflight and migration

Apply the email and admin leaderboards migration to your Supabase project:

```bash
node scripts/supabase/apply-migration.mjs supabase/migrations/20261107120000_add_profile_email_and_admin_leaderboards.sql
```

Then run the local test suite:

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

## 3. Supabase settings

- Email/password sign-in must remain enabled for staff/admin accounts.
- Anonymous sign-in should remain enabled for visitors. The app also has a
  server-side guest fallback so an event cannot be blocked by this setting.
- Keep RLS enabled and do not grant browser roles direct table writes.
- Promote the first admin with `scripts/supabase/promote-admin.mjs`.

## 4. Release test

1. Join from a private mobile browser, enter a nickname and valid email, and refresh; the session must persist.
2. Close and reopen the browser; verify the profile remains active without re-asking for email.
3. Scan a workshop QR with the phone camera; attendance must be awarded once.
4. Navigate away to Dashboard or Activities, then hit browser back; verify workshop details reload cleanly without blank or stuck states.
5. Sign in at `/admin/signin`; verify a normal visitor token is rejected.
6. Open the admin Dashboard and verify the three leaderboards (All-time, Quiz, Workshops) show emails as clickable `mailto:` links.
7. Open the participant cleanup modal, test typing the confirmation phrase `DELETE PARTICIPANTS`, and verify test attendee accounts are deleted while all admin accounts, questions, workshops, and QR codes remain intact.

## 5. Event day

- Use stable Wi-Fi and keep one admin device plus one backup device ready.
- Open the projector page full screen and disable sleep on the TV computer.
- Print QRs only after the production URL is final.
- Export results and keep a database backup after the event.
