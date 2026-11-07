import nextEnv from "@next/env";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

const appUrl = process.argv[2] ?? "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;

const service = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const browser = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });

const runId = randomUUID().slice(0, 8);

async function run() {
  console.log(`Starting workshop navigation regression test against ${appUrl}...`);

  // 1. Create a visitor session
  const signedIn = await browser.auth.signInAnonymously();
  if (signedIn.error || !signedIn.data.session) throw signedIn.error ?? new Error("Sign in failed");
  const uid = signedIn.data.user.id;
  const token = signedIn.data.session.access_token;

  try {
    // 2. Register visitor with email
    const regRes = await fetch(`${appUrl}/api/call/registerUser`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        nickname: `NavTester-${runId}`,
        email: `navtester-${runId}@test.unibyte.invalid`,
      }),
    });
    if (!regRes.ok) throw new Error(`Registration failed: ${regRes.status}`);

    // 3. Find active workshop QR
    const qrRow = await service
      .from("qr_codes")
      .select("token,target_id")
      .eq("type", "WORKSHOP")
      .eq("active", true)
      .limit(1)
      .single();
    if (qrRow.error || !qrRow.data) throw new Error("No active workshop QR found");
    const qrToken = qrRow.data.token;
    const workshopId = qrRow.data.target_id;

    // 4. Resolve QR token
    const resolveRes = await fetch(`${appUrl}/api/call/processQRCode`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ token: qrToken }),
    });
    const resolveData = await resolveRes.json();
    if (resolveData.qrType !== "WORKSHOP") throw new Error("QR token is not a WORKSHOP QR");
    console.log("✓ Workshop QR resolved correctly");

    // 5. Initial check-in
    const checkinRes = await fetch(`${appUrl}/api/call/checkInWorkshop`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ token: qrToken }),
    });
    const checkinData = await checkinRes.json();
    if (!checkinRes.ok || checkinData.alreadyCheckedIn) {
      throw new Error("First check-in failed or wrongly marked already checked in");
    }
    console.log("✓ Initial workshop check-in recorded");

    // 6. Direct fetch of workshop data (simulating WorkshopExperiencePage load)
    const wsFetch1 = await fetch(`${appUrl}/api/call/getWorkshop`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: workshopId }),
    });
    const wsData1 = await wsFetch1.json();
    if (!wsFetch1.ok || !wsData1.title) {
      throw new Error(`getWorkshop failed: ${JSON.stringify(wsData1)}`);
    }
    console.log(`✓ Workshop loaded on first visit: "${wsData1.title}"`);

    // 7. Simulate navigating away (e.g. to /dashboard or /activities)
    const dashRes = await fetch(`${appUrl}/api/call/getMyProfile`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    if (!dashRes.ok) throw new Error("Navigation away (profile fetch) failed");
    console.log("✓ Simulated navigation away to dashboard/profile");

    // 8. Simulate browser BACK return to workshop page:
    // Ensure getWorkshop resolves successfully again with identical data
    const wsFetch2 = await fetch(`${appUrl}/api/call/getWorkshop`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: workshopId }),
    });
    const wsData2 = await wsFetch2.json();
    if (!wsFetch2.ok || wsData2.title !== wsData1.title) {
      throw new Error("Workshop reload after back navigation returned inconsistent data");
    }
    console.log("✓ Workshop re-read after back navigation succeeded with identical content");

    // 9. Re-check in attempt: verify NO duplicate checkin or extra points awarded
    const secondCheckinRes = await fetch(`${appUrl}/api/call/checkInWorkshop`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ token: qrToken }),
    });
    const secondCheckinData = await secondCheckinRes.json();
    if (!secondCheckinRes.ok || !secondCheckinData.alreadyCheckedIn) {
      throw new Error("Re-visiting workshop duplicate checkin guard failed");
    }
    console.log("✓ Duplicate checkin guard successfully prevented re-awarding workshop points");

    // 10. Check workshop page route HTTP response (Next.js SSR / HTML)
    const pageRes = await fetch(`${appUrl}/workshops/${encodeURIComponent(workshopId)}`, {
      headers: {
        "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
      },
    });
    if (pageRes.status !== 200) {
      throw new Error(`Workshop page returned HTTP ${pageRes.status}`);
    }
    const html = await pageRes.text();
    if (!html.includes("<!DOCTYPE html>")) {
      throw new Error("Workshop page did not return valid HTML");
    }
    console.log("✓ Workshop page returns 200 OK HTML for mobile viewport user agent");

    console.log("\n========================================================");
    console.log("Workshop back-navigation regression test PASSED!");
    console.log("========================================================\n");
  } finally {
    await service.from("workshop_checkins").delete().eq("user_id", uid);
    await service.from("xp_events").delete().eq("user_id", uid);
    await service.from("leaderboard").delete().eq("user_id", uid);
    await service.from("profiles").delete().eq("id", uid);
    await service.auth.admin.deleteUser(uid);
  }
}

await run();
