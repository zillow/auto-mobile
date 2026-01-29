import { Kysely } from "kysely";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import type { Database as DatabaseSchema } from "./types";
import { runMigrations } from "./migrator";
import { logger } from "../utils/logger";
import { BunSqliteDialect } from "./bunSqliteDialect";

type BunDatabaseConstructor = typeof import("bun:sqlite").Database;

let bunDatabaseConstructor: BunDatabaseConstructor | null = null;

function isBunRuntime(): boolean {
  return typeof (process.versions as Record<string, string> | undefined)?.bun === "string";
}

function resolveBunDatabaseConstructor(): BunDatabaseConstructor {
  if (!isBunRuntime()) {
    throw new Error("bun:sqlite is only available when running under Bun.");
  }

  if (!bunDatabaseConstructor) {
    const bunSqliteModule = require("bun:sqlite") as { Database: BunDatabaseConstructor };
    bunDatabaseConstructor = bunSqliteModule.Database;
  }

  return bunDatabaseConstructor;
}

// Database file location (defaults to ~/.auto-mobile/auto-mobile.db)
const DEFAULT_DB_DIR = path.join(os.homedir(), ".auto-mobile");
// @deprecated AUTO_MOBILE_DB_PATH - use AUTOMOBILE_DB_PATH instead
// @deprecated AUTO_MOBILE_DB_DIR - use AUTOMOBILE_DB_DIR instead
const ENV_DB_PATH = process.env.AUTOMOBILE_DB_PATH ?? process.env.AUTO_MOBILE_DB_PATH;
const ENV_DB_DIR = process.env.AUTOMOBILE_DB_DIR ?? process.env.AUTO_MOBILE_DB_DIR;
const DB_PATH = ENV_DB_PATH
  ? path.resolve(ENV_DB_PATH)
  : path.join(ENV_DB_DIR ? path.resolve(ENV_DB_DIR) : DEFAULT_DB_DIR, "auto-mobile.db");
const DB_DIR = path.dirname(DB_PATH);

let dbInstance: Kysely<DatabaseSchema> | null = null;
let migrationsRun = false;
let migrationsPromise: Promise<void> | null = null;

/**
 * Get the singleton database instance.
 * Creates the database file and directory if they don't exist.
 */
export function getDatabase(): Kysely<DatabaseSchema> {
  if (!dbInstance) {
    // Ensure directory exists
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    // Use Bun's built-in SQLite
    const BunDatabaseConstructor = resolveBunDatabaseConstructor();
    const sqliteDb = new BunDatabaseConstructor(DB_PATH);

    // Enable WAL mode for better concurrent read performance
    sqliteDb.exec("PRAGMA journal_mode = WAL;");

    // Enable foreign key enforcement for cascade deletes
    sqliteDb.exec("PRAGMA foreign_keys = ON;");

    dbInstance = new Kysely<DatabaseSchema>({
      dialect: new BunSqliteDialect({
        database: sqliteDb,
      }),
    });

    // Run migrations if not already run
    if (!migrationsRun && !migrationsPromise) {
      migrationsPromise = runMigrations(dbInstance as Kysely<unknown>)
        .then(() => {
          migrationsRun = true;
        })
        .catch(error => {
          logger.error("Failed to run migrations on database initialization:", error);
          throw error;
        });
    }
  }

  return dbInstance;
}

export async function ensureMigrations(): Promise<void> {
  if (migrationsRun) {
    return;
  }

  if (!dbInstance) {
    getDatabase();
  }

  if (!migrationsPromise) {
    migrationsPromise = runMigrations(dbInstance as Kysely<unknown>)
      .then(() => {
        migrationsRun = true;
      })
      .catch(error => {
        logger.error("Failed to run migrations on database initialization:", error);
        throw error;
      });
  }

  await migrationsPromise;
}

/**
 * Close the database connection.
 * Call this during graceful shutdown.
 */
export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.destroy();
    dbInstance = null;
  }
}

/**
 * Get the database file path.
 */
export function getDatabasePath(): string {
  return DB_PATH;
}
