import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { ActionableError, BootedDevice } from "../models";
import { addDeviceTargetingToSchema } from "./toolSchemaHelpers";
import { createJSONToolResponse } from "../utils/toolUtils";
import { DatabaseInspector } from "../features/database/DatabaseInspector";
import { defaultAdbClientFactory } from "../utils/android-cmdline-tools/AdbClientFactory";
import { notifyDatabaseChanged } from "./databaseResources";

// Schema for sqlQuery tool
export const sqlQuerySchema = addDeviceTargetingToSchema(
  z.object({
    appId: z.string().describe("App package ID"),
    databasePath: z.string().describe("Absolute path to the database file"),
    query: z.string().describe("SQL query to execute (SELECT, INSERT, UPDATE, DELETE)")
  })
);

// Type interface for tool arguments
export interface SqlQueryArgs {
  appId: string;
  databasePath: string;
  query: string;
}

/**
 * Extract table names from SQL query for notification purposes.
 *
 * Handles SQLite conflict clauses like INSERT OR REPLACE INTO and UPDATE OR IGNORE.
 */
function extractAffectedTables(query: string): string[] {
  const tables: string[] = [];

  // SQLite conflict clause: OR (ABORT|FAIL|IGNORE|REPLACE|ROLLBACK)
  const conflictClause = "(?:OR\\s+(?:ABORT|FAIL|IGNORE|REPLACE|ROLLBACK)\\s+)?";

  // Match INSERT [OR conflict] INTO table, UPDATE [OR conflict] table, etc.
  const patterns = [
    new RegExp(`INSERT\\s+${conflictClause}INTO\\s+["']?(\\w+)["']?`, "gi"),
    new RegExp(`UPDATE\\s+${conflictClause}["']?(\\w+)["']?`, "gi"),
    /DELETE\s+FROM\s+["']?(\w+)["']?/gi,
    /ALTER\s+TABLE\s+["']?(\w+)["']?/gi,
    /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?["']?(\w+)["']?/gi,
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?(\w+)["']?/gi,
    /TRUNCATE\s+(?:TABLE\s+)?["']?(\w+)["']?/gi
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(query)) !== null) {
      if (match[1] && !tables.includes(match[1])) {
        tables.push(match[1]);
      }
    }
  }

  return tables;
}

/**
 * Determine if query is a mutation (modifies data)
 *
 * Handles CTE queries (WITH ... SELECT/INSERT/UPDATE/DELETE) by looking past
 * the CTE prefix to find the actual statement type.
 */
function isMutationQuery(query: string): boolean {
  const upperQuery = query.trim().toUpperCase();

  // Direct mutations
  if (
    upperQuery.startsWith("INSERT") ||
    upperQuery.startsWith("UPDATE") ||
    upperQuery.startsWith("DELETE") ||
    upperQuery.startsWith("ALTER") ||
    upperQuery.startsWith("DROP") ||
    upperQuery.startsWith("CREATE") ||
    upperQuery.startsWith("TRUNCATE")
  ) {
    return true;
  }

  // CTE queries: WITH ... followed by SELECT/INSERT/UPDATE/DELETE
  if (upperQuery.startsWith("WITH")) {
    const statementType = findStatementAfterCTE(upperQuery);
    // Only INSERT/UPDATE/DELETE are mutations; SELECT is not
    return statementType === "INSERT" || statementType === "UPDATE" || statementType === "DELETE";
  }

  return false;
}

/**
 * Check if text starts with a keyword followed by a word boundary.
 * Prevents matching CTE names like "select_cte" as statement keywords.
 */
function startsWithKeyword(text: string, keyword: string): boolean {
  if (!text.startsWith(keyword)) {return false;}
  const nextChar = text[keyword.length];
  // Word boundary: next char is undefined (end of string) or not a word character
  return nextChar === undefined || !/\w/.test(nextChar);
}

/**
 * Find the actual statement type after CTE definitions.
 *
 * Parses past WITH ... AS (...) clauses to find SELECT/INSERT/UPDATE/DELETE.
 * Uses word boundary checks to avoid matching CTE names like "update_cte".
 */
function findStatementAfterCTE(upperQuery: string): string | null {
  let depth = 0;
  let i = 4; // Skip "WITH"

  while (i < upperQuery.length) {
    const char = upperQuery[i];

    if (char === "(") {
      depth++;
    } else if (char === ")") {
      depth--;
    } else if (depth === 0) {
      // Check for statement keywords at this position (with word boundary)
      const remaining = upperQuery.slice(i).trimStart();
      if (startsWithKeyword(remaining, "SELECT")) {return "SELECT";}
      if (startsWithKeyword(remaining, "INSERT")) {return "INSERT";}
      if (startsWithKeyword(remaining, "UPDATE")) {return "UPDATE";}
      if (startsWithKeyword(remaining, "DELETE")) {return "DELETE";}
    }
    i++;
  }

  return null;
}

/**
 * Register database tools.
 *
 * Only the sqlQuery tool is registered here. Read-only operations
 * (listDatabases, listTables, getTableData, getTableStructure) are
 * exposed as MCP resources instead.
 */
export function registerDatabaseTools() {
  // SQL Query handler
  const sqlQueryHandler = async (device: BootedDevice, args: SqlQueryArgs) => {
    validateAndroidDevice(device);

    try {
      const adb = defaultAdbClientFactory.create(device);
      const inspector = new DatabaseInspector(device, adb);
      const result = await inspector.executeSQL(
        args.appId,
        args.databasePath,
        args.query
      );

      // If this was a mutation, notify resource subscribers of the change
      if (isMutationQuery(args.query)) {
        const affectedTables = extractAffectedTables(args.query);
        await notifyDatabaseChanged(
          device.deviceId,
          args.appId,
          args.databasePath,
          affectedTables
        );
      }

      const message =
        result.type === "query"
          ? `Query returned ${result.rows?.length ?? 0} row(s)`
          : `Mutation affected ${result.rowsAffected ?? 0} row(s)`;

      return createJSONToolResponse({
        message,
        ...result
      });
    } catch (error) {
      if (error instanceof ActionableError) {
        throw error;
      }
      throw new ActionableError(`Failed to execute SQL: ${error}`);
    }
  };

  // Register the sqlQuery tool
  ToolRegistry.registerDeviceAware(
    "sqlQuery",
    "Execute a SQL query on an Android app's database. Supports SELECT, INSERT, UPDATE, DELETE. " +
    "For read-only operations (listing databases, tables, viewing data/schema), use the database resources instead.",
    sqlQuerySchema,
    sqlQueryHandler
  );
}

/**
 * Validate that the device is an Android device
 */
function validateAndroidDevice(device: BootedDevice): void {
  if (device.platform !== "android") {
    throw new ActionableError(
      "Database inspection is only supported on Android devices. " +
      "The app must have AutoMobile SDK integrated with database inspection enabled."
    );
  }
}
