import nextEnv from "@next/env";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const migration = process.argv[2];
if (!migration) throw new Error("Usage: node scripts/supabase/apply-migration.mjs <sql-file>");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing");

const sql = await readFile(path.resolve(migration), "utf8");
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query("begin");
  await client.query(sql);
  await client.query("commit");
  console.log(`Applied migration: ${path.basename(migration)}`);
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
