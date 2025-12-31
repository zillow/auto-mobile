import { Kysely, Migrator, FileMigrationProvider } from "kysely";
import { promises as fs } from "fs";
import * as path from "path";
import { logger } from "../utils/logger";

/**
 * Run all pending database migrations
 */
export async function runMigrations(db: Kysely<unknown>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, "migrations"),
    }),
  });

  const { error, results } = await migrator.migrateToLatest();

  if (results) {
    for (const result of results) {
      if (result.status === "Success") {
        logger.info(`Migration "${result.migrationName}" executed successfully`);
      } else if (result.status === "Error") {
        logger.error(`Migration "${result.migrationName}" failed`);
      }
    }
  }

  if (error) {
    logger.error("Failed to run migrations:", error);
    throw error;
  }

  logger.info("All migrations completed successfully");
}
