import type { QuizSession, TimestampLike } from "./models";

export const QUESTION_DURATION_SEC = 30;
export const REVEAL_DURATION_SEC = 5;
export const ANSWER_DURATION_SEC = QUESTION_DURATION_SEC - REVEAL_DURATION_SEC; // 25s
export const ROUND_QUESTION_COUNT = 10;
export const ROUND_DURATION_SEC = QUESTION_DURATION_SEC * ROUND_QUESTION_COUNT;
export const QUIZ_CATEGORIES_COUNT = 6;

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
 * When the question bank is interleaved across categories (slots modulo numCategories),
 * this shuffles within each category stream so that consecutive questions rotate
 * smoothly across categories (Cat A -> Cat B -> Cat C ...) and never repeat the same
 * topic in a row.
 */
export function shuffleQuizBank(
  questionIds: string[],
  seed: number,
  cycle: number,
  numCategories = QUIZ_CATEGORIES_COUNT,
): string[] {
  if (!questionIds || questionIds.length === 0) return [];
  if (questionIds.length < numCategories || numCategories <= 1) {
    const output = [...questionIds];
    const random = seededRandom((seed ^ Math.imul(cycle + 1, 0x9e3779b9)) >>> 0);
    for (let index = output.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [output[index], output[swapIndex]] = [output[swapIndex]!, output[index]!];
    }
    return output;
  }

  const output = new Array<string>(questionIds.length);
  for (let k = 0; k < numCategories; k += 1) {
    const indices: number[] = [];
    const items: string[] = [];
    for (let i = k; i < questionIds.length; i += numCategories) {
      indices.push(i);
      items.push(questionIds[i]!);
    }
    const random = seededRandom((seed ^ (k * 0x45d9f3b) ^ Math.imul(cycle + 1, 0x9e3779b9)) >>> 0);
    for (let index = items.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [items[index], items[swapIndex]] = [items[swapIndex]!, items[index]!];
    }
    for (let itemIdx = 0; itemIdx < items.length; itemIdx += 1) {
      output[indices[itemIdx]!] = items[itemIdx]!;
    }
  }
  return output;
}

export interface QuizClockResult {
  absoluteQuestionIndex: number;
  bankCycle: number;
  bankQuestionIndex: number;
  bankSize: number;
  questionIndex: number;
  questionId: string | null;
  /** Remaining answering seconds (counts down from 25 to 0). Zero during reveal phase. */
  questionRemainingSec: number;
  roundRemainingSec: number;
  roundNumber: number;
  ended: boolean;
  /** True during the final 5-second reveal intermission of the question slot */
  isRevealing: boolean;
  /** Seconds remaining in the answering window (25 down to 0) */
  answeringRemainingSec: number;
  /** Seconds remaining in the reveal window (5 down to 0) */
  revealRemainingSec: number;
}

export function getQuizClock(session: QuizSession, at = Date.now()): QuizClockResult {
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
  const questionElapsedSec = Math.floor(questionElapsedMs / 1000);

  // Reveal phase occurs during the last REVEAL_DURATION_SEC (default 5s) of the question slot
  const answerWindowSec = Math.max(5, questionDurationSec - REVEAL_DURATION_SEC);
  const isRevealing = questionElapsedSec >= answerWindowSec;
  const answeringRemainingSec = Math.max(0, Math.ceil((answerWindowSec * 1000 - questionElapsedMs) / 1000));
  const revealRemainingSec = isRevealing
    ? Math.max(0, Math.ceil((questionDurationSec * 1000 - questionElapsedMs) / 1000))
    : 0;

  // questionRemainingSec is the active answering countdown
  const questionRemainingSec = isRevealing ? 0 : answeringRemainingSec;

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
    isRevealing: ended ? false : isRevealing,
    answeringRemainingSec: ended ? 0 : answeringRemainingSec,
    revealRemainingSec: ended ? 0 : revealRemainingSec,
  };
}
