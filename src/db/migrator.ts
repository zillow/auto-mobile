import { Kysely, Migrator, FileMigrationProvider, DEFAULT_MIGRATION_TABLE } from "kysely";
import { existsSync, promises as fs } from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { logger } from "../utils/logger";

const DISABLED_RECOVERY_VALUES = new Set(["0", "false", "no", "off"]);

function resolveMigrationFolder(): string {
  // @deprecated AUTO_MOBILE_MIGRATIONS_DIR - use AUTOMOBILE_MIGRATIONS_DIR instead
  const envPath = process.env.AUTOMOBILE_MIGRATIONS_DIR ?? process.env.AUTO_MOBILE_MIGRATIONS_DIR;
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

function isMigrationRecoveryEnabled(): boolean {
  const envValue =
    process.env.AUTOMOBILE_MIGRATION_RECOVERY ?? process.env.AUTO_MOBILE_MIGRATION_RECOVERY;
  if (!envValue) {
    return true;
  }
  return !DISABLED_RECOVERY_VALUES.has(envValue.toLowerCase());
}

function isCorruptedMigrationError(error: unknown): error is Error {
  return error instanceof Error && error.message.includes("corrupted migrations");
}

async function tableExists(db: Kysely<unknown>, tableName: string): Promise<boolean> {
  const result = await db
    .selectFrom("sqlite_master" as any)
    .select("name")
    .where("type", "=", "table")
    .where("name", "=", tableName)
    .executeTakeFirst();

  return result !== undefined;
}

async function ensureMigrationTableExists(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable(DEFAULT_MIGRATION_TABLE)
    .addColumn("name", "varchar(255)", col => col.notNull().primaryKey())
    .addColumn("timestamp", "varchar(255)", col => col.notNull())
    .ifNotExists()
    .execute();
}

async function rebuildMigrationTable(
  db: Kysely<unknown>,
  migrator: Migrator
): Promise<{ pruned: string[]; kept: string[] }> {
  const hasMigrationTable = await tableExists(db, DEFAULT_MIGRATION_TABLE);
  if (!hasMigrationTable) {
    return { pruned: [], kept: [] };
  }

  const availableMigrations = await migrator.getMigrations();
  const availableNames = new Set(availableMigrations.map(migration => migration.name));
  const executedRows = await db
    .selectFrom(DEFAULT_MIGRATION_TABLE as any)
    .select(["name", "timestamp"])
    .execute();

  const pruned = executedRows
    .filter(row => !availableNames.has(row.name))
    .map(row => row.name);
  const executedSet = new Set(
    executedRows.filter(row => availableNames.has(row.name)).map(row => row.name)
  );
  const kept = availableMigrations.map(migration => migration.name).filter(name => executedSet.has(name));

  await ensureMigrationTableExists(db);

  await db.transaction().execute(async trx => {
    await trx.deleteFrom(DEFAULT_MIGRATION_TABLE as any).execute();

    if (kept.length > 0) {
      const baseTimestamp = Date.now();
      await trx
        .insertInto(DEFAULT_MIGRATION_TABLE as any)
        .values(
          kept.map((name, index) => ({
            name,
            timestamp: new Date(baseTimestamp + index).toISOString(),
          }))
        )
        .execute();
    }
  });

  return { pruned, kept };
}

async function resetDatabaseState(db: Kysely<unknown>): Promise<void> {
  const tables = await db
    .selectFrom("sqlite_master" as any)
    .select("name")
    .where("type", "=", "table")
    .where("name", "not like", "sqlite_%")
    .execute();

  for (const table of tables) {
    await db.schema.dropTable(String(table.name)).ifExists().execute();
  }
}

async function runMigrationsOnce(migrator: Migrator) {
  const result = await migrator.migrateToLatest();

  if (result.results) {
    for (const item of result.results) {
      if (item.status === "Success") {
        logger.info(`Migration "${item.migrationName}" executed successfully`);
      } else if (item.status === "Error") {
        logger.error(`Migration "${item.migrationName}" failed`);
      }
    }
  }

  return result;
}

async function recoverCorruptedMigrations(
  db: Kysely<unknown>,
  migrator: Migrator,
  error: Error
) {
  logger.warn(`Corrupted migrations detected: ${error.message}`);
  logger.warn(
    "Attempting automatic recovery by rebuilding migration history (destructive). " +
      "Set AUTOMOBILE_MIGRATION_RECOVERY=0 to disable."
  );

  const rebuildResult = await rebuildMigrationTable(db, migrator);
  if (rebuildResult.pruned.length > 0) {
    logger.warn(
      `Pruned missing migrations from history (destructive): ${rebuildResult.pruned.join(", ")}`
    );
  } else {
    logger.warn("Rebuilt migration history table to match existing migrations (destructive).");
  }

  let result = await runMigrationsOnce(migrator);
  if (!result.error) {
    return result;
  }

  logger.warn("Migration recovery failed after rebuild. Resetting database state (destructive).");
  await resetDatabaseState(db);
  result = await runMigrationsOnce(migrator);
  return result;
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

  const { error } = await runMigrationsOnce(migrator);

  if (error) {
    if (isCorruptedMigrationError(error) && isMigrationRecoveryEnabled()) {
      const recoveryResult = await recoverCorruptedMigrations(db, migrator, error);
      if (recoveryResult.error) {
        logger.error("Failed to run migrations after recovery:", recoveryResult.error);
        throw recoveryResult.error;
      }
      logger.info("All migrations completed successfully");
      return;
    }

    if (isCorruptedMigrationError(error) && !isMigrationRecoveryEnabled()) {
      logger.error(
        "Corrupted migrations detected. Set AUTOMOBILE_MIGRATION_RECOVERY=1 to enable automatic " +
          "recovery or reset the local database state."
      );
    }

    logger.error("Failed to run migrations:", error);
    throw error;
  }

  logger.info("All migrations completed successfully");
}
