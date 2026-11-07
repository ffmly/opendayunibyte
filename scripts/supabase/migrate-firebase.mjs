import nextEnv from "@next/env";
import admin from "firebase-admin";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing");
const rootFiles = await readdir(process.cwd());
const serviceFile = rootFiles.find((name) => name.includes("firebase-adminsdk") && name.endsWith(".json"));
if (!serviceFile) throw new Error("Firebase service-account JSON was not found in the project root");

const credential = JSON.parse(await readFile(path.join(process.cwd(), serviceFile), "utf8"));
admin.initializeApp({ credential: admin.credential.cert(credential) });
const firestore = admin.firestore();

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function iso(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return null;
}

function quote(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function upsert(table, row, primaryKey) {
  const columns = Object.keys(row);
  const values = columns.map((column) => row[column]);
  const updates = columns
    .filter((column) => column !== primaryKey)
    .map((column) => `${quote(column)} = excluded.${quote(column)}`)
    .join(", ");
  const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
  const sql = `insert into public.${quote(table)} (${columns.map(quote).join(", ")}) values (${placeholders}) on conflict (${quote(primaryKey)}) do update set ${updates}`;
  await client.query(sql, values);
}

async function docs(collection) {
  const snapshot = await firestore.collection(collection).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

const counts = {};
async function migrate(collection, table, transform, primaryKey = "id") {
  const source = await docs(collection);
  for (const item of source) await upsert(table, transform(item), primaryKey);
  counts[collection] = source.length;
  return source;
}

await client.connect();
try {
  await client.query("begin");

  const firebaseUsers = [];
  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    firebaseUsers.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);

  const profileDocs = await docs("users");
  const profileIds = new Set(profileDocs.map((item) => item.id));
  for (const user of firebaseUsers) {
    await upsert("legacy_firebase_auth_users", {
      firebase_uid: user.uid,
      email: user.email ?? null,
      display_name: user.displayName ?? null,
      disabled: user.disabled,
      custom_claims: user.customClaims ?? {},
      created_at: user.metadata.creationTime ? new Date(user.metadata.creationTime).toISOString() : null,
      last_sign_in_at: user.metadata.lastSignInTime ? new Date(user.metadata.lastSignInTime).toISOString() : null,
    }, "firebase_uid");
    if (!profileIds.has(user.uid)) {
      const nickname = user.displayName || user.email?.split("@")[0] || `legacy-${user.uid.slice(0, 8)}`;
      await upsert("profiles", {
        id: user.uid,
        nickname,
        nickname_key: `${nickname.toLowerCase()}-${user.uid.slice(0, 6)}`,
        total_xp: 0,
        status: user.disabled ? "disabled" : "active",
        created_at: user.metadata.creationTime ? new Date(user.metadata.creationTime).toISOString() : new Date().toISOString(),
        last_active_at: user.metadata.lastSignInTime ? new Date(user.metadata.lastSignInTime).toISOString() : new Date().toISOString(),
        legacy_firebase: true,
      }, "id");
    }
  }
  counts.firebaseAuthUsers = firebaseUsers.length;

  for (const item of profileDocs) {
    await upsert("profiles", {
      id: item.id,
      nickname: String(item.nickname ?? `legacy-${item.id.slice(0, 8)}`),
      nickname_key: String(item.nicknameKey ?? item.nickname ?? item.id).toLowerCase(),
      total_xp: Number(item.totalXP ?? 0),
      status: item.status === "disabled" ? "disabled" : "active",
      created_at: iso(item.createdAt) ?? new Date().toISOString(),
      last_active_at: iso(item.lastActiveAt) ?? iso(item.createdAt) ?? new Date().toISOString(),
      legacy_firebase: true,
    }, "id");
  }
  counts.users = profileDocs.length;

  // Some early test records reference Firebase users that were later deleted
  // from both Auth and the users collection. Preserve those ledgers by adding
  // disabled legacy profiles instead of dropping valid historical rows.
  const referencedUsers = new Map();
  const userReferences = [
    ["xpEvents", "userId"], ["catFinds", "userId"],
    ["workshopCheckins", "userId"], ["quizParticipants", "userId"],
    ["quizAnswers", "userId"], ["gameScores", "userId"],
    ["passwordAttempts", "userId"], ["mysteryAttempts", "userId"],
    ["challengeClaims", "userId"],
  ];
  for (const [collection, field] of userReferences) {
    for (const item of await docs(collection)) {
      const uid = item[field];
      if (uid) referencedUsers.set(String(uid), String(item.nickname ?? ""));
    }
  }
  for (const item of await docs("leaderboard")) {
    referencedUsers.set(item.id, String(item.nickname ?? ""));
  }
  const knownProfiles = new Set([
    ...profileDocs.map((item) => item.id),
    ...firebaseUsers.map((item) => item.uid),
  ]);
  for (const [uid, savedNickname] of referencedUsers) {
    if (knownProfiles.has(uid)) continue;
    const nickname = savedNickname || `legacy-${uid.slice(0, 8)}`;
    await upsert("profiles", {
      id: uid,
      nickname,
      nickname_key: nickname.toLowerCase(),
      total_xp: 0,
      status: "disabled",
      created_at: new Date().toISOString(),
      last_active_at: new Date().toISOString(),
      legacy_firebase: true,
    }, "id");
    knownProfiles.add(uid);
  }
  counts.recoveredDeletedUsers = [...referencedUsers.keys()].filter((uid) =>
    !profileIds.has(uid) && !firebaseUsers.some((user) => user.uid === uid)
  ).length;

  await migrate("admins", "admin_roles", (item) => ({
    user_id: item.id,
    role: item.role === "staff" ? "staff" : "admin",
    created_at: iso(item.createdAt) ?? new Date().toISOString(),
    legacy_firebase: true,
  }), "user_id");

  await migrate("activities", "activities", (item) => ({
    id: item.id, name: String(item.name ?? item.id), description: String(item.description ?? ""),
    points: Number(item.points ?? item.xp ?? 0), active: item.active !== false,
  }));
  await migrate("cats", "cats", (item) => ({
    id: item.id, number: Number(item.number), code: String(item.code), name: String(item.name),
    rarity: item.rarity === "rare" ? "rare" : "normal", xp: Number(item.xp ?? 0), active: item.active !== false,
  }));
  await migrate("workshops", "workshops", (item) => ({
    id: item.id, code: String(item.code), title: String(item.title), location: String(item.location ?? ""),
    summary: String(item.summary ?? ""), post_image_url: String(item.postImageUrl ?? ""),
    content_url: String(item.contentUrl ?? ""), xp: Number(item.xp ?? 0), active: item.active !== false,
    start_at: iso(item.startAt), end_at: iso(item.endAt),
  }));

  const settings = await docs("settings");
  for (const item of settings) {
    if (item.id !== "rewards") continue;
    await upsert("reward_settings", {
      id: "rewards", registration: Number(item.registration ?? 50), workshop: Number(item.workshop ?? 100),
      cat: Number(item.cat ?? 100), rare_cat: Number(item.rareCat ?? 250), password: Number(item.password ?? 500),
      mystery: Number(item.mystery ?? 500), quiz_correct: Number(item.quizCorrect ?? 100),
      memory_base: Number(item.memoryBase ?? 75), updated_at: new Date().toISOString(),
    }, "id");
  }
  counts.settings = settings.length;

  const questionDocs = await migrate("quizQuestions", "quiz_questions", (item) => ({
    id: item.id, question: String(item.question), options: item.options ?? [],
    correct_answer: Number(item.correctAnswer), points: Number(item.points ?? 100), active: item.active !== false,
    seconds: Number(item.seconds ?? 30), category: item.category ? String(item.category) : null,
    bank_version: item.bankVersion == null ? null : Number(item.bankVersion),
    created_at: iso(item.createdAt) ?? iso(item.updatedAt) ?? new Date().toISOString(),
    updated_at: iso(item.updatedAt) ?? iso(item.createdAt) ?? new Date().toISOString(),
  }));
  const questionIds = new Set(questionDocs.map((item) => item.id));

  const sessionDocs = await migrate("quizSessions", "quiz_sessions", (item) => ({
    id: item.id, activity_id: String(item.activityId ?? "quiz"),
    status: ["waiting", "active", "question", "ended"].includes(item.status) ? item.status : "ended",
    current_question_index: Number(item.currentQuestionIndex ?? 0),
    current_question_id: questionIds.has(String(item.currentQuestionId ?? "")) ? String(item.currentQuestionId) : null,
    question_order: (item.questionOrder ?? []).filter((id) => questionIds.has(String(id))).map(String),
    total_questions: Number(item.totalQuestions ?? 10),
    questions_per_round: item.questionsPerRound == null ? null : Number(item.questionsPerRound),
    bank_size: item.bankSize == null ? null : Number(item.bankSize),
    shuffle_seed: item.shuffleSeed == null ? null : Number(item.shuffleSeed),
    started_at: iso(item.startedAt), ends_at: iso(item.endsAt),
    question_duration_sec: Number(item.questionDurationSec ?? 30), round_duration_sec: Number(item.roundDurationSec ?? 300),
    continuous: item.continuous !== false, station_id: item.stationId == null ? null : String(item.stationId),
  }));
  const sessionIds = sessionDocs.map((item) => item.id).sort((a, b) => b.length - a.length);

  await migrate("quizParticipants", "quiz_participants", (item) => {
    const sessionId = item.sessionId ?? sessionIds.find((id) => item.id.startsWith(`${id}_`));
    if (!sessionId) throw new Error(`Cannot resolve quiz session for participant ${item.id}`);
    return {
      id: item.id, session_id: String(sessionId), user_id: String(item.userId), nickname: String(item.nickname ?? "Player"),
      points: Number(item.points ?? 0), round_number: item.roundNumber == null ? null : Number(item.roundNumber),
      round_points: Number(item.roundPoints ?? 0), joined_at: iso(item.joinedAt) ?? new Date().toISOString(),
    };
  });
  await migrate("quizAnswers", "quiz_answers", (item) => ({
    id: item.id, session_id: String(item.sessionId), user_id: String(item.userId), question_id: String(item.questionId),
    round_number: Number(item.roundNumber ?? 1), answer_index: Number(item.answerIndex), correct: Boolean(item.correct),
    points: Number(item.points ?? 0), latency_ms: Number(item.latencyMs ?? 0), created_at: iso(item.createdAt) ?? new Date().toISOString(),
  }));

  await migrate("leaderboard", "leaderboard", (item) => ({
    user_id: item.id, nickname: String(item.nickname ?? "Player"), total_xp: Number(item.totalXP ?? 0),
    updated_at: iso(item.updatedAt) ?? new Date().toISOString(),
  }), "user_id");
  await migrate("xpEvents", "xp_events", (item) => ({
    id: item.id, user_id: String(item.userId), type: String(item.type), source_id: String(item.sourceId ?? "legacy"),
    points: Number(item.points ?? 0), metadata: item.metadata ?? {}, created_at: iso(item.createdAt) ?? new Date().toISOString(),
  }));

  await migrate("qrCodes", "qr_codes", (item) => ({
    token: String(item.token ?? item.id), type: String(item.type), target_id: String(item.targetId),
    label: item.label == null ? null : String(item.label), active: item.active !== false,
    created_at: iso(item.createdAt) ?? new Date().toISOString(),
  }), "token");

  await migrate("catFinds", "cat_finds", (item) => ({
    id: item.id, user_id: String(item.userId), cat_id: String(item.catId),
    cat_number: item.catNumber == null ? null : Number(item.catNumber), points: Number(item.points ?? 0),
    created_at: iso(item.createdAt) ?? new Date().toISOString(),
  }));
  await migrate("workshopCheckins", "workshop_checkins", (item) => ({
    id: item.id, user_id: String(item.userId), workshop_id: String(item.workshopId), points: Number(item.points ?? 0),
    created_at: iso(item.createdAt) ?? new Date().toISOString(),
  }));

  await migrate("gameSessions", "game_sessions", (item) => ({
    id: item.id, game_key: String(item.gameKey), activity_id: item.activityId == null ? null : String(item.activityId),
    status: ["waiting", "active", "ended"].includes(item.status) ? item.status : "ended",
    started_at: iso(item.startedAt), ends_at: iso(item.endsAt), station_id: item.stationId == null ? null : String(item.stationId),
    meta: item.meta ?? {},
  }));
  await migrate("gameScores", "game_scores", (item) => ({
    id: item.id, user_id: String(item.userId), game_key: String(item.gameKey),
    session_id: item.sessionId == null ? null : String(item.sessionId), score: Number(item.score ?? 0),
    proof: item.proof == null ? null : String(item.proof), points: Number(item.points ?? 0),
    created_at: iso(item.createdAt) ?? new Date().toISOString(),
  }));

  for (const key of ["password", "mystery"]) {
    await migrate(`${key}Challenges`, `${key}_challenges`, (item) => ({
      id: item.id, name: String(item.name ?? key), solution: String(item.solution ?? ""), active: item.active !== false,
    }));
    await migrate(`${key}Attempts`, `${key}_attempts`, (item) => ({
      id: item.id, user_id: String(item.userId), answer_hash: String(item.answerHash ?? ""),
      correct: Boolean(item.correct), created_at: iso(item.createdAt) ?? new Date().toISOString(),
    }));
  }
  await migrate("challengeClaims", "challenge_claims", (item) => ({
    id: item.id, game_key: String(item.gameKey), user_id: String(item.userId), points: Number(item.points ?? 0),
    solved_at: iso(item.solvedAt) ?? new Date().toISOString(),
  }));

  await migrate("campaigns", "campaigns", (item) => ({
    id: item.id, claimed: Number(item.claimed ?? 0), limit: Number(item.limit ?? 15), active: item.active !== false,
    updated_at: iso(item.updatedAt) ?? new Date().toISOString(),
  }));
  await migrate("canvaGiveawayEntries", "canva_giveaway_entries", (item) => ({
    id: item.id, campaign_id: String(item.campaignId), full_name: String(item.fullName ?? ""), email: String(item.email ?? ""),
    study_year: item.studyYear == null ? null : String(item.studyYear),
    heard_about_unibyte: item.heardAboutUnibyte == null ? null : String(item.heardAboutUnibyte),
    will_attend: item.willAttend == null ? null : String(item.willAttend),
    discovery_source: item.discoverySource == null ? null : String(item.discoverySource),
    interest: item.interest == null ? null : String(item.interest),
    preferred_activity: item.preferredActivity == null ? null : String(item.preferredActivity),
    quiz_answers: JSON.stringify(item.quizAnswers ?? []), score: Number(item.score ?? 0), winner: Boolean(item.winner),
    rank: item.rank == null ? null : Number(item.rank), activated: Boolean(item.activated),
    submitted_at: iso(item.submittedAt) ?? new Date().toISOString(),
  }));

  await client.query("commit");
  console.log(JSON.stringify({ migrated: true, counts }, null, 2));
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
  await admin.app().delete();
}
