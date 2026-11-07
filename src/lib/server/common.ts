import { z } from "zod";
import { db, auth, now, inSeconds } from "./supabase-db";
import type { Transaction } from "./supabase-db";
import { ApiError, apiError } from "./errors";

export { db, auth, now, inSeconds };
export type { Transaction };

/** Auth context handed to every business handler. */
export interface Ctx {
  auth?: { uid?: string } | null;
  authToken?: Record<string, unknown>;
}

/** Require an authenticated caller; returns their uid. */
export function requireAuth(context: Ctx): string {
  const uid = context.auth?.uid;
  if (!uid) {
    throw new ApiError("unauthenticated", "You must be signed in.");
  }
  return uid;
}

/** Server-side status gate used by every live attendee mutation. */
export async function requireActiveUser(uid: string) {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) throw new ApiError("unauthenticated", "Register first.");
  if (snap.data()?.status === "disabled") {
    throw new ApiError("permission-denied", "This account is disabled.");
  }
  return snap;
}

/** Validate unknown input against a Zod schema; throw a typed ApiError. */
export function validate<S extends z.ZodTypeAny>(
  schema: S,
  input: unknown,
): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ApiError(
      "invalid-argument",
      parsed.error.issues[0]?.message ?? "Invalid input",
    );
  }
  return parsed.data;
}

export { apiError, ApiError };
