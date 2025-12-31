/**
 * Test database helper for creating in-memory SQLite databases for tests
 */

import { Database as BunDatabase } from "bun:sqlite";
import { Kysely } from "kysely";
import type { Database as DatabaseSchema } from "../../src/db/types";
import { BunSqliteDialect } from "../../src/db/bunSqliteDialect";

/**
 * Creates an in-memory SQLite database for testing
 * Runs the accessibility_baselines table migration automatically
 */
export async function createTestDatabase(): Promise<Kysely<DatabaseSchema>> {
  const sqliteDb = new BunDatabase(":memory:");

  const db = new Kysely<DatabaseSchema>({
    dialect: new BunSqliteDialect({
      database: sqliteDb,
    }),
  });

  // Run the accessibility_baselines migration
  await db.schema
    .createTable("accessibility_baselines")
    .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
    .addColumn("screen_id", "text", col => col.notNull().unique())
    .addColumn("violations_json", "text", col => col.notNull())
    .addColumn("created_at", "text", col => col.notNull())
    .addColumn("updated_at", "text", col => col.notNull())
    .execute();

  await db.schema
    .createIndex("idx_accessibility_baselines_screen_id")
    .on("accessibility_baselines")
    .column("screen_id")
    .execute();

  await db.schema
    .createIndex("idx_accessibility_baselines_updated_at")
    .on("accessibility_baselines")
    .column("updated_at")
    .execute();

  return db;
}

/**
 * Destroys a test database and closes all connections
 */
export async function destroyTestDatabase(db: Kysely<DatabaseSchema>): Promise<void> {
  await db.destroy();
}
