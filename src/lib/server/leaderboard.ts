import { db, requireAuth, apiError } from "./common";
import type { Ctx } from "./common";

/**
 * getMyRank — count users strictly above the caller by XP using a Firestore
 * count query (cheap, server-side). Plus total registered users.
 */
export async function getMyRank(_data: unknown, context: Ctx) {
  const uid = requireAuth(context);

  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists) apiError("not-found", "Profile not found");
  const myXp = (userSnap.data()!.totalXP as number) ?? 0;

  // Users with strictly more XP than me
  const above = await db
    .collection("users")
    .where("totalXP", ">", myXp)
    .count()
    .get();

  const total = await db.collection("users").count().get();

  return {
    rank: above.data().count + 1,
    totalUsers: total.data().count,
  };
}
