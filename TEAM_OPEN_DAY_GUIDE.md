# UniByte Open Day — Team Guide

## Before the event

1. Deploy the current `main` branch on Vercel and set all variables from
   `.env.example`.
2. Open `/admin/signin`, log in, and verify Dashboard, Workshops, QR Codes, and
   Quiz Control.
3. In Workshops, create or edit each workshop. The description should be short,
   readable, and clear. Image and website/Instagram link are optional.
4. Generate the workshop and quiz QR codes after `NEXT_PUBLIC_APP_URL` points to
   the final production site. Test every printed QR with a normal phone camera.
5. Open `/quiz/screen` on the TV/projector and keep Quiz Control on the admin
   device.

## Admin account

- URL: `/admin/signin`
- Email: `unibyte@unibyte.com`
- Password: the password created by the owner in Supabase Auth. It is not stored
  in the repository.
- If the account was just promoted and shows “no admin access”, sign out and
  sign in again to refresh the role claim.

To promote another existing Auth user locally:

```bash
node scripts/supabase/promote-admin.mjs person@example.com staff
node scripts/supabase/promote-admin.mjs person@example.com admin
```

## Visitor flow

The visitor scans any printed QR using the phone camera. On first use, the site
asks only for a name. It then returns to the scanned activity. Later scans reuse
the same session. The central Scan page also supports the in-app camera and a
manual token. Browser and on-page Back buttons both work.

## Workshop flow

Scanning records attendance once and opens the workshop page. It shows the
title, optional location, optional central image, clear summary, and optional
external link. Re-scanning does not award XP twice.

## Quiz operation

1. Admin opens Quiz Control and starts the session.
2. Projector opens `/quiz/screen` and displays the public join QR.
3. Participants scan, enter their name if needed, and answer on their phones.
4. Questions change every 30 seconds. Ten questions form a five-minute round.
5. The projector shows round top 10 and all-time top 3.
6. The bank is exhausted before questions repeat. Admin can view, search, add,
   or delete questions from Quiz Control.
7. Admin ends the session when finished.

## Troubleshooting

- **Admin denied:** verify the user with `list-auth-users.mjs`, run
  `promote-admin.mjs`, then sign out/in.
- **Visitor registration error:** verify Vercel has `SUPABASE_SECRET_KEY` and
  redeploy. Anonymous Auth should be enabled; the guest fallback is a safety net.
- **QR opens the wrong host:** update `NEXT_PUBLIC_APP_URL`, redeploy, and
  regenerate/print the QR.
- **Image upload fails:** confirm both Cloudinary public variables and that the
  unsigned preset is enabled.
- **Projector stale:** refresh both Quiz Control and `/quiz/screen`; confirm the
  same deployment is open on all devices.

## Safety

Never paste `SUPABASE_SECRET_KEY`, database passwords, or `.env.local` into a
chat or commit. Only browser-safe `NEXT_PUBLIC_` values may reach the client.
Use a separate staff account per trusted operator when possible.
