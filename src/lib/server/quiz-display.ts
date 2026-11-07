import { db, validate, apiError } from "./common";
import { z } from "zod";
import { buildPublicQrUrl } from "@/lib/qr/parse";

/**
 * getQuizDisplayQuestion — returns a question WITHOUT the correct answer.
 * Used by both the big screen and phone controllers. Public by design: the
 * question is projected on a screen for the whole audience anyway, and the
 * correct answer is never exposed.
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
    question: q.question ?? "",
    options: q.options ?? [],
    points: q.points ?? 0,
  };
}

/** Public only because this exact code is displayed on the projector. */
export async function getQuizJoinCode() {
  const snap = await db.collection("qrCodes").where("type", "==", "QUIZ").get();
  const qr = snap.docs.map((d) => d.data()).find((item) => item?.active === true);
  if (!qr?.token) apiError("not-found", "No active quiz QR is configured.");
  const token = String(qr.token);
  return { token, payload: buildPublicQrUrl(token) };
}
