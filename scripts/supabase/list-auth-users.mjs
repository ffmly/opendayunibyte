import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error("Supabase server environment is incomplete");

const supabase = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 100 });
if (error) throw error;

for (const user of data.users) {
  console.log(JSON.stringify({
    id: user.id,
    email: user.email ?? null,
    anonymous: user.is_anonymous ?? false,
    role: user.app_metadata?.role ?? null,
    createdAt: user.created_at,
  }));
}
