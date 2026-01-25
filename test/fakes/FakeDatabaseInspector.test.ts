import { expect, describe, test, beforeEach } from "bun:test";
import { FakeDatabaseInspector, type MockDatabase } from "./FakeDatabaseInspector";

describe("FakeDatabaseInspector", () => {
  let fake: FakeDatabaseInspector;
  const appId = "com.example.app";

  beforeEach(() => {
    fake = new FakeDatabaseInspector();
  });

  describe("listDatabases", () => {
    test("returns empty list when no databases configured", async () => {
      const databases = await fake.listDatabases(appId);
      expect(databases).toEqual([]);
    });

    test("returns configured databases for app", async () => {
      const mockDb: MockDatabase = {
        name: "app.db",
        path: "/data/data/com.example.app/databases/app.db",
        tables: new Map()
      };

      fake.addDatabase(appId, mockDb);

      const databases = await fake.listDatabases(appId);
      expect(databases).toHaveLength(1);
      expect(databases[0].name).toBe("app.db");
    });

    test("only returns databases for requested app", async () => {
      fake.addDatabase("com.example.app1", {
        name: "app1.db",
        path: "/data/data/com.example.app1/databases/app1.db",
        tables: new Map()
      });

      fake.addDatabase("com.example.app2", {
        name: "app2.db",
        path: "/data/data/com.example.app2/databases/app2.db",
        tables: new Map()
      });

      const databases = await fake.listDatabases("com.example.app1");
      expect(databases).toHaveLength(1);
      expect(databases[0].name).toBe("app1.db");
    });
  });

  describe("listTables", () => {
    test("returns table names from database", async () => {
      const tables = new Map();
      tables.set("users", { columns: [], rows: [] });
      tables.set("orders", { columns: [], rows: [] });

      fake.addDatabase(appId, {
        name: "app.db",
        path: "/data/data/com.example.app/databases/app.db",
        tables
      });

      const result = await fake.listTables(appId, "/data/data/com.example.app/databases/app.db");
      expect(result).toContain("users");
      expect(result).toContain("orders");
    });

    test("throws when database not found", async () => {
      await expect(
        fake.listTables(appId, "/nonexistent/path")
      ).rejects.toThrow("Database not found");
    });
  });

  describe("getTableData", () => {
    test("returns table data with pagination", async () => {
      const tables = new Map();
      tables.set("users", {
        columns: [
          { name: "id", type: "INTEGER", nullable: false, primaryKey: true, defaultValue: null },
          { name: "name", type: "TEXT", nullable: true, primaryKey: false, defaultValue: null }
        ],
        rows: [[1, "Alice"], [2, "Bob"], [3, "Charlie"]]
      });

      fake.addDatabase(appId, {
        name: "app.db",
        path: "/data/data/com.example.app/databases/app.db",
        tables
      });

      const result = await fake.getTableData(
        appId,
        "/data/data/com.example.app/databases/app.db",
        "users",
        2,
        0
      );

      expect(result.columns).toEqual(["id", "name"]);
      expect(result.rows).toHaveLength(2);
      expect(result.total).toBe(3);
    });

    test("respects offset parameter", async () => {
      const tables = new Map();
      tables.set("users", {
        columns: [{ name: "id", type: "INTEGER", nullable: false, primaryKey: true, defaultValue: null }],
        rows: [[1], [2], [3], [4], [5]]
      });

      fake.addDatabase(appId, {
        name: "app.db",
        path: "/data/data/com.example.app/databases/app.db",
        tables
      });

      const result = await fake.getTableData(
        appId,
        "/data/data/com.example.app/databases/app.db",
        "users",
        2,
        2
      );

      expect(result.rows).toEqual([[3], [4]]);
    });

    test("throws when table not found", async () => {
      const tables = new Map();
      fake.addDatabase(appId, {
        name: "app.db",
        path: "/data/data/com.example.app/databases/app.db",
        tables
      });

      await expect(
        fake.getTableData(appId, "/data/data/com.example.app/databases/app.db", "nonexistent")
      ).rejects.toThrow("Table not found");
    });
  });

  describe("getTableStructure", () => {
    test("returns column definitions", async () => {
      const tables = new Map();
      tables.set("users", {
        columns: [
          { name: "id", type: "INTEGER", nullable: false, primaryKey: true, defaultValue: null },
          { name: "name", type: "TEXT", nullable: true, primaryKey: false, defaultValue: "'Unknown'" }
        ],
        rows: []
      });

      fake.addDatabase(appId, {
        name: "app.db",
        path: "/data/data/com.example.app/databases/app.db",
        tables
      });

      const structure = await fake.getTableStructure(
        appId,
        "/data/data/com.example.app/databases/app.db",
        "users"
      );

      expect(structure.columns).toHaveLength(2);
      expect(structure.columns[0].name).toBe("id");
      expect(structure.columns[0].primaryKey).toBe(true);
      expect(structure.columns[1].defaultValue).toBe("'Unknown'");
    });
  });

  describe("executeSQL", () => {
    test("returns configured result for query", async () => {
      fake.setSQLResult("SELECT * FROM users", {
        type: "query",
        columns: ["id", "name"],
        rows: [[1, "Alice"]]
      });

      const result = await fake.executeSQL(appId, "/some/path", "SELECT * FROM users");

      expect(result.type).toBe("query");
      expect(result.rows).toEqual([[1, "Alice"]]);
    });

    test("returns default query result for SELECT", async () => {
      const result = await fake.executeSQL(appId, "/some/path", "SELECT * FROM anything");

      expect(result.type).toBe("query");
      expect(result.columns).toEqual([]);
      expect(result.rows).toEqual([]);
    });

    test("returns default mutation result for INSERT", async () => {
      const result = await fake.executeSQL(
        appId,
        "/some/path",
        "INSERT INTO users (name) VALUES ('Test')"
      );

      expect(result.type).toBe("mutation");
      expect(result.rowsAffected).toBe(1);
    });
  });

  describe("failure mode", () => {
    test("throws configured error when failure mode enabled", async () => {
      fake.setFailureMode(true, "Simulated database error");

      await expect(fake.listDatabases(appId)).rejects.toThrow("Simulated database error");
      await expect(fake.listTables(appId, "/path")).rejects.toThrow("Simulated database error");
    });

    test("works normally after failure mode disabled", async () => {
      fake.setFailureMode(true);
      fake.setFailureMode(false);

      const databases = await fake.listDatabases(appId);
      expect(databases).toEqual([]);
    });
  });

  describe("operation recording", () => {
    test("records all operations", async () => {
      fake.addDatabase(appId, {
        name: "app.db",
        path: "/path/to/db",
        tables: new Map([["users", { columns: [], rows: [] }]])
      });

      await fake.listDatabases(appId);
      await fake.listTables(appId, "/path/to/db");
      await fake.getTableData(appId, "/path/to/db", "users", 10, 0);

      const ops = fake.getOperations();
      expect(ops).toHaveLength(3);
      expect(ops[0].method).toBe("listDatabases");
      expect(ops[1].method).toBe("listTables");
      expect(ops[2].method).toBe("getTableData");
      expect(ops[2].args).toEqual({
        databasePath: "/path/to/db",
        table: "users",
        limit: 10,
        offset: 0
      });
    });

    test("wasMethodCalled returns correct result", async () => {
      await fake.listDatabases(appId);

      expect(fake.wasMethodCalled("listDatabases")).toBe(true);
      expect(fake.wasMethodCalled("listTables")).toBe(false);
    });

    test("getMethodCallCount returns correct count", async () => {
      await fake.listDatabases("app1");
      await fake.listDatabases("app2");
      await fake.listDatabases("app3");

      expect(fake.getMethodCallCount("listDatabases")).toBe(3);
      expect(fake.getMethodCallCount("listTables")).toBe(0);
    });

    test("clearOperations clears all recorded operations", async () => {
      await fake.listDatabases(appId);
      fake.clearOperations();

      expect(fake.getOperations()).toEqual([]);
    });
  });

  describe("reset", () => {
    test("clears all state", async () => {
      fake.addDatabase(appId, {
        name: "app.db",
        path: "/path",
        tables: new Map()
      });
      fake.setFailureMode(true);
      await expect(fake.listDatabases(appId)).rejects.toThrow();

      fake.reset();

      const databases = await fake.listDatabases(appId);
      expect(databases).toEqual([]);
      expect(fake.getOperations()).toHaveLength(1); // Only the listDatabases after reset
    });
  });
});
