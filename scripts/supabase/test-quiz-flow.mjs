import nextEnv from "@next/env";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());
const appUrl = process.argv[2] ?? "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const service = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

async function callable(name, token, data = {}) {
  const response = await fetch(`${appUrl}/api/call/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(data),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${name} failed (${response.status}): ${JSON.stringify(payload)}`);
  return payload;
}

const suffix = randomUUID();
const adminEmail = `quiz-admin-${suffix}@guest.unibyte.invalid`;
const adminPassword = randomBytes(32).toString("base64url");
const createdAdmin = await service.auth.admin.createUser({
  email: adminEmail,
  password: adminPassword,
  email_confirm: true,
  app_metadata: { role: "admin" },
});
if (createdAdmin.error || !createdAdmin.data.user) throw createdAdmin.error ?? new Error("Admin creation failed");
const adminId = createdAdmin.data.user.id;
await service.from("admin_roles").upsert({ user_id: adminId, role: "admin" });

const adminClient = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
const adminSignIn = await adminClient.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
if (adminSignIn.error || !adminSignIn.data.session) throw adminSignIn.error ?? new Error("Admin sign-in failed");
const adminToken = adminSignIn.data.session.access_token;

const visitorClient = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
const visitorSignIn = await visitorClient.auth.signInAnonymously();
if (visitorSignIn.error || !visitorSignIn.data.session) throw visitorSignIn.error ?? new Error("Visitor sign-in failed");
const visitorId = visitorSignIn.data.user.id;
const visitorToken = visitorSignIn.data.session.access_token;
let sessionId;

try {
  const bank = await callable("adminListQuizQuestions", adminToken);
  if (bank.count < 500) throw new Error(`Question bank is too small: ${bank.count}`);

  const started = await callable("adminCreateQuizSession", adminToken);
  sessionId = started.sessionId;
  if (started.bankSize < 500) throw new Error(`Active unique bank is too small: ${started.bankSize}`);

  await callable("registerUser", visitorToken, {
    nickname: `QuizTest-${visitorId.slice(0, 8)}`,
    email: `quiztest-${visitorId.slice(0, 8)}@test.unibyte.invalid`,
  });
  const qr = await service.from("qr_codes").select("token").eq("type", "QUIZ").eq("active", true).limit(1).single();
  if (qr.error || !qr.data) throw qr.error ?? new Error("No active quiz QR");
  const joined = await callable("joinQuiz", visitorToken, { token: qr.data.token });
  if (joined.sessionId !== sessionId) throw new Error("Visitor joined the wrong quiz session");

  const live = await callable("getQuizLiveState", visitorToken, { participantLimit: 10, leaderboardLimit: 3 });
  const questionId = live.session?.currentQuestionId;
  if (!questionId) throw new Error("Live quiz has no current question");
  const question = await service.from("quiz_questions").select("correct_answer").eq("id", questionId).single();
  if (question.error || !question.data) throw question.error ?? new Error("Question lookup failed");
  const first = await callable("submitQuizAnswer", visitorToken, {
    sessionId,
    questionId,
    answerIndex: question.data.correct_answer,
  });
  const second = await callable("submitQuizAnswer", visitorToken, {
    sessionId,
    questionId,
    answerIndex: question.data.correct_answer,
  });
  if (!first.correct || first.alreadyAnswered || !second.alreadyAnswered) {
    throw new Error("Quiz scoring or duplicate protection failed");
  }
  await callable("adminEndQuizSession", adminToken, { sessionId });
  console.log(`Quiz start/join/answer/duplicate/end passed with ${bank.count} questions (${started.bankSize} unique active).`);
} finally {
  if (sessionId) {
    await service.from("quiz_answers").delete().eq("session_id", sessionId);
    await service.from("quiz_participants").delete().eq("session_id", sessionId);
    await service.from("quiz_sessions").delete().eq("id", sessionId);
  }
  await service.from("xp_events").delete().eq("user_id", visitorId);
  await service.from("leaderboard").delete().eq("user_id", visitorId);
  await service.from("profiles").delete().eq("id", visitorId);
  await service.from("admin_roles").delete().eq("user_id", adminId);
  await service.auth.admin.deleteUser(visitorId);
  await service.auth.admin.deleteUser(adminId);
}
