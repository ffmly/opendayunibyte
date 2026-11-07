"use client";

import { getSupabaseBrowser } from "@/lib/supabase/client";

export class CallableError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function call<T = unknown, R = unknown>(
  name: string,
  data?: T,
): Promise<R> {
  let token: string | null = null;
  try {
    const { data: sessionData } = await getSupabaseBrowser().auth.getSession();
    token = sessionData.session?.access_token ?? null;
  } catch {
    // Public callables can continue without a session.
  }

  let response: Response;
  try {
    response = await fetch(`/api/call/${encodeURIComponent(name)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data ?? {}),
      cache: "no-store",
    });
  } catch {
    throw new CallableError("unavailable", "Network error");
  }

  if (!response.ok) {
    let payload: { error?: { code?: string; message?: string } } = {};
    try { payload = await response.json(); } catch { /* non-JSON response */ }
    throw new CallableError(
      payload.error?.code ?? "internal",
      payload.error?.message ?? "Request failed",
    );
  }
  return await response.json() as R;
}
