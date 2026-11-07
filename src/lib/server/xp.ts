import type { XpEventType } from "@shared/models";
import { getSqlPool } from "./supabase-db";

export interface AwardXpParams {
  userId: string;
  type: XpEventType;
  sourceId: string;
  points: number;
  metadata?: Record<string, unknown>;
}

/**
 * Append an XP ledger entry and atomically bump the user's totalXP and the
 * leaderboard cache inside a single transaction. This is the ONLY place that
 * may write to users.totalXP / leaderboard.
 */
export async function awardXp(
  params: AwardXpParams,
): Promise<{ eventId: string; points: number }> {
  if (params.points === 0) return { eventId: "", points: 0 };

  const result = await getSqlPool().query(
    `select event_id as "eventId", points
       from public.award_xp($1, $2, $3, $4, $5::jsonb)`,
    [params.userId, params.type, params.sourceId, params.points, JSON.stringify(params.metadata ?? {})],
  );
  return result.rows[0] ?? { eventId: "", points: params.points };
}
