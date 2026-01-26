import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { Database as BunDatabase } from "bun:sqlite";
import { Kysely } from "kysely";
import { BunSqliteDialect } from "../../src/db/bunSqliteDialect";
import type { Database as DatabaseSchema, NewTestExecution, NewTestExecutionStep, NewTestExecutionScreen } from "../../src/db/types";
import { runMigrations } from "../../src/db/migrator";

describe("TestRunResources - Database Schema", () => {
  let db: Kysely<DatabaseSchema>;

  beforeAll(async () => {
    const sqliteDb = new BunDatabase(":memory:");
    // Enable foreign key constraints for cascade delete
    sqliteDb.exec("PRAGMA foreign_keys = ON;");

    db = new Kysely<DatabaseSchema>({
      dialect: new BunSqliteDialect({
        database: sqliteDb,
      }),
    });
    await runMigrations(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    // Clear test data in correct order for foreign key constraints
    await db.deleteFrom("test_execution_screens").execute().catch(() => {});
    await db.deleteFrom("test_execution_steps").execute().catch(() => {});
    await db.deleteFrom("test_executions").execute().catch(() => {});
  });

  describe("test_executions table", () => {
    test("supports new columns: error_message, video_path, snapshot_path", async () => {
      const entry: NewTestExecution = {
        test_class: "com.example.TestClass",
        test_method: "testMethod",
        duration_ms: 1500,
        status: "failed",
        timestamp: Date.now(),
        device_id: "emulator-5554",
        device_name: "Pixel 6",
        device_platform: "android",
        device_type: "emulator",
        error_message: "Element not found",
        video_path: "/path/to/video.mp4",
        snapshot_path: "/path/to/snapshot.png",
      };

      const result = await db.insertInto("test_executions").values(entry).executeTakeFirst();
      expect(Number(result.insertId)).toBeGreaterThan(0);

      const rows = await db
        .selectFrom("test_executions")
        .select(["id", "error_message", "video_path", "snapshot_path"])
        .where("id", "=", Number(result.insertId))
        .execute();

      expect(rows).toHaveLength(1);
      expect(rows[0].error_message).toBe("Element not found");
      expect(rows[0].video_path).toBe("/path/to/video.mp4");
      expect(rows[0].snapshot_path).toBe("/path/to/snapshot.png");
    });
  });

  describe("test_execution_steps table", () => {
    test("stores step data with foreign key to test_executions", async () => {
      // First create a test execution
      const execResult = await db
        .insertInto("test_executions")
        .values({
          test_class: "com.example.TestClass",
          test_method: "testMethod",
          duration_ms: 1500,
          status: "passed",
          timestamp: Date.now(),
        })
        .executeTakeFirst();
      const executionId = Number(execResult.insertId);

      // Now create steps
      const steps: NewTestExecutionStep[] = [
        {
          execution_id: executionId,
          step_index: 0,
          action: "tapOn",
          target: 'text="Login"',
          status: "completed",
          duration_ms: 200,
          screen_name: "LoginScreen",
          screenshot_path: null,
          error_message: null,
          details_json: null,
        },
        {
          execution_id: executionId,
          step_index: 1,
          action: "inputText",
          target: 'id="username"',
          status: "completed",
          duration_ms: 300,
          screen_name: "LoginScreen",
          screenshot_path: null,
          error_message: null,
          details_json: JSON.stringify({ text: "testuser" }),
        },
      ];

      await db.insertInto("test_execution_steps").values(steps).execute();

      const storedSteps = await db
        .selectFrom("test_execution_steps")
        .select(["id", "step_index", "action", "target", "status", "duration_ms", "screen_name"])
        .where("execution_id", "=", executionId)
        .orderBy("step_index", "asc")
        .execute();

      expect(storedSteps).toHaveLength(2);
      expect(storedSteps[0].action).toBe("tapOn");
      expect(storedSteps[0].target).toBe('text="Login"');
      expect(storedSteps[0].screen_name).toBe("LoginScreen");
      expect(storedSteps[1].action).toBe("inputText");
    });

    test("cascades delete when test_execution is deleted", async () => {
      // Create a test execution with steps
      const execResult = await db
        .insertInto("test_executions")
        .values({
          test_class: "com.example.TestClass",
          test_method: "testCascade",
          duration_ms: 100,
          status: "passed",
          timestamp: Date.now(),
        })
        .executeTakeFirst();
      const executionId = Number(execResult.insertId);

      await db
        .insertInto("test_execution_steps")
        .values({
          execution_id: executionId,
          step_index: 0,
          action: "tapOn",
          status: "completed",
          duration_ms: 100,
        })
        .execute();

      // Verify step exists
      const stepsBefore = await db
        .selectFrom("test_execution_steps")
        .select("id")
        .where("execution_id", "=", executionId)
        .execute();
      expect(stepsBefore).toHaveLength(1);

      // Delete the execution
      await db.deleteFrom("test_executions").where("id", "=", executionId).execute();

      // Verify step was cascade deleted
      const stepsAfter = await db
        .selectFrom("test_execution_steps")
        .select("id")
        .where("execution_id", "=", executionId)
        .execute();
      expect(stepsAfter).toHaveLength(0);
    });
  });

  describe("test_execution_screens table", () => {
    test("stores screens visited with foreign key to test_executions", async () => {
      const execResult = await db
        .insertInto("test_executions")
        .values({
          test_class: "com.example.TestClass",
          test_method: "testScreens",
          duration_ms: 1500,
          status: "passed",
          timestamp: Date.now(),
        })
        .executeTakeFirst();
      const executionId = Number(execResult.insertId);

      const now = Date.now();
      const screens: NewTestExecutionScreen[] = [
        { execution_id: executionId, screen_name: "LoginScreen", visit_order: 0, timestamp: now - 1000 },
        { execution_id: executionId, screen_name: "HomeScreen", visit_order: 1, timestamp: now - 500 },
        { execution_id: executionId, screen_name: "ProfileScreen", visit_order: 2, timestamp: now },
      ];

      await db.insertInto("test_execution_screens").values(screens).execute();

      const storedScreens = await db
        .selectFrom("test_execution_screens")
        .select(["screen_name", "visit_order", "timestamp"])
        .where("execution_id", "=", executionId)
        .orderBy("visit_order", "asc")
        .execute();

      expect(storedScreens).toHaveLength(3);
      expect(storedScreens.map(s => s.screen_name)).toEqual([
        "LoginScreen",
        "HomeScreen",
        "ProfileScreen",
      ]);
    });
  });
});
