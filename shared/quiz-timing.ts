import type { QuizSession, TimestampLike } from "./models";

export const QUESTION_DURATION_SEC = 30;
export const ROUND_QUESTION_COUNT = 10;
export const ROUND_DURATION_SEC = QUESTION_DURATION_SEC * ROUND_QUESTION_COUNT;

export function timestampToMillis(value: TimestampLike | null | undefined): number {
  if (!value) return 0;
  if (typeof value === "string") return Date.parse(value) || 0;
  if (value instanceof Date) return value.getTime();
  if ("toMillis" in value && typeof value.toMillis === "function") {
    return value.toMillis();
  }
  if ("seconds" in value && typeof value.seconds === "number") {
    return value.seconds * 1000;
  }
  return 0;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Produce the deterministic shuffle used by the TV, phones and server.
 * A different cycle number creates a fresh order, while every client still
 * resolves the exact same active question from the session clock.
 */
export function shuffleQuizBank(
  questionIds: string[],
  seed: number,
  cycle: number,
): string[] {
  const output = [...questionIds];
  const random = seededRandom((seed ^ Math.imul(cycle + 1, 0x9e3779b9)) >>> 0);
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [output[index], output[swapIndex]] = [output[swapIndex]!, output[index]!];
  }
  return output;
}

export function getQuizClock(session: QuizSession, at = Date.now()) {
  const startedAt = timestampToMillis(session.startedAt);
  const questionDurationSec = session.questionDurationSec ?? QUESTION_DURATION_SEC;
  const questionsPerRound = Math.max(
    1,
    session.questionsPerRound ?? session.totalQuestions ?? ROUND_QUESTION_COUNT,
  );
  const roundDurationSec = session.roundDurationSec ?? questionDurationSec * questionsPerRound;
  const elapsedMs = Math.max(0, at - startedAt);
  const absoluteQuestionIndex = Math.floor(elapsedMs / (questionDurationSec * 1000));
  const questionIndex = absoluteQuestionIndex % questionsPerRound;
  const questionElapsedMs = elapsedMs % (questionDurationSec * 1000);
  const questionRemainingSec = Math.max(
    0,
    Math.ceil((questionDurationSec * 1000 - questionElapsedMs) / 1000),
  );
  const roundElapsedMs = elapsedMs % (roundDurationSec * 1000);
  const roundRemainingSec = Math.ceil((roundDurationSec * 1000 - roundElapsedMs) / 1000);
  const roundNumber = Math.floor(absoluteQuestionIndex / questionsPerRound) + 1;
  const bankSize = session.questionOrder.length;
  const bankQuestionIndex = bankSize > 0 ? absoluteQuestionIndex % bankSize : -1;
  const bankCycle = bankSize > 0 ? Math.floor(absoluteQuestionIndex / bankSize) : 0;
  const shuffledBank = bankSize > 0
    ? shuffleQuizBank(session.questionOrder, session.shuffleSeed ?? 1, bankCycle)
    : [];
  const ended =
    !startedAt ||
    session.status === "ended" ||
    (!session.continuous && elapsedMs >= roundDurationSec * 1000);

  return {
    absoluteQuestionIndex,
    bankCycle,
    bankQuestionIndex,
    bankSize,
    questionIndex,
    questionId: bankQuestionIndex >= 0 ? shuffledBank[bankQuestionIndex] ?? null : null,
    questionRemainingSec: ended ? 0 : questionRemainingSec,
    roundRemainingSec,
    roundNumber,
    ended,
  };
}
