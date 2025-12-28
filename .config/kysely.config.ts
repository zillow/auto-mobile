import { defineConfig } from "kysely-ctl";
import Database from "better-sqlite3";
import { SqliteDialect } from "kysely";
import * as path from "path";
import * as os from "os";

// Database path: ~/.auto-mobile/auto-mobile.db
const dbPath = path.join(os.homedir(), ".auto-mobile", "auto-mobile.db");

export default defineConfig({
  dialect: new SqliteDialect({
    database: new Database(dbPath),
  }),
  migrations: {
    migrationFolder: path.join(__dirname, "../src/db/migrations"),
  },
});
