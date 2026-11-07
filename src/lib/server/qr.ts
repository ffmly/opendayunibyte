import { randomBytes } from "crypto";
import { db, now, apiError } from "./common";
import type { QrCode, QrType } from "@shared/models";

/**
 * Look up and validate a QR token. Returns the QR document and resolved target
 * document (cat/workshop/activity). Throws typed errors for invalid/inactive.
 */
export async function resolveQr(
  token: string,
): Promise<{ qr: QrCode; target: Record<string, unknown> }> {
  if (!token) apiError("invalid-argument", "Token is required");

  const qrSnap = await db.collection("qrCodes").doc(token).get();
  if (!qrSnap.exists) {
    apiError("not-found", "This code is invalid.");
  }
  const qr = qrSnap.data() as unknown as QrCode;

  if (!qr.active) {
    apiError("failed-precondition", "This code is inactive.");
  }

  const targetSnap = await db
    .collection(targetCollection(qr.type))
    .doc(qr.targetId)
    .get();
  if (!targetSnap.exists) {
    apiError("not-found", "This activity does not exist.");
  }
  const target = targetSnap.data() as Record<string, unknown>;

  if (target.active === false) {
    apiError("failed-precondition", "This activity is closed.");
  }

  return { qr, target };
}

export function targetCollection(type: QrType): string {
  switch (type) {
    case "CAT":
      return "cats";
    case "WORKSHOP":
      return "workshops";
    case "QUIZ":
    case "MEMORY":
    case "PASSWORD":
    case "MYSTERY":
    case "ENTRY":
    case "ACTIVITY":
    case "GAME":
    default:
      return "activities";
  }
}

export interface Rewards {
  registration: number;
  workshop: number;
  cat: number;
  rareCat: number;
  password: number;
  mystery: number;
  quizCorrect: number;
  memoryBase: number;
}

const DEFAULT_REWARDS: Rewards = {
  registration: 50,
  workshop: 100,
  cat: 100,
  rareCat: 250,
  password: 500,
  mystery: 500,
  quizCorrect: 100,
  memoryBase: 75,
};

/** Load runtime-configurable XP rewards from settings/rewards. */
export async function getRewards(): Promise<Rewards> {
  try {
    const snap = await db.collection("settings").doc("rewards").get();
    if (!snap.exists) return DEFAULT_REWARDS;
    const data = snap.data()!;
    return {
      registration: (data.registration as number) ?? DEFAULT_REWARDS.registration,
      workshop: (data.workshop as number) ?? DEFAULT_REWARDS.workshop,
      cat: (data.cat as number) ?? DEFAULT_REWARDS.cat,
      rareCat: (data.rareCat as number) ?? DEFAULT_REWARDS.rareCat,
      password: (data.password as number) ?? DEFAULT_REWARDS.password,
      mystery: (data.mystery as number) ?? DEFAULT_REWARDS.mystery,
      quizCorrect: (data.quizCorrect as number) ?? DEFAULT_REWARDS.quizCorrect,
      memoryBase: (data.memoryBase as number) ?? DEFAULT_REWARDS.memoryBase,
    };
  } catch {
    return DEFAULT_REWARDS;
  }
}

export async function createQrCode(input: {
  type: QrType;
  targetId: string;
  label?: string;
}): Promise<QrCode> {
  const token = generateToken();
  const qr: QrCode = {
    token,
    type: input.type,
    targetId: input.targetId,
    label: input.label,
    active: true,
    createdAt: now(),
  };
  await db.collection("qrCodes").doc(token).set({ ...qr });
  return qr;
}

function generateToken(): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(28);
  let out = "ub";
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}
