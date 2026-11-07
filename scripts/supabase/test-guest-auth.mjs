import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

const appUrl = process.argv[2] ?? "http://localhost:3000";
const response = await fetch(`${appUrl}/api/auth/guest`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
});
const payload = await response.json();
if (!response.ok || !payload.email || !payload.password) {
  throw new Error(`Guest endpoint failed (${response.status}): ${payload.error ?? "unknown error"}`);
}

const browser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const signIn = await browser.auth.signInWithPassword({
  email: payload.email,
  password: payload.password,
});
if (signIn.error || !signIn.data.user) {
  throw signIn.error ?? new Error("Guest sign-in did not return a user");
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const cleanup = await admin.auth.admin.deleteUser(signIn.data.user.id);
if (cleanup.error) throw cleanup.error;

console.log("Guest endpoint, sign-in, and cleanup passed.");
