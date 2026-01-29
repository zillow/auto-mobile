import { getDatabase } from "../../src/db/database";
import { up as initialMigration } from "../../src/db/migrations/2025_12_28_000_initial_schema";
import { up as navigationMigration } from "../../src/db/migrations/2025_12_30_001_navigation_graph";
import { up as predictionHistoryMigration } from "../../src/db/migrations/2026_01_02_000_prediction_history";
import { up as namedNodesMigration } from "../../src/db/migrations/2026_01_29_000_named_nodes";

/**
 * Run all database migrations for testing.
 * Call this in test setup to ensure tables exist.
 */
export async function runMigrations(): Promise<void> {
  const db = getDatabase();

  // Only run migrations if tables don't exist yet
  const deviceConfigsExists = await tableExists("device_configs");
  const navigationAppsExists = await tableExists("navigation_apps");
  const predictionOutcomesExists = await tableExists("prediction_outcomes");
  const navigationNodeFingerprintsExists = await tableExists("navigation_node_fingerprints");

  if (!deviceConfigsExists) {
    await initialMigration(db);
  }

  if (!navigationAppsExists) {
    await navigationMigration(db);
  }

  if (!predictionOutcomesExists) {
    await predictionHistoryMigration(db);
  }

  if (!navigationNodeFingerprintsExists) {
    await namedNodesMigration(db);
  }
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
