export type ErrorCode =
  | "already-exists"
  | "unauthenticated"
  | "permission-denied"
  | "not-found"
  | "failed-precondition"
  | "invalid-argument"
  | "resource-exhausted"
  | "internal"
  | "unavailable";

const STATUS: Record<ErrorCode, number> = {
  "already-exists": 409,
  unauthenticated: 401,
  "permission-denied": 403,
  "not-found": 404,
  "failed-precondition": 400,
  "invalid-argument": 400,
  "resource-exhausted": 429,
  internal: 500,
  unavailable: 503,
};

/**
 * Typed API error. `code` is stable and machine-readable (the client maps it
 * to localized messages); `status` is the HTTP status for the route handler.
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = STATUS[code];
  }
}

export function apiError(code: ErrorCode, message: string): never {
  throw new ApiError(code, message);
}
