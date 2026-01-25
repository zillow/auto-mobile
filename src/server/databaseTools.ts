import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { ActionableError, BootedDevice } from "../models";
import { addDeviceTargetingToSchema } from "./toolSchemaHelpers";
import { createJSONToolResponse } from "../utils/toolUtils";
import { DatabaseInspector } from "../features/database/DatabaseInspector";
import { AdbClient } from "../utils/android-cmdline-tools/AdbClient";
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
 * Extract table names from SQL query for notification purposes
 */
function extractAffectedTables(query: string): string[] {
  const tables: string[] = [];

  // Match INSERT INTO table, UPDATE table, DELETE FROM table, ALTER TABLE table
  const patterns = [
    /INSERT\s+INTO\s+["']?(\w+)["']?/gi,
    /UPDATE\s+["']?(\w+)["']?/gi,
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
 * Find the actual statement type after CTE definitions.
 *
 * Parses past WITH ... AS (...) clauses to find SELECT/INSERT/UPDATE/DELETE.
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
      // Check for statement keywords at this position
      const remaining = upperQuery.slice(i).trimStart();
      if (remaining.startsWith("SELECT")) {return "SELECT";}
      if (remaining.startsWith("INSERT")) {return "INSERT";}
      if (remaining.startsWith("UPDATE")) {return "UPDATE";}
      if (remaining.startsWith("DELETE")) {return "DELETE";}
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
      const adb = new AdbClient(device);
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
