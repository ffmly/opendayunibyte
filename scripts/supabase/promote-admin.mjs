import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const email = process.argv[2]?.trim().toLowerCase();
if (!email) throw new Error("Usage: node scripts/supabase/promote-admin.mjs <email>");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const connectionString = process.env.DATABASE_URL;
if (!url || !secret || !connectionString) throw new Error("Supabase server environment is incomplete");

const supabase = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 100 });
if (error) throw error;
const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
if (!user) throw new Error(`No Supabase Auth user found for ${email}`);

const update = await supabase.auth.admin.updateUserById(user.id, {
  app_metadata: { ...user.app_metadata, role: "admin" },
});
if (update.error) throw update.error;

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 1,
});
try {
  await pool.query(
    `insert into public.admin_roles(user_id, role)
     values ($1, 'admin')
     on conflict (user_id) do update set role = 'admin'`,
    [user.id],
  );
} finally {
  await pool.end();
}

console.log(`Admin access enabled for ${email}. Sign out and sign in again to refresh the session.`);
