import "server-only";

import { randomUUID } from "node:crypto";
import pg, { type PoolClient } from "pg";
import { createClient } from "@supabase/supabase-js";

type PlainData = Record<string, unknown>;
type Operator = "==" | ">" | ">=" | "<" | "<=" | "in";

const COLLECTIONS = {
  users: { table: "profiles", key: "id" },
  admins: { table: "admin_roles", key: "user_id" },
  activities: { table: "activities", key: "id" },
  cats: { table: "cats", key: "id" },
  workshops: { table: "workshops", key: "id" },
  qrCodes: { table: "qr_codes", key: "token" },
  settings: { table: "reward_settings", key: "id" },
  xpEvents: { table: "xp_events", key: "id" },
  leaderboard: { table: "leaderboard", key: "user_id" },
  catFinds: { table: "cat_finds", key: "id" },
  workshopCheckins: { table: "workshop_checkins", key: "id" },
  quizQuestions: { table: "quiz_questions", key: "id" },
  quizSessions: { table: "quiz_sessions", key: "id" },
  quizParticipants: { table: "quiz_participants", key: "id" },
  quizAnswers: { table: "quiz_answers", key: "id" },
  gameSessions: { table: "game_sessions", key: "id" },
  gameScores: { table: "game_scores", key: "id" },
  passwordChallenges: { table: "password_challenges", key: "id" },
  mysteryChallenges: { table: "mystery_challenges", key: "id" },
  passwordAttempts: { table: "password_attempts", key: "id" },
  mysteryAttempts: { table: "mystery_attempts", key: "id" },
  challengeClaims: { table: "challenge_claims", key: "id" },
  campaigns: { table: "campaigns", key: "id" },
  canvaGiveawayEntries: { table: "canva_giveaway_entries", key: "id" },
} as const;

type CollectionName = keyof typeof COLLECTIONS;
type DatabaseClient = pg.Pool | PoolClient;

declare global {
  var __unibytePgPool: pg.Pool | undefined;
}

function getPool(): pg.Pool {
  if (globalThis.__unibytePgPool) return globalThis.__unibytePgPool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is missing");
  globalThis.__unibytePgPool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
  });
  return globalThis.__unibytePgPool;
}

function quote(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function camelToSnake(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function snakeToCamel(key: string): string {
  const camel = key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
  return camel === "totalXp" ? "totalXP" : camel;
}

function rowToData(row: PlainData, primaryKey: string): PlainData {
  const out: PlainData = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === primaryKey) continue;
    out[snakeToCamel(key)] = value;
  }
  return out;
}

function dataToRow(data: PlainData): PlainData {
  const out: PlainData = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) out[camelToSnake(key)] = value;
  }
  return out;
}

async function insertOrUpdate(
  client: DatabaseClient,
  collection: CollectionName,
  id: string,
  data: PlainData,
): Promise<void> {
  const config = COLLECTIONS[collection];
  const row = { ...dataToRow(data), [config.key]: id };
  const columns = Object.keys(row);
  const values = columns.map((column) => row[column]);
  const updates = columns
    .filter((column) => column !== config.key)
    .map((column) => `${quote(column)} = excluded.${quote(column)}`)
    .join(", ");
  const conflict = updates ? `do update set ${updates}` : "do nothing";
  await client.query(
    `insert into public.${quote(config.table)} (${columns.map(quote).join(", ")}) values (${values.map((_, index) => `$${index + 1}`).join(", ")}) on conflict (${quote(config.key)}) ${conflict}`,
    values,
  );
}

async function updateRow(
  client: DatabaseClient,
  collection: CollectionName,
  id: string,
  data: PlainData,
): Promise<void> {
  const config = COLLECTIONS[collection];
  const row = dataToRow(data);
  const columns = Object.keys(row);
  if (columns.length === 0) return;
  const values = columns.map((column) => row[column]);
  values.push(id);
  const result = await client.query(
    `update public.${quote(config.table)} set ${columns.map((column, index) => `${quote(column)} = $${index + 1}`).join(", ")} where ${quote(config.key)} = $${values.length}`,
    values,
  );
  if (result.rowCount === 0) throw new Error("document_not_found");
}

