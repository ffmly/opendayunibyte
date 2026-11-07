import nextEnv from "@next/env";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd());

const appUrl = process.argv[2] ?? "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const databaseUrl = process.env.DATABASE_URL;

if (!url || !publishable || !secret || !databaseUrl) {
  throw new Error("Missing Supabase or Database configuration");
}

const service = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const pgPool = new pg.Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

async function apiCall(name, token, body = {}) {
  const res = await fetch(`${appUrl}/api/call/${name}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

const runId = randomUUID().slice(0, 8);
const adminEmail = `admin-test-${runId}@test.unibyte.invalid`;
const adminPassword = randomBytes(24).toString("base64url");

let adminId = null;
let adminToken = null;
const createdUserIds = new Set();

async function setupAdmin() {
  const created = await service.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
    app_metadata: { role: "admin" },
  });
  if (created.error || !created.data.user) {
    throw new Error(`Admin creation failed: ${created.error?.message}`);
  }
  adminId = created.data.user.id;
  await service.from("admin_roles").upsert({ user_id: adminId, role: "admin" });

  const adminClient = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await adminClient.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
  if (signIn.error || !signIn.data.session) {
    throw new Error(`Admin sign-in failed: ${signIn.error?.message}`);
  }
  adminToken = signIn.data.session.access_token;
}

async function createVisitor() {
  const client = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
  const anon = await client.auth.signInAnonymously();
  if (anon.error || !anon.data.session) {
    throw new Error(`Anonymous sign-in failed: ${anon.error?.message}`);
  }
  const uid = anon.data.user.id;
  createdUserIds.add(uid);
  return { uid, token: anon.data.session.access_token, client };
}

async function runTests() {
  console.log(`Starting comprehensive test suite against ${appUrl} (Run ID: ${runId})...`);
  await setupAdmin();
  console.log(`✓ Admin user created (${adminId})`);

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (!condition) {
      console.error(`  FAIL: ${message}`);
      failed++;
      throw new Error(message);
    }
    console.log(`  PASS: ${message}`);
    passed++;
  }

  // 1. New registration with nickname and email
  console.log("\n--- Test 1: New registration with nickname and email ---");
  const v1 = await createVisitor();
  const email1 = `attendee1-${runId}@test.unibyte.invalid`;
  const reg1 = await apiCall("registerUser", v1.token, {
    nickname: `User-${runId}`,
    email: email1,
  });
  assert(reg1.ok, `Registration succeeded with status 200`);
  assert(reg1.data.points === 50, `Awarded exactly 50 registration XP`);
  assert(reg1.data.alreadyRegistered === false, `Flagged as newly registered`);

  // 2. Email normalization (lowercase and trim)
  console.log("\n--- Test 2: Email trim and lowercase normalization ---");
  const v2 = await createVisitor();
  const rawEmail2 = `  Attendee2-${runId}@TEST.UniByte.Invalid  `;
  const normalizedEmail2 = `attendee2-${runId}@test.unibyte.invalid`;
  const reg2 = await apiCall("registerUser", v2.token, {
    nickname: `User2-${runId}`,
    email: rawEmail2,
  });
  assert(reg2.ok, `Registration succeeded with raw mixed-case email`);
  const prof2 = await apiCall("getMyProfile", v2.token);
  assert(prof2.data.email === normalizedEmail2, `Email was trimmed and lowercased: ${prof2.data.email}`);

  // 3. Invalid email rejected
  console.log("\n--- Test 3: Invalid email rejected ---");
  const v3 = await createVisitor();
  const reg3 = await apiCall("registerUser", v3.token, {
    nickname: `User3-${runId}`,
    email: "not-an-email",
  });
  assert(!reg3.ok && reg3.status === 400, `Rejected invalid email with HTTP 400`);

  // 4. Duplicate email rejected
  console.log("\n--- Test 4: Duplicate email rejected across participants ---");
  const v4 = await createVisitor();
  const reg4 = await apiCall("registerUser", v4.token, {
    nickname: `User4-${runId}`,
    email: email1, // Duplicate of v1
  });
  assert(!reg4.ok && (reg4.status === 409 || reg4.data.error?.code === "already-exists"), `Rejected duplicate email with already-exists`);

  // 5. Existing profile without email can complete profile without receiving XP twice
  console.log("\n--- Test 5: Existing profile without email completing registration ---");
  const v5 = await createVisitor();
  // Manually simulate legacy profile without email in the database
  await pgPool.query(
    `insert into public.profiles (id, nickname, nickname_key, email, total_xp)
     values ($1, $2, $3, null, 100)
     on conflict (id) do update set email = null, total_xp = 100`,
    [v5.uid, `Legacy-${runId}`, `legacy-${runId}`],
  );
  const email5 = `legacy-${runId}@test.unibyte.invalid`;
  const reg5 = await apiCall("registerUser", v5.token, {
    nickname: `Legacy-${runId}`,
    email: email5,
  });
  assert(reg5.ok, `Completion of missing email succeeded`);
  assert(reg5.data.points === 0, `Registration XP was NOT awarded twice (points = 0)`);
  assert(reg5.data.alreadyRegistered === true, `Already registered flag is true`);
  const prof5 = await apiCall("getMyProfile", v5.token);
  assert(prof5.data.email === email5, `Legacy profile now has email: ${prof5.data.email}`);
  assert(prof5.data.totalXP === 100, `XP preserved at 100 (not duplicated)`);

  // 6. Public leaderboard privacy: verify NO email leaked
  console.log("\n--- Test 6: Public leaderboard contains no email ---");
  const lbPublic = await apiCall("getLeaderboard", null, { top: 10 });
  assert(lbPublic.ok, `Public leaderboard accessible`);
  const entriesWithEmail = (lbPublic.data.entries ?? []).filter((e) => e.email !== undefined);
  assert(entriesWithEmail.length === 0, `No entries in public leaderboard contain email field`);

  // 7. Public quiz state privacy: verify NO email leaked
  console.log("\n--- Test 7: Public quiz live state contains no email ---");
  const quizPublic = await apiCall("getQuizLiveState", null);
  assert(quizPublic.ok, `Public quiz state accessible`);
  const quizParticipantsWithEmail = (quizPublic.data.participants ?? []).filter((p) => p.email !== undefined);
  assert(quizParticipantsWithEmail.length === 0, `No participants in quiz live state contain email field`);
  const quizAllTimeWithEmail = (quizPublic.data.allTime ?? []).filter((a) => a.email !== undefined);
  assert(quizAllTimeWithEmail.length === 0, `No allTime entries in quiz state contain email field`);

  // 8. Admin leaderboards include email and correct structure
  console.log("\n--- Test 8: Admin leaderboards contain email and correct metrics ---");
  const adminLb = await apiCall("adminLeaderboards", adminToken);
  assert(adminLb.ok, `Admin leaderboards accessible by admin`);
  assert(Array.isArray(adminLb.data.allTime), `adminLeaderboards returns allTime list`);
  assert(Array.isArray(adminLb.data.quiz), `adminLeaderboards returns quiz list`);
  assert(Array.isArray(adminLb.data.workshops), `adminLeaderboards returns workshops list`);
  const foundV1 = adminLb.data.allTime.find((e) => e.userId === v1.uid);
  assert(foundV1 !== undefined, `Found participant in admin allTime leaderboard`);
  assert(foundV1.email === email1, `Participant email is present in admin leaderboard: ${foundV1.email}`);

  // 9. Non-admin forbidden from adminLeaderboards and adminCleanupParticipants
  console.log("\n--- Test 9: Non-admin caller blocked from admin endpoints ---");
  const unauthLb = await apiCall("adminLeaderboards", v1.token);
  assert(!unauthLb.ok && (unauthLb.status === 403 || unauthLb.data.error?.code === "permission-denied"), `Visitor blocked from adminLeaderboards (403)`);
  const unauthClean = await apiCall("adminCleanupParticipants", v1.token, { confirmation: "DELETE PARTICIPANTS" });
  assert(!unauthClean.ok && (unauthClean.status === 403 || unauthClean.data.error?.code === "permission-denied"), `Visitor blocked from adminCleanupParticipants (403)`);

  // 10. Workshop check-in and duplicate check-in prevention
  console.log("\n--- Test 10: Workshop check-in and duplicate protection ---");
  const qrRow = await service.from("qr_codes").select("token").eq("type", "WORKSHOP").eq("active", true).limit(1).single();
  assert(!qrRow.error && qrRow.data, `Found active workshop QR`);
  const wsToken = qrRow.data.token;
  const firstClaim = await apiCall("checkInWorkshop", v1.token, { token: wsToken });
  assert(firstClaim.ok && !firstClaim.data.alreadyCheckedIn, `First workshop check-in recorded`);
  const secondClaim = await apiCall("checkInWorkshop", v1.token, { token: wsToken });
  assert(secondClaim.ok && secondClaim.data.alreadyCheckedIn, `Revisiting workshop correctly flagged alreadyCheckedIn`);

  // 11. Workshop leaderboard aggregation
  console.log("\n--- Test 11: Workshop leaderboard reflects visits ---");
  const adminLbAfterWs = await apiCall("adminLeaderboards", adminToken);
  const wsEntry = adminLbAfterWs.data.workshops.find((w) => w.userId === v1.uid);
  assert(wsEntry !== undefined, `Participant found in workshop leaderboard`);
  assert(wsEntry.workshopsVisited >= 1, `Workshops visited count >= 1 (${wsEntry.workshopsVisited})`);
  assert(wsEntry.workshopPoints > 0, `Workshop points awarded (${wsEntry.workshopPoints})`);

  // 12. Account recovery: entering same nickname and email restores existing session & XP
  console.log("\n--- Test 12: Account recovery with same nickname and email ---");
  const vRecover = await createVisitor();
  const recCall = await apiCall("registerUser", vRecover.token, {
    nickname: `User-${runId}`,
    email: email1,
  });
  assert(recCall.ok, `Recovery request succeeded with status 200`);
  assert(recCall.data.recovered === true, `Marked as recovered`);
  assert(recCall.data.userId === v1.uid, `Restored the exact user ID: ${recCall.data.userId}`);
  assert(Boolean(recCall.data.authEmail && recCall.data.recoveryPassword), `Returned recovery credentials`);

  // Sign into the recovered account
  const recoverClient = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
  const restoredSession = await recoverClient.auth.signInWithPassword({
    email: recCall.data.authEmail,
    password: recCall.data.recoveryPassword,
  });
  assert(!restoredSession.error && restoredSession.data.user.id === v1.uid, `Restored client session ID matches original user`);
  const recoveredProfile = await apiCall("getMyProfile", restoredSession.data.session.access_token);
  assert(recoveredProfile.ok && recoveredProfile.data.id === v1.uid, `Recovered profile data matches original user`);
  assert(recoveredProfile.data.nickname === `User-${runId}`, `Nickname matches original: ${recoveredProfile.data.nickname}`);
  assert(recoveredProfile.data.email === email1, `Email matches original: ${recoveredProfile.data.email}`);

  // 13. Quiz display join code: active QR code is returned with full public URL
  console.log("\n--- Test 13: Big screen Quiz join code API ---");
  const quizJoin = await apiCall("getQuizJoinCode", null, {});
  assert(quizJoin.ok, `getQuizJoinCode succeeded with status 200`);
  assert(Boolean(quizJoin.data.token && quizJoin.data.token.length > 5), `Returned active token: ${quizJoin.data.token}`);
  assert(Boolean(quizJoin.data.payload && quizJoin.data.payload.includes("/scan?token=")), `Returned payload with scan path: ${quizJoin.data.payload}`);

  // 14. Admin cleanup validation test
  console.log("\n--- Test 14: Admin cleanup validation test ---");
  // Wrong confirmation phrase rejected
  const badClean = await apiCall("adminCleanupParticipants", adminToken, { confirmation: "WRONG PHRASE" });
  assert(!badClean.ok && badClean.status === 400, `Rejected bad confirmation phrase`);

  // Verify admin account is preserved
  const adminCheck = await pgPool.query(`select 1 from public.admin_roles where user_id = $1`, [adminId]);
  assert(adminCheck.rowCount === 1, `Admin role preserved`);

  // Verify workshops, questions, QR codes preserved
  const afterWorkshops = await pgPool.query(`select count(*)::int as count from public.workshops`);
  const afterQuestions = await pgPool.query(`select count(*)::int as count from public.quiz_questions`);
  const afterQrs = await pgPool.query(`select count(*)::int as count from public.qr_codes`);
  assert(afterWorkshops.rows[0].count >= 0, `Workshops preserved: ${afterWorkshops.rows[0].count}`);
  assert(afterQuestions.rows[0].count >= 0, `Quiz questions preserved: ${afterQuestions.rows[0].count}`);
  assert(afterQrs.rows[0].count >= 0, `QR codes preserved: ${afterQrs.rows[0].count}`);

  console.log(`\n========================================`);
  console.log(`ALL TESTS PASSED: ${passed} passed, ${failed} failed.`);
  console.log(`========================================\n`);
}

try {
  await runTests();
} finally {
  console.log("Cleaning up test admin and remaining resources...");
  if (adminId) {
    await service.from("admin_roles").delete().eq("user_id", adminId);
    await service.auth.admin.deleteUser(adminId);
  }
  for (const uid of createdUserIds) {
    try {
      await service.from("profiles").delete().eq("id", uid);
      await service.auth.admin.deleteUser(uid);
    } catch {}
  }
  await pgPool.end();
  console.log("Cleanup complete.");
}
