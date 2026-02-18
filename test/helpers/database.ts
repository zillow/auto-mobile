import { ensureMigrations as ensureDbMigrations } from "../../src/db/database";

/**
 * Run all database migrations for testing.
 * Call this in test setup to ensure tables exist.
 * Uses the automatic migration system to ensure all migrations run correctly.
 */
export async function runMigrations(): Promise<void> {
  await ensureDbMigrations();
}
