# UniByte Open Day — Team Guide

## Before the event

1. Deploy the current `main` branch on Vercel and set all variables from
   `.env.example`.
2. Apply the migration:
   ```bash
   node scripts/supabase/apply-migration.mjs supabase/migrations/20261107120000_add_profile_email_and_admin_leaderboards.sql
   ```
3. Open `/admin/signin`, log in, and verify Dashboard, Workshops, QR Codes, and
   Quiz Control.
4. Clean up any test participants created during testing:
   - Go to `/admin`.
   - Scroll to the **"Delete all participant accounts"** section at the bottom.
   - Click the button, type `DELETE PARTICIPANTS` in the confirmation dialog, and confirm.
   - Verify that test participants and scores are cleared while your admin account, questions, and workshops remain intact.
5. In Workshops, create or edit each workshop. The description should be short,
   readable, and clear. Image and website/Instagram link are optional.
6. Generate the workshop and quiz QR codes after `NEXT_PUBLIC_APP_URL` points to
   the final production site. Test every printed QR with a normal phone camera.
7. Open `/quiz/screen` on the TV/projector and keep Quiz Control on the admin
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

## Visitor flow and session persistence

1. The visitor scans any printed QR using the phone camera (or opens `/join`).
2. On first use, the visitor enters:
   - A **Nickname** (public display name).
   - An **Email address** (strictly private, used solely by staff to contact winners for gifts).
3. The browser automatically saves the anonymous Supabase session in `localStorage`.
   - Refreshing the page or closing and reopening the site keeps the user signed in.
   - Visitors will not be asked for their nickname or email again on that browser.
   - Note: clearing browser cookies/site data removes the anonymous session. Nickname-only re-login is deliberately blocked to prevent attendees from impersonating one another.
4. If an existing profile was created without an email, navigating anywhere in the app
   prompts them to add their email once before continuing to their destination.
   Registration XP is not awarded a second time.

## Workshop flow & QR navigation

1. Scanning records attendance once and opens `/workshops/[id]`.
2. The page displays the workshop title, location, image, summary, and external link.
3. If the visitor uses the in-app Back button or the browser's back button, they can navigate
   freely between the workshop and activities/dashboard without getting stuck on a loading
   spinner or seeing a blank page.
4. Re-scanning a workshop QR code or revisiting the page does not duplicate attendance or award XP twice.

## Viewing administrative leaderboards & contacting winners

In `/admin`:
- Click the tabs above the leaderboard table:
  - **All-time:** Overall Open Day ranking sorted by total XP.
  - **Quiz:** Ranked by total quiz points, correct answers, and joined rounds.
  - **Workshops:** Ranked by number of distinct workshops attended and workshop points.
- Each entry displays the attendee's name, rank, score, and private **email address**.
- Clicking any email opens a pre-addressed `mailto:` link in your email client to notify winners.
- Note: Emails never appear on the public projector screen or the `/leaderboard` page.

## Quiz operation

1. Admin opens Quiz Control and starts the session.
2. Projector opens `/quiz/screen` and displays the public join QR.
3. Participants scan, complete registration if new, and answer on their phones.
4. Questions change every 30 seconds. Ten questions form a five-minute round.
5. The projector shows round top 10 and all-time top 3.
6. The bank of 540 questions is exhausted before repeating. Admin can view, search,
   add, or delete questions from Quiz Control.
7. Admin ends the session when finished.

## Cleaning test accounts before Open Day

Before the doors open to participants:
1. Log into `/admin`.
2. Scroll to the bottom card: **"Delete all participant accounts"**.
3. Click the button.
4. In the dialog, type: `DELETE PARTICIPANTS`.
5. Click **"Confirm deletion"**.
6. The dashboard will report how many participant profiles and auth accounts were deleted.
7. Verify that all admin accounts, quiz questions (540), workshops (6), and QR codes (21)
   remain intact.

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
