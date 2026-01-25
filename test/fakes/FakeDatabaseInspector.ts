import type {
  DatabaseInfo,
  TableDataResult,
  TableStructureResult,
  SQLResult,
  ColumnInfo
} from "../../src/features/database/DatabaseInspector";

/**
 * Mock table definition for testing
 */
export interface MockTable {
  columns: ColumnInfo[];
  rows: any[][];
}

/**
 * Mock database definition for testing
 */
export interface MockDatabase {
  name: string;
  path: string;
  tables: Map<string, MockTable>;
}

/**
 * Recorded operation for verification in tests
 */
export interface RecordedOperation {
  method: string;
  appId: string;
  args: Record<string, any>;
}

/**
 * Fake implementation of DatabaseInspector for testing.
 *
 * Provides programmatic control over database responses without
 * actually executing ADB commands.
 */
export class FakeDatabaseInspector {
  private databases: Map<string, MockDatabase> = new Map();
  private operations: RecordedOperation[] = [];
  private failureMode: { enabled: boolean; error: string } = { enabled: false, error: "" };
  private sqlResults: Map<string, SQLResult> = new Map();

  /**
   * Add a mock database
   */
  addDatabase(appId: string, database: MockDatabase): void {
    const key = `${appId}:${database.path}`;
    this.databases.set(key, database);
  }

  /**
   * Set a mock SQL result for a specific query
   */
  setSQLResult(query: string, result: SQLResult): void {
    this.sqlResults.set(query.trim().toLowerCase(), result);
  }

  /**
   * Enable failure mode to simulate errors
   */
  setFailureMode(enabled: boolean, error: string = "Simulated error"): void {
    this.failureMode = { enabled, error };
  }

  /**
   * List databases for an app
   */
  async listDatabases(appId: string): Promise<DatabaseInfo[]> {
    this.recordOperation("listDatabases", appId, {});

    if (this.failureMode.enabled) {
      throw new Error(this.failureMode.error);
    }

    const databases: DatabaseInfo[] = [];
    for (const [key, db] of this.databases) {
      if (key.startsWith(`${appId}:`)) {
        databases.push({ name: db.name, path: db.path });
      }
    }
    return databases;
  }

  /**
   * List tables in a database
   */
  async listTables(appId: string, databasePath: string): Promise<string[]> {
    this.recordOperation("listTables", appId, { databasePath });

    if (this.failureMode.enabled) {
      throw new Error(this.failureMode.error);
    }

    const key = `${appId}:${databasePath}`;
    const db = this.databases.get(key);
    if (!db) {
      throw new Error(`Database not found: ${databasePath}`);
    }

    return Array.from(db.tables.keys());
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
    this.recordOperation("getTableData", appId, { databasePath, table, limit, offset });

    if (this.failureMode.enabled) {
      throw new Error(this.failureMode.error);
    }

    const key = `${appId}:${databasePath}`;
    const db = this.databases.get(key);
    if (!db) {
      throw new Error(`Database not found: ${databasePath}`);
    }

    const tableData = db.tables.get(table);
    if (!tableData) {
      throw new Error(`Table not found: ${table}`);
    }

    const total = tableData.rows.length;
    const rows = tableData.rows.slice(offset, offset + limit);
    const columns = tableData.columns.map(c => c.name);

    return { columns, rows, total };
  }

  /**
   * Get table structure
   */
  async getTableStructure(
    appId: string,
    databasePath: string,
    table: string
  ): Promise<TableStructureResult> {
    this.recordOperation("getTableStructure", appId, { databasePath, table });

    if (this.failureMode.enabled) {
      throw new Error(this.failureMode.error);
    }

    const key = `${appId}:${databasePath}`;
    const db = this.databases.get(key);
    if (!db) {
      throw new Error(`Database not found: ${databasePath}`);
    }

    const tableData = db.tables.get(table);
    if (!tableData) {
      throw new Error(`Table not found: ${table}`);
    }

    return { columns: tableData.columns };
  }

  /**
   * Execute SQL query
   */
  async executeSQL(
    appId: string,
    databasePath: string,
    query: string
  ): Promise<SQLResult> {
    this.recordOperation("executeSQL", appId, { databasePath, query });

    if (this.failureMode.enabled) {
      throw new Error(this.failureMode.error);
    }

    // Check for pre-configured result
    const configuredResult = this.sqlResults.get(query.trim().toLowerCase());
    if (configuredResult) {
      return configuredResult;
    }

    // Default behavior based on query type
    const upperQuery = query.trim().toUpperCase();
    if (upperQuery.startsWith("SELECT")) {
      return { type: "query", columns: [], rows: [] };
    }

    return { type: "mutation", rowsAffected: 1 };
  }

  /**
   * Get all recorded operations
   */
  getOperations(): RecordedOperation[] {
    return [...this.operations];
  }

  /**
   * Check if a specific method was called
   */
  wasMethodCalled(method: string): boolean {
    return this.operations.some(op => op.method === method);
  }

  /**
   * Get count of times a method was called
   */
  getMethodCallCount(method: string): number {
    return this.operations.filter(op => op.method === method).length;
  }

  /**
   * Clear all recorded operations
   */
  clearOperations(): void {
    this.operations = [];
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.databases.clear();
    this.operations = [];
    this.failureMode = { enabled: false, error: "" };
    this.sqlResults.clear();
  }

  private recordOperation(method: string, appId: string, args: Record<string, any>): void {
    this.operations.push({ method, appId, args });
  }
}
