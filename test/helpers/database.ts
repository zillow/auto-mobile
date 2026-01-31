import { getDatabase, ensureMigrations as ensureDbMigrations } from "../../src/db/database";

/**
 * Run all database migrations for testing.
 * Call this in test setup to ensure tables exist.
 * Uses the automatic migration system to ensure all migrations run correctly.
 */
export async function runMigrations(): Promise<void> {
  await ensureDbMigrations();
}

/**
 * Check if a table exists in the database.
 */
export async function tableExists(tableName: string): Promise<boolean> {
  const db = getDatabase();
  const result = await db
    .selectFrom("sqlite_master" as any)
    .select("name")
    .where("type", "=", "table")
    .where("name", "=", tableName)
    .executeTakeFirst();

  return result !== undefined;
}
