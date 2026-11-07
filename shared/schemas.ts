import { z } from "zod";
import type { GameKey, QrType } from "./models";

export const nicknameSchema = z
  .string()
  .trim()
  .min(2, "Nickname must be at least 2 characters")
  .max(24, "Nickname must be at most 24 characters")
  .regex(/^[\p{L}\p{N} _-]+$/u, "Only letters, numbers, spaces and - _ allowed");

export const tokenSchema = z.string().trim().min(8).max(64);

export const qrTypeSchema = z.enum([
  "ENTRY",
  "GAME",
  "QUIZ",
  "MEMORY",
  "PASSWORD",
  "MYSTERY",
  "CAT",
  "WORKSHOP",
  "ACTIVITY",
]) satisfies z.ZodType<QrType>;

export const gameKeySchema = z.enum(["QUIZ", "MEMORY", "PASSWORD", "MYSTERY"]);

export const registerUserSchema = z.object({
  nickname: nicknameSchema,
});

export const processQrSchema = z.object({
  token: tokenSchema,
});

export const findCatSchema = z.object({
  token: tokenSchema,
});

export const checkInWorkshopSchema = z.object({
  token: tokenSchema,
});

export const joinGameSchema = z.object({
  token: tokenSchema,
});

export const joinQuizSchema = z.object({
  token: tokenSchema,
});

export const submitQuizAnswerSchema = z.object({
  sessionId: z.string().min(1),
  questionId: z.string().min(1),
  answerIndex: z.number().int().min(0).max(3),
  // Kept optional for backwards-compatible clients. The server computes the
  // trusted latency from the round clock and never trusts this value.
  latencyMs: z.number().int().min(0).max(120000).optional(),
});

export const submitGameScoreSchema = z.object({
  gameKey: gameKeySchema as z.ZodType<GameKey>,
  sessionId: z.string().optional(),
  score: z.number().finite(),
  proof: z.string().optional(),
});

export const solveChallengeSchema = z.object({
  answer: z.string().trim().min(1).max(64),
  token: tokenSchema,
});

export const startChallengeSchema = z.object({
  token: tokenSchema,
});

export const adminAdjustXpSchema = z.object({
  userId: z.string().min(1),
  points: z.number().int().min(-100000).max(100000),
  reason: z.string().trim().min(3).max(200),
});

export const adminSetUserActiveSchema = z.object({
  userId: z.string().min(1),
  active: z.boolean(),
});

export const adminSetRoleSchema = z.object({
  uid: z.string().min(1),
  role: z.enum(["admin", "staff"]),
});

export const adminCreateQrSchema = z.object({
  type: z.enum(["QUIZ", "WORKSHOP"]),
  targetId: z.string().min(1),
  label: z.string().trim().max(60).optional(),
});

export const adminToggleQrSchema = z.object({
  qrId: z.string().min(1),
  active: z.boolean(),
});

export const adminCreateQuizSessionSchema = z.object({
  stationId: z.string().min(1).optional(),
});

export const adminQuizControlSchema = z.object({
  sessionId: z.string().min(1),
  index: z.number().int().min(-1).optional(),
});

export const adminEndQuizSessionSchema = z.object({
  sessionId: z.string().min(1),
});

export const adminCreateQuizQuestionSchema = z.object({
  question: z.string().trim().min(5).max(240),
  options: z
    .array(z.string().trim().min(1).max(120))
    .length(4)
    .refine(
      (options) => new Set(options.map((option) => option.toLocaleLowerCase())).size === 4,
      "Answer options must be unique.",
    ),
  correctAnswer: z.number().int().min(0).max(3),
  points: z.number().int().min(1).max(1000).default(100),
  category: z.string().trim().min(1).max(60).optional(),
});

export const adminDeleteQuizQuestionSchema = z.object({
  questionId: z.string().trim().min(1).max(160),
});

export const adminCreateCatSchema = z.object({
  number: z.number().int().min(1),
  code: z.string().trim().min(1).max(12),
  name: z.string().trim().min(1).max(40),
  rarity: z.enum(["normal", "rare"]),
  xp: z.number().int().min(0).optional(),
});

export const adminCreateWorkshopSchema = z.object({
  code: z.string().trim().min(1).max(12),
  title: z.string().trim().min(1).max(80),
  location: z.string().trim().max(80).optional(),
  summary: z.string().trim().max(800).optional(),
  postImageUrl: z.string().trim().url().max(500).optional(),
  contentUrl: z.string().trim().url().max(500).optional(),
  xp: z.number().int().min(0).optional(),
});

export const adminUpdateRewardsSchema = z.object({
  rewards: z
    .object({
      registration: z.number().int().min(0).optional(),
      workshop: z.number().int().min(0).optional(),
      cat: z.number().int().min(0).optional(),
      rareCat: z.number().int().min(0).optional(),
      password: z.number().int().min(0).optional(),
      mystery: z.number().int().min(0).optional(),
      quizCorrect: z.number().int().min(0).optional(),
      memoryBase: z.number().int().min(0).optional(),
    })
    .passthrough(),
});
