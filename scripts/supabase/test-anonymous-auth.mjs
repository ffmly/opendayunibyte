import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

const browser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const result = await browser.auth.signInAnonymously();
if (result.error || !result.data.user) {
  throw result.error ?? new Error("Anonymous sign-in did not return a user");
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const cleanup = await admin.auth.admin.deleteUser(result.data.user.id);
if (cleanup.error) throw cleanup.error;

console.log("Supabase anonymous sign-in and cleanup passed.");
