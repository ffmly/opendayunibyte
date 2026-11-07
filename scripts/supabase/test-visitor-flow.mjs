import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());
const appUrl = process.argv[2] ?? "http://localhost:3000";
const browser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const signedIn = await browser.auth.signInAnonymously();
if (signedIn.error || !signedIn.data.session) throw signedIn.error ?? new Error("Anonymous sign-in failed");
const uid = signedIn.data.user.id;
const token = signedIn.data.session.access_token;
const nickname = `FlowTest-${uid.slice(0, 8)}`;

async function call(name, data = {}) {
  const response = await fetch(`${appUrl}/api/call/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${name} failed (${response.status}): ${JSON.stringify(payload)}`);
  return payload;
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const qrResult = await admin
  .from("qr_codes")
  .select("token,target_id")
  .eq("type", "WORKSHOP")
  .eq("active", true)
  .limit(1)
  .single();
if (qrResult.error || !qrResult.data) throw qrResult.error ?? new Error("No active workshop QR found");

try {
  const registration = await call("registerUser", { nickname });
  if (typeof registration.points !== "number") throw new Error("Registration did not return points");
  const profile = await call("getMyProfile");
  if (profile.nickname !== nickname) throw new Error("Profile nickname mismatch");
  const resolution = await call("processQRCode", { token: qrResult.data.token });
  if (resolution.qrType !== "WORKSHOP") throw new Error("Workshop QR did not resolve correctly");
  const firstClaim = await call("checkInWorkshop", { token: qrResult.data.token });
  const secondClaim = await call("checkInWorkshop", { token: qrResult.data.token });
  if (firstClaim.alreadyCheckedIn || !secondClaim.alreadyCheckedIn) {
    throw new Error("Workshop duplicate protection failed");
  }
  console.log("Anonymous registration, QR resolution, workshop claim, and duplicate protection passed.");
} finally {
  await admin.from("workshop_checkins").delete().eq("user_id", uid);
  await admin.from("xp_events").delete().eq("user_id", uid);
  await admin.from("leaderboard").delete().eq("user_id", uid);
  await admin.from("profiles").delete().eq("id", uid);
  await admin.auth.admin.deleteUser(uid);
}
