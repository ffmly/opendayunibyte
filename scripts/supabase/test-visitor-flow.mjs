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
const email = `flowtest-${uid.slice(0, 8)}@test.unibyte.invalid`;

async function call(name, data = {}, customToken = token) {
  const response = await fetch(`${appUrl}/api/call/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${customToken}` },
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

let secondUid = null;

try {
  // 1. Initial registration with nickname and email
  const registration = await call("registerUser", { nickname, email: `  ${email.toUpperCase()}  ` });
  if (typeof registration.points !== "number" || registration.points <= 0) {
    throw new Error("Registration did not award points");
  }

  // 2. Profile fetch - verify nickname and normalized lowercase email
  const profile = await call("getMyProfile");
  if (profile.nickname !== nickname) throw new Error("Profile nickname mismatch");
  if (profile.email !== email.toLowerCase()) throw new Error(`Profile email normalization failed: expected ${email.toLowerCase()} got ${profile.email}`);

  // 3. Second registration attempt with the same session should not re-grant points
  const reRegister = await call("registerUser", { nickname, email });
  if (reRegister.points !== 0 || !reRegister.alreadyRegistered) {
    throw new Error("Re-registration improperly granted duplicate points");
  }

  // 4. Duplicate email rejection test with a second anonymous visitor
  const secondVisitor = await browser.auth.signInAnonymously();
  if (secondVisitor.data?.user) {
    secondUid = secondVisitor.data.user.id;
    const secondToken = secondVisitor.data.session.access_token;
    let duplicateRejected = false;
    try {
      await call("registerUser", { nickname: "OtherUser", email }, secondToken);
    } catch (err) {
      if (err.message.includes("already-exists") || err.message.includes("registered")) {
        duplicateRejected = true;
      }
    }
    if (!duplicateRejected) {
      throw new Error("Duplicate email was not rejected for distinct user");
    }
  }

  // 5. QR code scanning and workshop check-in
  const resolution = await call("processQRCode", { token: qrResult.data.token });
  if (resolution.qrType !== "WORKSHOP") throw new Error("Workshop QR did not resolve correctly");
  const firstClaim = await call("checkInWorkshop", { token: qrResult.data.token });
  const secondClaim = await call("checkInWorkshop", { token: qrResult.data.token });
  if (firstClaim.alreadyCheckedIn || !secondClaim.alreadyCheckedIn) {
    throw new Error("Workshop duplicate protection failed");
  }

  console.log("Visitor registration with email, normalization, duplicate prevention, and workshop check-in passed.");
} finally {
  await admin.from("workshop_checkins").delete().eq("user_id", uid);
  await admin.from("xp_events").delete().eq("user_id", uid);
  await admin.from("leaderboard").delete().eq("user_id", uid);
  await admin.from("profiles").delete().eq("id", uid);
  await admin.auth.admin.deleteUser(uid);

  if (secondUid) {
    await admin.from("profiles").delete().eq("id", secondUid);
    await admin.auth.admin.deleteUser(secondUid);
  }
}
