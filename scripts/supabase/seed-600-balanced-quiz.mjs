import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

import { rawCS } from "./quiz_data/cs.mjs";
import { rawMusic } from "./quiz_data/music.mjs";
import { rawMindGames } from "./quiz_data/mind_games.mjs";
import { rawLogic } from "./quiz_data/logic.mjs";
import { rawCrackTheCode } from "./quiz_data/crack_the_code.mjs";
import { rawSequences } from "./quiz_data/sequences.mjs";
import { rawFun } from "./quiz_data/fun.mjs";

nextEnv.loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const databaseUrl = process.env.DATABASE_URL;

if (!url || !secret || !databaseUrl) {
  throw new Error("Missing Supabase configuration");
}

const supabase = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const pgPool = new pg.Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

// Overrides for crack_the_code duplicates
rawCrackTheCode[13] = {
  q: "🔐 فك الشفرة: إذا كانت كلمة 'JAVA' تحولت إلى 'KBWB' بإضافة 1 لكل حرف... فما الكلمة الأصلية التي شُفرت كـ 'MJLF'؟",
  a: "LIKE",
  d: ["LION", "LOVE", "LIVE"],
};

rawCrackTheCode[21] = {
  q: "🔐 ما هو الحرف الإنجليزي التالي في النمط التشفيري لأيام الأسبوع: M, T, W, T, F, [؟]؟",
  a: "S",
  d: ["U", "M", "W"],
};

function cleanOption(text) {
  if (!text) return "";
  let str = String(text).trim();

  // Protect Big-O notation like O(1), O(log n), O(n), O(n²), O(n log n)
  if (/^O\(.*?\)$/i.test(str)) {
    return str;
  }

  // Strip trailing parenthetical explanations e.g. "25 (الفروق: -5...)" -> "25"
  const match = str.match(/^(.*?)\s*\((.*?)\)\s*(!*)$/);
  if (match) {
    const before = match[1].trim();
    if (before.length > 0) {
      str = before;
    }
  }

  // Remove trailing exclamation marks
  str = str.replace(/!+$/, "").trim();
  return str;
}

function seededShuffle(arr, seed) {
  const copy = [...arr];
  let s = seed >>> 0;
  for (let i = copy.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const categories = [
  { key: "cs", name: "علوم الحاسوب والبرمجة", data: rawCS },
  { key: "music", name: "خمن الأغنية والشارة", data: rawMusic },
  { key: "mind_games", name: "ألعاب عقل وفوازير", data: rawMindGames },
  { key: "logic", name: "منطق واستنتاج", data: rawLogic },
  { key: "crack_the_code", name: "فك الشفرة", data: rawCrackTheCode },
  { key: "sequences", name: "متتاليات الأرقام والأنماط", data: rawSequences },
  { key: "fun", name: "أسئلة مرحة وجيمينغ وتيك", data: rawFun },
];

async function seed() {
  console.log("Preparing 700 balanced questions across 7 categories (100 each)...");
  const questionsToInsert = [];
  const answerDistribution = { 0: 0, 1: 0, 2: 0, 3: 0 };

  categories.forEach((cat, catIdx) => {
    if (cat.data.length !== 100) {
      throw new Error(`Category ${cat.key} has ${cat.data.length} questions, expected exactly 100!`);
    }

    cat.data.forEach((item, itemIdx) => {
      const cleanA = cleanOption(item.a);
      const cleanD = item.d.map((d) => cleanOption(d));

      const distinctOptions = new Set([cleanA, ...cleanD].map((x) => x.toLowerCase()));
      if (distinctOptions.size !== 4) {
        throw new Error(
          `Collision in ${cat.key} #${itemIdx}: A="${cleanA}", D=${JSON.stringify(cleanD)}`,
        );
      }

      // Deterministic shuffle seed unique per question
      const seedVal = itemIdx * 37 + catIdx * 1013 + 7919;
      const shuffledOptions = seededShuffle([cleanA, ...cleanD], seedVal);
      const correctIndex = shuffledOptions.indexOf(cleanA);

      if (correctIndex < 0 || correctIndex > 3) {
        throw new Error(`Invalid correct index ${correctIndex} in ${cat.key} #${itemIdx}`);
      }

      answerDistribution[correctIndex]++;

      questionsToInsert.push({
        id: `${cat.key}-${String(itemIdx + 1).padStart(3, "0")}`,
        question: item.q.trim(),
        options: shuffledOptions,
        correct_answer: correctIndex,
        points: 100,
        active: true,
        seconds: 25,
        category: cat.key,
        bank_version: 2,
      });
    });
  });

  console.log(`\nTotal questions prepared: ${questionsToInsert.length}`);
  console.log("Correct answer distribution across options:");
  console.log(`  Option A (0): ${answerDistribution[0]} (${((answerDistribution[0] / questionsToInsert.length) * 100).toFixed(1)}%)`);
  console.log(`  Option B (1): ${answerDistribution[1]} (${((answerDistribution[1] / questionsToInsert.length) * 100).toFixed(1)}%)`);
  console.log(`  Option C (2): ${answerDistribution[2]} (${((answerDistribution[2] / questionsToInsert.length) * 100).toFixed(1)}%)`);
  console.log(`  Option D (3): ${answerDistribution[3]} (${((answerDistribution[3] / questionsToInsert.length) * 100).toFixed(1)}%)`);

  // Clear existing questions from database
  console.log("\nClearing previous questions from Supabase public.quiz_questions...");
  const deleteRes = await pgPool.query("DELETE FROM public.quiz_questions");
  console.log(`Deleted ${deleteRes.rowCount ?? 0} previous questions.`);

  // Batch insert new questions in chunks of 50
  console.log("Inserting 700 new balanced questions into public.quiz_questions...");
  const chunkSize = 50;
  for (let i = 0; i < questionsToInsert.length; i += chunkSize) {
    const chunk = questionsToInsert.slice(i, i + chunkSize);
    const { error } = await supabase.from("quiz_questions").insert(chunk);
    if (error) {
      console.error("Supabase insert error in chunk " + i + ":", error);
      throw error;
    }
  }

  console.log("All 700 questions successfully inserted into Supabase!");

  // Verify in database
  const countRes = await pgPool.query(
    "SELECT category, COUNT(*) as count FROM public.quiz_questions GROUP BY category ORDER BY category",
  );
  console.log("\nDatabase verification per category:");
  console.table(countRes.rows);

  const totalRes = await pgPool.query("SELECT COUNT(*) as total FROM public.quiz_questions");
  console.log(`Total live questions in database: ${totalRes.rows[0].total}`);

  console.log("Ending any existing stale quiz sessions...");
  await pgPool.query("UPDATE public.quiz_sessions SET status = 'ended' WHERE status != 'ended'");

  await pgPool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