export class DocumentSnapshot {
  constructor(
    public readonly id: string,
    private readonly value: PlainData | null,
    public readonly ref: DocumentReference,
  ) {}

  get exists(): boolean {
    return this.value !== null;
  }

  data(): PlainData | undefined {
    return this.value ?? undefined;
  }
}

export class DocumentReference {
  constructor(
    public readonly collectionName: CollectionName,
    public readonly id: string,
  ) {}

  async get(client: DatabaseClient = getPool()): Promise<DocumentSnapshot> {
    const config = COLLECTIONS[this.collectionName];
    const result = await client.query(
      `select * from public.${quote(config.table)} where ${quote(config.key)} = $1 limit 1`,
      [this.id],
    );
    const row = result.rows[0] as PlainData | undefined;
    return new DocumentSnapshot(
      this.id,
      row ? rowToData(row, config.key) : null,
      this,
    );
  }

  async set(data: PlainData, _options?: { merge?: boolean }, client: DatabaseClient = getPool()): Promise<void> {
    await insertOrUpdate(client, this.collectionName, this.id, data);
  }

  async update(data: PlainData, client: DatabaseClient = getPool()): Promise<void> {
    await updateRow(client, this.collectionName, this.id, data);
  }

  async delete(client: DatabaseClient = getPool()): Promise<void> {
    const config = COLLECTIONS[this.collectionName];
    await client.query(
      `delete from public.${quote(config.table)} where ${quote(config.key)} = $1`,
      [this.id],
    );
  }
}

export class QuerySnapshot {
  constructor(public readonly docs: DocumentSnapshot[]) {}
  get empty(): boolean { return this.docs.length === 0; }
  get size(): number { return this.docs.length; }
}

interface Filter { field: string; operator: Operator; value: unknown }
interface Sort { field: string; direction: "asc" | "desc" }

class CountQuery {
  constructor(private readonly query: Query) {}
  async get(): Promise<{ data(): { count: number } }> {
    const count = await this.query.countRows();
    return { data: () => ({ count }) };
  }
}

export class Query {
  constructor(
    protected readonly collectionName: CollectionName,
    protected readonly filters: Filter[] = [],
    protected readonly sorts: Sort[] = [],
    protected readonly maxRows?: number,
  ) {}

  where(field: string, operator: Operator, value: unknown): Query {
    return new Query(this.collectionName, [...this.filters, { field, operator, value }], this.sorts, this.maxRows);
  }

  orderBy(field: string, direction: "asc" | "desc" = "asc"): Query {
    return new Query(this.collectionName, this.filters, [...this.sorts, { field, direction }], this.maxRows);
  }

  limit(maxRows: number): Query {
    return new Query(this.collectionName, this.filters, this.sorts, maxRows);
  }

  count(): CountQuery { return new CountQuery(this); }

  private build(select: string): { sql: string; values: unknown[] } {
    const config = COLLECTIONS[this.collectionName];
    const values: unknown[] = [];
    const conditions = this.filters.map((filter) => {
      const column = quote(camelToSnake(filter.field));
      if (filter.operator === "in") {
        const items = Array.isArray(filter.value) ? filter.value : [];
        if (items.length === 0) return "false";
        const placeholders = items.map((item) => {
          values.push(item);
          return `$${values.length}`;
        });
        return `${column} in (${placeholders.join(", ")})`;
      }
      values.push(filter.value);
      const operators: Record<Exclude<Operator, "in">, string> = { "==": "=", ">": ">", ">=": ">=", "<": "<", "<=": "<=" };
      return `${column} ${operators[filter.operator]} $${values.length}`;
    });
    let sql = `select ${select} from public.${quote(config.table)}`;
    if (conditions.length) sql += ` where ${conditions.join(" and ")}`;
    if (this.sorts.length) {
      sql += ` order by ${this.sorts.map((sort) => `${quote(camelToSnake(sort.field))} ${sort.direction}`).join(", ")}`;
    }
    if (this.maxRows !== undefined) {
      values.push(this.maxRows);
      sql += ` limit $${values.length}`;
    }
    return { sql, values };
  }

