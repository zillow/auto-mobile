import { Kysely, Migrator, FileMigrationProvider } from "kysely";
import { existsSync, promises as fs } from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { logger } from "../utils/logger";

function resolveMigrationFolder(): string {
  const envPath = process.env.AUTO_MOBILE_MIGRATIONS_DIR ?? process.env.AUTOMOBILE_MIGRATIONS_DIR;
  if (envPath) {
    return path.resolve(envPath);
  }

  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.join(moduleDir, "migrations"), path.join(moduleDir, "db", "migrations")];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Migrations folder not found. Checked: ${candidates.join(", ")}`);
}

/**
 * Run all pending database migrations
 */
export async function runMigrations(db: Kysely<unknown>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: resolveMigrationFolder(),
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
