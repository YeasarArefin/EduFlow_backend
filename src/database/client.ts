import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../config/env';
import * as schema from './schema';

const databaseHost = new URL(env.DATABASE_URL).hostname;
const usesSupabase =
  databaseHost.endsWith('.supabase.co') || databaseHost.endsWith('.pooler.supabase.com');

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  // Supabase connection URLs use sslmode=require. That encrypts transport, while full CA
  // verification would additionally require the Supabase root certificate in this service.
  // Local Docker connections remain unencrypted.
  ...(usesSupabase ? { ssl: { rejectUnauthorized: false } } : {}),
  // A bounded pool is safe for Render instances and works with Supabase's transaction pooler.
  max: env.NODE_ENV === 'production' ? 10 : undefined,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export const db = drizzle(pool, {
  schema,
  casing: 'snake_case',
});

export async function checkDatabaseConnection(): Promise<boolean> {
  const result = await db.execute(sql`select 1 as connected`);

  return result.rows.length === 1;
}

/** Runs work inside a transaction with a transaction-local tenant context for PostgreSQL RLS. */
export async function withWorkspaceContext<T>(
  workspaceId: string,
  callback: (transaction: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>
): Promise<T> {
  return db.transaction(async (transaction) => {
    await transaction.execute(sql`select set_config('app.workspace_id', ${workspaceId}, true)`);
    return callback(transaction);
  });
}
