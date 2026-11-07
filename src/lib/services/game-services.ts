import { call } from "@/lib/supabase/callable";
import type { QrType, GameKey } from "@shared/models";

export interface ProcessQrResult {
  qrType: QrType;
  targetId: string;
  targetName?: string;
  label?: string;
  points?: number;
  rarity?: "normal" | "rare";
  requiresRegistration?: boolean;
  claimStatus?: "new" | "already_claimed" | "inactive" | "invalid" | "entry";
  sessionId?: string;
}

export function processQRCode(token: string): Promise<ProcessQrResult> {
  return call<{ token: string }, ProcessQrResult>("processQRCode", { token });
}

export interface FindCatResult {
  catId: string;
  catNumber: number;
  points: number;
  alreadyFound?: boolean;
}

export function findCat(token: string): Promise<FindCatResult> {
  return call<{ token: string }, FindCatResult>("findCat", { token });
}

export interface WorkshopResult {
  workshopId: string;
  points: number;
  alreadyCheckedIn?: boolean;
  workshop: {
    title: string;
    location: string;
    summary: string;
    postImageUrl: string;
    contentUrl: string;
  };
}

export function checkInWorkshop(token: string): Promise<WorkshopResult> {
  return call<{ token: string }, WorkshopResult>("checkInWorkshop", { token });
}

export interface QuizJoinResult {
  sessionId: string;
}

export function joinQuiz(token: string): Promise<QuizJoinResult> {
  return call<{ token: string }, QuizJoinResult>("joinQuiz", { token });
}

export interface GameJoinResult {
  sessionId: string;
  gameKey: GameKey;
}

export function joinGameSession(token: string): Promise<GameJoinResult> {
  return call<{ token: string }, GameJoinResult>("joinGameSession", { token });
}

export interface ChallengeStartResult {
  gameKey: GameKey;
  challengeId: string;
  title?: string;
}

export function startPassword(token: string): Promise<ChallengeStartResult> {
  return call<{ token: string }, ChallengeStartResult>("startPassword", { token });
}

export function startMystery(token: string): Promise<ChallengeStartResult> {
  return call<{ token: string }, ChallengeStartResult>("startMystery", { token });
}

export interface SolveResult {
  solved: boolean;
  points: number;
  alreadySolved?: boolean;
}

export function solvePassword(answer: string, token: string): Promise<SolveResult> {
  return call<{ answer: string; token: string }, SolveResult>("solvePassword", {
    answer,
    token,
  });
}

export function solveMystery(answer: string, token: string): Promise<SolveResult> {
  return call<{ answer: string; token: string }, SolveResult>("solveMystery", {
    answer,
    token,
  });
}

export interface SubmitQuizAnswerResult {
  correct: boolean;
  points: number;
  alreadyAnswered?: boolean;
}

export function submitQuizAnswer(input: {
  sessionId: string;
  questionId: string;
  answerIndex: number;
  latencyMs?: number;
}): Promise<SubmitQuizAnswerResult> {
  return call("submitQuizAnswer", input);
}

export interface SubmitScoreResult {
  points: number;
}

export function submitGameScore(input: {
  gameKey: GameKey;
  sessionId?: string;
  score: number;
  proof?: string;
}): Promise<SubmitScoreResult> {
  return call("submitGameScore", input);
}

export interface RankResult {
  rank: number;
  totalUsers: number;
}

export function getMyRank(): Promise<RankResult> {
  return call<undefined, RankResult>("getMyRank");
}
