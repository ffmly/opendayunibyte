import { auth } from "./supabase-db";
import { ApiError } from "./errors";
import type { Ctx } from "./common";
import * as users from "./users";
import * as qrActions from "./qr-actions";
import * as games from "./games";
import * as leaderboard from "./leaderboard";
import * as quizDisplay from "./quiz-display";
import * as admin from "./admin";
import * as reads from "./reads";
import * as challenges from "./challenges";

type Handler = (data: unknown, context: Ctx) => Promise<unknown>;

/** Name must match the client-side `call("name", data)` calls. */
const registry: Record<string, Handler> = {
  processQRCode: qrActions.processQRCode,
  findCat: qrActions.findCat,
  registerUser: users.registerUser,
  getMyProfile: users.getMyProfile,
  checkInWorkshop: qrActions.checkInWorkshop,
  joinQuiz: games.joinQuiz,
  submitQuizAnswer: games.submitQuizAnswer,
  joinGameSession: games.joinGameSession,
  submitGameScore: games.submitGameScore,
  startPassword: (data, context) => challenges.startChallenge("PASSWORD", data, context),
  startMystery: (data, context) => challenges.startChallenge("MYSTERY", data, context),
  solvePassword: (data, context) => challenges.solveChallenge("PASSWORD", data, context),
  solveMystery: (data, context) => challenges.solveChallenge("MYSTERY", data, context),
  getMyRank: leaderboard.getMyRank,
  getQuizDisplayQuestion: quizDisplay.getQuizDisplayQuestion,
  getQuizJoinCode: quizDisplay.getQuizJoinCode,
  adjustUserXp: users.adjustUserXp,
  setUserActive: users.setUserActive,
  adminCreateQRCode: admin.adminCreateQRCode,
  adminToggleQR: admin.adminToggleQR,
  adminUpdateQR: admin.adminUpdateQR,
  adminSetRole: admin.adminSetRole,
  adminCreateQuizSession: admin.adminCreateQuizSession,
  adminListQuizQuestions: admin.adminListQuizQuestions,
  adminCreateQuizQuestion: admin.adminCreateQuizQuestion,
  adminDeleteQuizQuestion: admin.adminDeleteQuizQuestion,
  adminSetQuizQuestion: admin.adminSetQuizQuestion,
  adminEndQuizSession: admin.adminEndQuizSession,
  adminCreateWorkshop: admin.adminCreateWorkshop,
  adminUpdateWorkshop: admin.adminUpdateWorkshop,
  adminCreateCat: admin.adminCreateCat,
  adminStats: admin.adminStats,
  adminUpdateRewards: admin.adminUpdateRewards,
  getActivityHistory: reads.getActivityHistory,
  getCatsData: reads.getCatsData,
  getWorkshopsData: reads.getWorkshopsData,
  getLeaderboard: reads.getLeaderboard,
  getWorkshop: reads.getWorkshop,
  listStationQrs: reads.listStationQrs,
  getQuizLiveState: reads.getQuizLiveState,
  getQuizParticipantState: reads.getQuizParticipantState,
  adminDashboardData: reads.adminDashboardData,
  adminListQrs: reads.adminListQrs,
  adminListUsers: reads.adminListUsers,
  adminListWorkshops: reads.adminListWorkshops,
  adminWorkshopAttendance: reads.adminWorkshopAttendance,
  adminGetSettings: reads.adminGetSettings,
  adminQuizState: reads.adminQuizState,
  adminLeaderboards: reads.adminLeaderboards,
  adminCleanupParticipants: admin.adminCleanupParticipants,
  adminCreateUser: admin.adminCreateUser,
};

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Dispatch a callable request:
 *  - verify the Bearer ID token (when present) to build the auth context;
 *  - run the handler;
 *  - map ApiError to a stable JSON error shape and HTTP status.
 */
export async function dispatch(
  name: string,
  token: string | null,
  body: unknown,
): Promise<Response> {
  const handler = registry[name];
  if (!handler) {
    return json(
      { error: { code: "not-found", message: `Unknown callable: ${name}` } },
      404,
    );
  }

  let uid: string | undefined;
  let claims: Record<string, unknown> | undefined;
  if (token) {
    try {
      const decoded = await auth.verifyIdToken(token);
      uid = decoded.uid;
      claims = decoded as unknown as Record<string, unknown>;
    } catch {
      return json(
        { error: { code: "unauthenticated", message: "Invalid or expired token." } },
        401,
      );
    }
  }

  const context: Ctx = { auth: uid ? { uid } : null, authToken: claims };

  try {
    const result = await handler(body ?? {}, context);
    return json(result ?? {}, 200);
  } catch (err) {
    if (err instanceof ApiError) {
      return json(
        { error: { code: err.code, message: err.message } },
        err.status,
      );
    }
    console.error(`[api/call/${name}]`, err);
    return json(
      { error: { code: "internal", message: "Internal server error." } },
      500,
    );
  }
}
