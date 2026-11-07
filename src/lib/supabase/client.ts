"use client";

import { createClient, type SupabaseClient, type SupportedStorage } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Robust cross-browser storage for Supabase auth:
 * Combines window.localStorage with document.cookie fallback and memory cache.
 * Designed to survive iOS Safari 7-day ITP wipes, Samsung Internet Secret Mode,
 * and restrictive mobile browser sandboxes.
 */
function createRobustBrowserStorage(): SupportedStorage | undefined {
  if (typeof window === "undefined") return undefined;

  const memory = new Map<string, string>();

  return {
    getItem(key: string): string | null {
      // 1. Try window.localStorage
      try {
        const val = window.localStorage.getItem(key);
        if (val) return val;
      } catch {}

      // 2. Try document.cookie
      try {
        const prefix = `${encodeURIComponent(key)}=`;
        const cookies = document.cookie ? document.cookie.split("; ") : [];
        for (const cookie of cookies) {
          if (cookie.startsWith(prefix)) {
            return decodeURIComponent(cookie.slice(prefix.length));
          }
        }
      } catch {}

      // 3. Fallback to memory
      return memory.get(key) ?? null;
    },

    setItem(key: string, value: string): void {
      memory.set(key, value);

      // 1. Write to localStorage
      try {
        window.localStorage.setItem(key, value);
      } catch {}

      // 2. Write to cookie with 30-day lifetime
      try {
        const maxAge = 60 * 60 * 24 * 30; // 30 days
        const secure = window.location.protocol === "https:" ? "; Secure" : "";
        document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
      } catch {}
    },

    removeItem(key: string): void {
      memory.delete(key);

      // 1. Remove from localStorage
      try {
        window.localStorage.removeItem(key);
      } catch {}

      // 2. Remove cookie
      try {
        const secure = window.location.protocol === "https:" ? "; Secure" : "";
        document.cookie = `${encodeURIComponent(key)}=; path=/; max-age=0; SameSite=Lax${secure}`;
      } catch {}
    },
  };
}

export function getSupabaseBrowser(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("Supabase browser environment is incomplete");
  }

  const storage = createRobustBrowserStorage();

  client = createClient(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      ...(storage ? { storage } : {}),
    },
  });
  return client;
}
