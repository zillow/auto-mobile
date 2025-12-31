import { Kysely, SqliteDialect } from "kysely";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import type { Database as DatabaseSchema } from "./types";
import { runMigrations } from "./migrator";
import { logger } from "../utils/logger";
import { BunSqliteDialect } from "./bunSqliteDialect";

// Database file location
const DB_DIR = path.join(os.homedir(), ".auto-mobile");
const DB_PATH = path.join(DB_DIR, "auto-mobile.db");

let dbInstance: Kysely<DatabaseSchema> | null = null;
let migrationsRun = false;

// Detect if we're running in Bun
const isBun = typeof Bun !== "undefined";

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

    if (isBun) {
      // Use Bun's built-in SQLite
      const { Database: BunDatabase } = require("bun:sqlite");
      const sqliteDb = new BunDatabase(DB_PATH);

      // Enable WAL mode for better concurrent read performance
      sqliteDb.exec("PRAGMA journal_mode = WAL;");

      dbInstance = new Kysely<DatabaseSchema>({
        dialect: new BunSqliteDialect({
          database: sqliteDb,
        }),
      });
    } else {
      // Use better-sqlite3 for Node.js
      const Database = require("better-sqlite3");
      const sqliteDb = new Database(DB_PATH);

      // Enable WAL mode for better concurrent read performance
      sqliteDb.pragma("journal_mode = WAL");

      dbInstance = new Kysely<DatabaseSchema>({
        dialect: new SqliteDialect({
          database: sqliteDb,
        }),
      });
    }

    // Run migrations if not already run
    if (!migrationsRun) {
      runMigrations(dbInstance as Kysely<unknown>)
        .then(() => {
          migrationsRun = true;
        })
        .catch(error => {
          logger.error("Failed to run migrations on database initialization:", error);
        });
    }
  }

  return dbInstance;
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
