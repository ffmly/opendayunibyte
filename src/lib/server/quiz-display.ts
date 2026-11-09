import { db, validate, apiError } from "./common";
import { getSqlPool } from "./supabase-db";
import { z } from "zod";
import { buildPublicQrUrl } from "@/lib/qr/parse";

/**
 * getQuizDisplayQuestion — returns question details including options, points,
 * the correct answer index, and the category.
 * Used by both the big screen and phone controllers. The UI keeps the correct
 * answer hidden until the answering phase ends and the reveal intermission begins.
 */
export async function getQuizDisplayQuestion(data: unknown) {
  const { questionId } = validate(
    z.object({ questionId: z.string().min(1) }),
    data,
  );
  const snap = await db.collection("quizQuestions").doc(questionId).get();
  if (!snap.exists) apiError("not-found", "Question not found");
  const q = snap.data()!;
  return {
    question: String(q.question ?? ""),
    options: (Array.isArray(q.options) ? q.options : []) as string[],
    points: Number(q.points ?? 100),
    correctAnswer: Number(q.correctAnswer ?? q.correct_answer ?? 0),
    category: String(q.category ?? "general"),
  };
}

/** Public only because this exact code is displayed on the projector. */
export async function getQuizJoinCode() {
  const sql = await getSqlPool().query<{ token: string }>(
    `select token from public.qr_codes where type = 'QUIZ' and active = true limit 1`,
  );
  let token: string | undefined = sql.rows[0]?.token;
  if (!token) {
    const snap = await db.collection("qrCodes").where("type", "==", "QUIZ").get();
    const activeDoc = snap.docs.find((d) => d.data()?.active === true);
    token = activeDoc?.id || (activeDoc?.data() as { token?: string } | undefined)?.token;
  }
  if (!token) apiError("not-found", "No active quiz QR is configured.");
  const tokenStr = String(token);
  return { token: tokenStr, payload: buildPublicQrUrl(tokenStr) };
}
