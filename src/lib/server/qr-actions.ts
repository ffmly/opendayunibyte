import {
  db,
  requireAuth,
  requireActiveUser,
  validate,
  apiError,
} from "./common";
import type { Ctx } from "./common";
import { processQrSchema } from "@shared/schemas";
import { resolveQr, getRewards } from "./qr";
import { getSqlPool } from "./supabase-db";

/**
 * processQRCode — validate a scanned token and report what it points to,
 * WITHOUT granting anything. Registration-gate detection: a caller without a
 * users doc gets requiresRegistration=true.
 */
export async function processQRCode(data: unknown, context: Ctx) {
  const uid = requireAuth(context);
  const { token } = validate(processQrSchema, data);

  const userSnap = await db.collection("users").doc(uid).get();
  if (userSnap.exists && userSnap.data()?.status === "disabled") {
    apiError("permission-denied", "This account is disabled.");
  }
  const requiresRegistration = !userSnap.exists;

  const { qr, target } = await resolveQr(token);
  if (qr.type !== "QUIZ" && qr.type !== "WORKSHOP" && qr.type !== "ENTRY") {
    apiError("failed-precondition", "This activity is no longer available.");
  }

  const rewards = await getRewards();

  return {
    qrType: qr.type,
    targetId: qr.targetId,
    label: qr.label ?? null,
    targetName: pickName(target, qr.type),
    points: pickPoints(target, qr.type, rewards),
    rarity: target.rarity ?? undefined,
    requiresRegistration,
  };
}

/**
 * findCat — claim a cat reward with duplicate protection.
 * catFinds/{uid_catId} existence is the anti-cheat key.
 */
export async function findCat(data: unknown, context: Ctx) {
  const uid = requireAuth(context);
  const { token } = validate(processQrSchema, data);

  await requireActiveUser(uid);

  const { qr, target } = await resolveQr(token);
  if (qr.type !== "CAT") apiError("invalid-argument", "Not a cat QR");
  const catId = qr.targetId;

  const rarity = (target.rarity as string) === "rare" ? "rare" : "normal";
  const result = await getSqlPool().query(
    `select already_found as "alreadyFound", points from public.claim_cat($1, $2)`,
    [uid, catId],
  );
  return {
    catId,
    catNumber: target.number ?? null,
    rarity,
    ...(result.rows[0] ?? { points: 0, alreadyFound: true }),
  };
}

/**
 * checkInWorkshop — duplicate-protected workshop attendance.
 */
export async function checkInWorkshop(data: unknown, context: Ctx) {
  const uid = requireAuth(context);
  const { token } = validate(processQrSchema, data);

  await requireActiveUser(uid);

  const { qr, target } = await resolveQr(token);
  if (qr.type !== "WORKSHOP") apiError("invalid-argument", "Not a workshop QR");
  const workshopId = qr.targetId;

  const result = await getSqlPool().query(
    `select already_checked_in as "alreadyCheckedIn", points
       from public.claim_workshop($1, $2)`,
    [uid, workshopId],
  );
  return {
    workshopId,
    ...(result.rows[0] ?? { points: 0, alreadyCheckedIn: true }),
    workshop: workshopPayload(target),
  };
}

function workshopPayload(target: Record<string, unknown>) {
  return {
    title: String(target.title ?? "Workshop"),
    location: String(target.location ?? ""),
    summary: String(target.summary ?? ""),
    postImageUrl: String(target.postImageUrl ?? ""),
    contentUrl: String(target.contentUrl ?? ""),
  };
}

function pickName(target: Record<string, unknown>, type: string): string {
  if (type === "CAT") return String(target.name ?? target.number ?? "Cat");
  if (type === "WORKSHOP") return String(target.title ?? "Workshop");
  return String(target.name ?? "Activity");
}

function pickPoints(
  target: Record<string, unknown>,
  type: string,
  rewards: Awaited<ReturnType<typeof getRewards>>,
): number {
  if (type === "CAT") {
    return (target.rarity as string) === "rare"
      ? rewards.rareCat
      : rewards.cat;
  }
  if (type === "WORKSHOP") return rewards.workshop;
  return (target.xp as number) ?? 0;
}
