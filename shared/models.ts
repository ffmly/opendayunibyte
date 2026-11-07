/** Shared domain types. Dependency-free so Cloud Functions can import them too. */

export type QrType =
  | "ENTRY"
  | "GAME"
  | "QUIZ"
  | "MEMORY"
  | "PASSWORD"
  | "MYSTERY"
  | "CAT"
  | "WORKSHOP"
  | "ACTIVITY";

export type GameKey = "QUIZ" | "MEMORY" | "PASSWORD" | "MYSTERY";

export type CatRarity = "normal" | "rare";

export type UserStatus = "active" | "disabled";

export interface UserProfile {
  nickname: string;
  totalXP: number;
  createdAt: TimestampLike;
  lastActiveAt: TimestampLike;
  status: UserStatus;
  email: string | null;
}

export interface Activity {
  key: string;
  type: QrType;
  name: string;
  nameAr?: string;
  nameFr?: string;
  xp: number;
  icon?: string;
  active: boolean;
  sort: number;
}

export type XpEventType =
  | "REGISTRATION"
  | "CAT"
  | "WORKSHOP"
  | "QUIZ"
  | "MEMORY"
  | "PASSWORD"
  | "MYSTERY"
  | "ACHIEVEMENT"
  | "ADMIN_ADJUSTMENT";

export interface XpEvent {
  userId: string;
  type: XpEventType;
  sourceId: string;
  points: number;
  createdAt: TimestampLike;
  metadata?: Record<string, unknown>;
}

export interface Cat {
  number: number;
  code: string;
  name: string;
  nameAr?: string;
  nameFr?: string;
  rarity: CatRarity;
  xp: number;
  active: boolean;
}

export interface CatFind {
  userId: string;
  catId: string;
  catNumber: number;
  points: number;
  createdAt: TimestampLike;
}

export interface Workshop {
  code: string;
  title: string;
  titleAr?: string;
  titleFr?: string;
  location?: string;
  startAt?: TimestampLike;
  endAt?: TimestampLike;
  xp: number;
  active: boolean;
  summary?: string;
  postImageUrl?: string;
  contentUrl?: string;
}

export interface WorkshopCheckin {
  userId: string;
  workshopId: string;
  points: number;
  createdAt: TimestampLike;
}

export interface QuizQuestion {
  question: string;
  questionAr?: string;
  questionFr?: string;
  options: string[];
  optionsAr?: string[];
  optionsFr?: string[];
  correctAnswer: number;
  points: number;
  active: boolean;
  category?: string;
}

export type QuizSessionStatus = "waiting" | "active" | "question" | "ended";

export interface QuizSession {
  status: QuizSessionStatus;
  currentQuestionIndex: number;
  currentQuestionId?: string;
  questionOrder: string[];
  startedAt?: TimestampLike;
  endsAt?: TimestampLike;
  totalQuestions: number;
  /** Questions shown in each five-minute round (normally 10). */
  questionsPerRound?: number;
  /** Total unique active questions captured when the session started. */
  bankSize?: number;
  /** Seed used to create a fresh deterministic shuffle after each bank cycle. */
  shuffleSeed?: number;
  questionDurationSec?: number;
  roundDurationSec?: number;
  continuous?: boolean;
  stationId?: string;
}

export interface QuizParticipant {
  userId: string;
  nickname: string;
  points: number;
  roundNumber?: number;
  roundPoints?: number;
  joinedAt: TimestampLike;
}

export interface QuizAnswer {
  sessionId: string;
  userId: string;
  questionId: string;
  answerIndex: number;
  correct: boolean;
  points: number;
  latencyMs: number;
  roundNumber?: number;
  createdAt: TimestampLike;
}

export type GameSessionStatus = "waiting" | "active" | "ended";

export interface GameSession {
  gameKey: GameKey;
  status: GameSessionStatus;
  startedAt?: TimestampLike;
  endsAt?: TimestampLike;
  stationId?: string;
  meta?: Record<string, unknown>;
}

export interface GameScore {
  userId: string;
  gameKey: GameKey;
  sessionId?: string;
  score: number;
  meta?: Record<string, unknown>;
  points: number;
  createdAt: TimestampLike;
}

export interface MysteryAttempt {
  userId: string;
  solved: boolean;
  correct: boolean;
  points: number;
  attempts: number;
  createdAt: TimestampLike;
}

export interface PasswordAttempt {
  userId: string;
  solved: boolean;
  correct: boolean;
  points: number;
  attempts: number;
  createdAt: TimestampLike;
}

export interface Achievement {
  key: string;
  name: string;
  nameAr?: string;
  nameFr?: string;
  description: string;
  descriptionAr?: string;
  descriptionFr?: string;
  icon: string;
  xp: number;
  criteria: Record<string, unknown>;
}

export interface UserAchievement {
  userId: string;
  achievementId: string;
  points: number;
  createdAt: TimestampLike;
}

export interface AdminUser {
  role: "admin" | "staff";
  email: string;
  createdAt: TimestampLike;
}

export interface QrCode {
  token: string;
  type: QrType;
  targetId: string;
  label?: string;
  active: boolean;
  createdAt: TimestampLike;
}

export interface LeaderboardEntry {
  totalXP: number;
  nickname: string;
  updatedAt: TimestampLike;
}

export interface AdminQuizLeaderboardEntry {
  userId: string;
  nickname: string;
  email: string | null;
  quizPoints: number;
  correctAnswers: number;
  roundsJoined: number;
}

export interface AdminAllTimeLeaderboardEntry {
  userId: string;
  nickname: string;
  email: string | null;
  totalXP: number;
}

export interface AdminWorkshopLeaderboardEntry {
  userId: string;
  nickname: string;
  email: string | null;
  workshopsVisited: number;
  workshopPoints: number;
}

export interface AdminLeaderboardsResult {
  quiz: AdminQuizLeaderboardEntry[];
  allTime: AdminAllTimeLeaderboardEntry[];
  workshops: AdminWorkshopLeaderboardEntry[];
}

export interface EventSettings {
  eventName?: string;
  eventNameAr?: string;
  eventNameFr?: string;
  openDayActive?: boolean;
}

export interface RewardsConfig {
  registration: number;
  workshop: number;
  cat: number;
  rareCat: number;
  password: number;
  mystery: number;
  quizCorrect: number;
  memoryBase: number;
}

export type TimestampLike =
  | string
  | { toMillis: () => number; seconds?: number; nanoseconds?: number }
  | { seconds: number; nanoseconds: number }
  | Date;

export interface RegistrationReward {
  points: number;
}
