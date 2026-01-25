import { ActionableError, BootedDevice } from "../../models";
import { AdbExecutor } from "../../utils/android-cmdline-tools/interfaces/AdbExecutor";

/**
 * Database descriptor returned from listDatabases
 */
export interface DatabaseInfo {
  /** Display name of the database */
  name: string;
  /** Absolute path to the database file */
  path: string;
}

/**
 * Column metadata for table structure
 */
export interface ColumnInfo {
  /** Column name */
  name: string;
  /** Column type (TEXT, INTEGER, REAL, BLOB) */
  type: string;
  /** Whether column allows NULL */
  nullable: boolean;
  /** Whether column is primary key */
  primaryKey: boolean;
  /** Default value if any */
  defaultValue: string | null;
}

/**
 * Table structure result
 */
export interface TableStructureResult {
  columns: ColumnInfo[];
}

/**
 * Table data result with pagination
 */
export interface TableDataResult {
  /** Column names */
  columns: string[];
  /** Row data as array of column values */
  rows: any[][];
  /** Total number of rows in table */
  total: number;
}

/**
 * SQL execution result
 */
export interface SQLResult {
  type: "query" | "mutation";
  /** Column names (query only) */
  columns?: string[];
  /** Row data (query only) */
  rows?: any[][];
  /** Number of rows affected (mutation only) */
  rowsAffected?: number;
}

/**
 * Error types from the Android ContentProvider
 */
export type DatabaseErrorType =
  | "DISABLED"
  | "NOT_FOUND"
  | "TABLE_NOT_FOUND"
  | "SQL_ERROR"
  | "NOT_INITIALIZED"
  | "INVALID_PATH"
  | "INVALID_ARGUMENT"
  | "UNKNOWN";

/**
 * Database inspection action for Android apps.
 *
 * Communicates with the AutoMobile SDK's DatabaseInspectorProvider via
 * `adb shell content call` commands.
 */
export class DatabaseInspector {
  constructor(
    private device: BootedDevice,
    private adb: AdbExecutor
  ) {}

  /**
   * List all databases in an app
   */
  async listDatabases(appId: string): Promise<DatabaseInfo[]> {
    const response = await this.contentCall<{ databases: DatabaseInfo[] }>(
      appId,
      "listDatabases"
    );
    return response.databases;
  }

  /**
   * List tables in a database
   */
  async listTables(appId: string, databasePath: string): Promise<string[]> {
    const response = await this.contentCall<{ tables: string[] }>(
      appId,
      "listTables",
      { databasePath }
    );
    return response.tables;
  }

  /**
   * Get table data with pagination
   */
  async getTableData(
    appId: string,
    databasePath: string,
    table: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<TableDataResult> {
    return this.contentCall<TableDataResult>(appId, "getTableData", {
      databasePath,
      table,
      limit: limit.toString(),
      offset: offset.toString()
    });
  }

  /**
   * Get table structure (column definitions)
   */
  async getTableStructure(
    appId: string,
    databasePath: string,
    table: string
  ): Promise<TableStructureResult> {
    return this.contentCall<TableStructureResult>(appId, "getTableStructure", {
      databasePath,
      table
    });
  }

  /**
   * Execute a SQL query
   */
  async executeSQL(
    appId: string,
    databasePath: string,
    query: string
  ): Promise<SQLResult> {
    return this.contentCall<SQLResult>(appId, "executeSQL", {
      databasePath,
      query
    });
  }

  /**
   * Execute a content call to the DatabaseInspectorProvider
   */
  private async contentCall<T>(
    appId: string,
    method: string,
    extras?: Record<string, string>
  ): Promise<T> {
    const uri = `content://${appId}.automobile.database`;
    let cmd = `shell content call --uri ${uri} --method ${method}`;

    if (extras) {
      for (const [key, value] of Object.entries(extras)) {
        cmd += ` --extra ${key}:s:'${this.escapeShellValue(value)}'`;
      }
    }

    const result = await this.adb.executeCommand(cmd);
    return this.parseContentCallResult<T>(result.stdout);
  }

  /**
   * Escape value for shell command
   */
  private escapeShellValue(value: string): string {
    // Escape single quotes for shell
    return value.replace(/'/g, "'\"'\"'");
  }

  /**
   * Parse the Bundle output from content call
   *
   * Format: Bundle[{success=true, result={"databases":[...]}}]
   */
  private parseContentCallResult<T>(output: string): T {
    // Check for success
    const successMatch = output.match(/success=(\w+)/);
    const success = successMatch?.[1] === "true";

    if (!success) {
      const errorType = output.match(/errorType=(\w+)/)?.[1] || "UNKNOWN";
      const errorMatch = output.match(/error=([^,}]+)/);
      const error = errorMatch?.[1]?.trim() || "Unknown error";
      throw new ActionableError(`Database error (${errorType}): ${error}`);
    }

    // Extract the JSON result by finding balanced braces/brackets
    const json = this.extractJsonFromBundle(output);
    if (!json) {
      throw new ActionableError("Failed to parse ContentProvider response: no result found");
    }

    try {
      return JSON.parse(json) as T;
    } catch {
      throw new ActionableError(`Failed to parse ContentProvider response: invalid JSON`);
    }
  }

  /**
   * Extract JSON value from Bundle output by finding balanced braces/brackets
   */
  private extractJsonFromBundle(output: string): string | null {
    const resultIndex = output.indexOf("result=");
    if (resultIndex === -1) {
      return null;
    }

    const startIndex = resultIndex + "result=".length;
    const startChar = output[startIndex];

    if (startChar !== "{" && startChar !== "[") {
      return null;
    }

    const endChar = startChar === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = startIndex; i < output.length; i++) {
      const char = output[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === startChar) {
        depth++;
      } else if (char === endChar) {
        depth--;
        if (depth === 0) {
          return output.slice(startIndex, i + 1);
        }
      }
    }

    return null;
  }
}
