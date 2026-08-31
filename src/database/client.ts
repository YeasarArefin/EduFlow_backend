import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../config/env";
import * as schema from "./schema";

export const pool = new Pool({
  connectionString: env.DATABASE_URL
});

export const db = drizzle(pool, {
  schema,
  casing: "snake_case"
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