  async get(client: DatabaseClient = getPool()): Promise<QuerySnapshot> {
    const config = COLLECTIONS[this.collectionName];
    const { sql, values } = this.build("*");
    const result = await client.query(sql, values);
    return new QuerySnapshot(result.rows.map((row: PlainData) => {
      const id = String(row[config.key]);
      const ref = new DocumentReference(this.collectionName, id);
      return new DocumentSnapshot(id, rowToData(row, config.key), ref);
    }));
  }

  async countRows(client: DatabaseClient = getPool()): Promise<number> {
    const { sql, values } = this.build("count(*)::int as count");
    const result = await client.query(sql, values);
    return Number(result.rows[0]?.count ?? 0);
  }
}

class CollectionReference extends Query {
  constructor(collectionName: CollectionName) { super(collectionName); }
  doc(id: string = randomUUID()): DocumentReference { return new DocumentReference(this.collectionName, id); }
  async add(data: PlainData): Promise<DocumentReference> {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }
}

type PendingWrite = (client: PoolClient) => Promise<void>;

class WriteBatch {
  private readonly writes: PendingWrite[] = [];
  set(ref: DocumentReference, data: PlainData, options?: { merge?: boolean }): void {
    this.writes.push((client) => ref.set(data, options, client));
  }
  update(ref: DocumentReference, data: PlainData): void {
    this.writes.push((client) => ref.update(data, client));
  }
  async commit(): Promise<void> {
    const client = await getPool().connect();
    try {
      await client.query("begin");
      for (const write of this.writes) await write(client);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}

export class Transaction {
  private readonly writes: PendingWrite[] = [];
  constructor(private readonly client: PoolClient) {}
  async get(ref: DocumentReference): Promise<DocumentSnapshot> { return ref.get(this.client); }
  set(ref: DocumentReference, data: PlainData, options?: { merge?: boolean }): void {
    this.writes.push((client) => ref.set(data, options, client));
  }
  update(ref: DocumentReference, data: PlainData): void {
    this.writes.push((client) => ref.update(data, client));
  }
  async flush(): Promise<void> {
    for (const write of this.writes) await write(this.client);
  }
}

export const db = {
  collection(name: string): CollectionReference {
    if (!(name in COLLECTIONS)) throw new Error(`Unknown collection: ${name}`);
    return new CollectionReference(name as CollectionName);
  },
  batch(): WriteBatch { return new WriteBatch(); },
  async runTransaction<T>(callback: (transaction: Transaction) => Promise<T>): Promise<T> {
    const client = await getPool().connect();
    try {
      await client.query("begin");
      const transaction = new Transaction(client);
      const result = await callback(transaction);
      await transaction.flush();
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  },
};

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("Supabase server environment is incomplete");
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export const auth = {
  async verifyIdToken(token: string): Promise<Record<string, unknown> & { uid: string }> {
    const { data, error } = await getAdminClient().auth.getUser(token);
    if (error || !data.user) throw error ?? new Error("Invalid token");
    return {
      uid: data.user.id,
      email: data.user.email,
      role: data.user.app_metadata?.role,
      app_metadata: data.user.app_metadata,
    };
  },
  async setCustomUserClaims(uid: string, claims: Record<string, unknown>): Promise<void> {
    const supabase = getAdminClient();
    const { data, error } = await supabase.auth.admin.getUserById(uid);
    if (error || !data.user) throw error ?? new Error("User not found");
    const update = await supabase.auth.admin.updateUserById(uid, {
      app_metadata: { ...data.user.app_metadata, ...claims },
    });
    if (update.error) throw update.error;
  },
};

export const serverTimestamp = (): Date => new Date();
export const now = (): Date => new Date();
export const inSeconds = (seconds: number): Date => new Date(Date.now() + seconds * 1000);

export function getSqlPool(): pg.Pool {
  return getPool();
}
