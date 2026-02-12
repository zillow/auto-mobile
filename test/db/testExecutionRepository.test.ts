import { beforeEach, afterEach, describe, expect, test } from "bun:test";
import type { Kysely } from "kysely";
import type { Database } from "../../src/db/types";
import {
  TestExecutionRepository,
  type TestExecutionRecord,
  type TestStepRecord,
} from "../../src/db/testExecutionRepository";
import { createTestDatabase } from "./testDbHelper";
import { FakeTimer } from "../fakes/FakeTimer";

function makeExecution(overrides: Partial<TestExecutionRecord> = {}): TestExecutionRecord {
  return {
    testClass: "com.example.LoginTest",
    testMethod: "testLoginSuccess",
    durationMs: 1500,
    status: "passed",
    timestamp: 1000000,
    ...overrides,
  };
}

function makeStep(overrides: Partial<TestStepRecord> = {}): TestStepRecord {
  return {
    stepIndex: 0,
    action: "tapOn",
    target: "login_button",
    status: "completed",
    durationMs: 200,
    ...overrides,
  };
}

describe("TestExecutionRepository", () => {
  let db: Kysely<Database>;
  let repo: TestExecutionRepository;
  let timer: FakeTimer;

  beforeEach(async () => {
    db = await createTestDatabase();
    timer = new FakeTimer();
    repo = new TestExecutionRepository(timer, db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  describe("recordExecution basic", () => {
    test("records a basic execution and returns an id", async () => {
      const id = await repo.recordExecution(makeExecution());
      expect(id).toBeGreaterThan(0);
    });

    test("records execution with all fields", async () => {
      const id = await repo.recordExecution(
        makeExecution({
          deviceId: "emulator-5554",
          deviceName: "Pixel_6",
          devicePlatform: "android",
          deviceType: "emulator",
          status: "failed",
          errorMessage: "AssertionError: expected true",
        })
      );

      const runs = await repo.getTestRuns();
      expect(runs).toHaveLength(1);
      expect(runs[0].id).toBe(id);
      expect(runs[0].testClass).toBe("com.example.LoginTest");
      expect(runs[0].testMethod).toBe("testLoginSuccess");
      expect(runs[0].status).toBe("failed");
      expect(runs[0].durationMs).toBe(1500);
      expect(runs[0].deviceId).toBe("emulator-5554");
      expect(runs[0].deviceName).toBe("Pixel_6");
      expect(runs[0].platform).toBe("android");
      expect(runs[0].errorMessage).toBe("AssertionError: expected true");
    });

    test("records execution with skipped status", async () => {
      await repo.recordExecution(makeExecution({ status: "skipped" }));

      const runs = await repo.getTestRuns();
      expect(runs).toHaveLength(1);
      expect(runs[0].status).toBe("skipped");
    });
  });

  describe("recordExecution with steps", () => {
    test("records steps alongside the execution", async () => {
      const steps: TestStepRecord[] = [
        makeStep({ stepIndex: 0, action: "tapOn", target: "username_field", durationMs: 100 }),
        makeStep({ stepIndex: 1, action: "inputText", target: "user@test.com", durationMs: 50 }),
        makeStep({ stepIndex: 2, action: "tapOn", target: "submit_button", durationMs: 150 }),
      ];

      await repo.recordExecution(makeExecution({ steps }));

      const runs = await repo.getTestRuns();
      expect(runs).toHaveLength(1);
      expect(runs[0].steps).toHaveLength(3);
      expect(runs[0].steps[0].action).toBe("tapOn");
      expect(runs[0].steps[0].target).toBe("username_field");
      expect(runs[0].steps[0].stepIndex).toBe(0);
      expect(runs[0].steps[1].action).toBe("inputText");
      expect(runs[0].steps[1].stepIndex).toBe(1);
      expect(runs[0].steps[2].action).toBe("tapOn");
      expect(runs[0].steps[2].stepIndex).toBe(2);
    });

    test("records steps with failed status and error message", async () => {
      const steps: TestStepRecord[] = [
        makeStep({ stepIndex: 0, action: "tapOn", status: "completed", durationMs: 100 }),
        makeStep({
          stepIndex: 1,
          action: "inputText",
          status: "failed",
          durationMs: 50,
          errorMessage: "Element not visible",
        }),
      ];

      await repo.recordExecution(makeExecution({ steps }));

      const runs = await repo.getTestRuns();
      expect(runs[0].steps[1].status).toBe("failed");
      expect(runs[0].steps[1].errorMessage).toBe("Element not visible");
    });

    test("records execution with screens visited", async () => {
      await repo.recordExecution(
        makeExecution({
          screensVisited: [
            { screenName: "LoginScreen", timestamp: 1000 },
            { screenName: "HomeScreen", timestamp: 2000 },
          ],
        })
      );

      const runs = await repo.getTestRuns();
      expect(runs).toHaveLength(1);
      expect(runs[0].screensVisited).toEqual(["LoginScreen", "HomeScreen"]);
    });

    test("records execution with no steps yields empty steps array", async () => {
      await repo.recordExecution(makeExecution());

      const runs = await repo.getTestRuns();
      expect(runs[0].steps).toEqual([]);
      expect(runs[0].screensVisited).toEqual([]);
    });
  });

  describe("getTestRuns basic", () => {
    test("returns empty array when no executions exist", async () => {
      const runs = await repo.getTestRuns();
      expect(runs).toEqual([]);
    });

    test("returns multiple runs ordered by timestamp desc by default", async () => {
      await repo.recordExecution(makeExecution({ timestamp: 1000 }));
      await repo.recordExecution(makeExecution({ timestamp: 3000 }));
      await repo.recordExecution(makeExecution({ timestamp: 2000 }));

      const runs = await repo.getTestRuns();
      expect(runs).toHaveLength(3);
      expect(runs[0].startTime).toBe(3000);
      expect(runs[1].startTime).toBe(2000);
      expect(runs[2].startTime).toBe(1000);
    });

    test("returns runs ordered ascending when specified", async () => {
      await repo.recordExecution(makeExecution({ timestamp: 1000 }));
      await repo.recordExecution(makeExecution({ timestamp: 3000 }));
      await repo.recordExecution(makeExecution({ timestamp: 2000 }));

      const runs = await repo.getTestRuns({ orderDirection: "asc" });
      expect(runs).toHaveLength(3);
      expect(runs[0].startTime).toBe(1000);
      expect(runs[1].startTime).toBe(2000);
      expect(runs[2].startTime).toBe(3000);
    });
  });

  describe("getTestRuns with filters", () => {
    test("filters by testClass", async () => {
      await repo.recordExecution(makeExecution({ testClass: "LoginTest" }));
      await repo.recordExecution(makeExecution({ testClass: "HomeTest" }));

      const runs = await repo.getTestRuns({ testClass: "LoginTest" });
      expect(runs).toHaveLength(1);
      expect(runs[0].testClass).toBe("LoginTest");
    });

    test("filters by testMethod", async () => {
      await repo.recordExecution(makeExecution({ testMethod: "testLogin" }));
      await repo.recordExecution(makeExecution({ testMethod: "testLogout" }));

      const runs = await repo.getTestRuns({ testMethod: "testLogin" });
      expect(runs).toHaveLength(1);
      expect(runs[0].testMethod).toBe("testLogin");
    });

    test("respects limit", async () => {
      await repo.recordExecution(makeExecution({ timestamp: 1000 }));
      await repo.recordExecution(makeExecution({ timestamp: 2000 }));
      await repo.recordExecution(makeExecution({ timestamp: 3000 }));

      const runs = await repo.getTestRuns({ limit: 2 });
      expect(runs).toHaveLength(2);
      expect(runs[0].startTime).toBe(3000);
      expect(runs[1].startTime).toBe(2000);
    });

    test("combines testClass and testMethod filters", async () => {
      await repo.recordExecution(makeExecution({ testClass: "LoginTest", testMethod: "testLogin" }));
      await repo.recordExecution(makeExecution({ testClass: "LoginTest", testMethod: "testLogout" }));
      await repo.recordExecution(makeExecution({ testClass: "HomeTest", testMethod: "testLogin" }));

      const runs = await repo.getTestRuns({ testClass: "LoginTest", testMethod: "testLogin" });
      expect(runs).toHaveLength(1);
      expect(runs[0].testClass).toBe("LoginTest");
      expect(runs[0].testMethod).toBe("testLogin");
    });
  });

  describe("getTestRuns with lookbackDays", () => {
    test("filters by lookbackDays using FakeTimer", async () => {
      const oneDayMs = 24 * 60 * 60 * 1000;
      timer.setCurrentTime(10 * oneDayMs);

      // Record at day 2 (old) and day 9 (recent)
      await repo.recordExecution(makeExecution({ timestamp: 2 * oneDayMs }));
      await repo.recordExecution(makeExecution({ timestamp: 9 * oneDayMs }));

      // Lookback 3 days from day 10 = cutoff at day 7
      const runs = await repo.getTestRuns({ lookbackDays: 3 });
      expect(runs).toHaveLength(1);
      expect(runs[0].startTime).toBe(9 * oneDayMs);
    });

    test("returns all runs when lookbackDays covers entire range", async () => {
      const oneDayMs = 24 * 60 * 60 * 1000;
      timer.setCurrentTime(5 * oneDayMs);

      await repo.recordExecution(makeExecution({ timestamp: 1 * oneDayMs }));
      await repo.recordExecution(makeExecution({ timestamp: 4 * oneDayMs }));

      const runs = await repo.getTestRuns({ lookbackDays: 30 });
      expect(runs).toHaveLength(2);
    });

    test("returns no runs when lookbackDays excludes all", async () => {
      const oneDayMs = 24 * 60 * 60 * 1000;
      timer.setCurrentTime(100 * oneDayMs);

      await repo.recordExecution(makeExecution({ timestamp: 1 * oneDayMs }));

      const runs = await repo.getTestRuns({ lookbackDays: 1 });
      expect(runs).toHaveLength(0);
    });
  });

  describe("getTimingStats basic", () => {
    test("returns timing stats grouped by test class and method", async () => {
      await repo.recordExecution(
        makeExecution({
          testClass: "LoginTest",
          testMethod: "testLogin",
          durationMs: 1000,
          status: "passed",
          timestamp: 5000,
        })
      );
      await repo.recordExecution(
        makeExecution({
          testClass: "LoginTest",
          testMethod: "testLogin",
          durationMs: 2000,
          status: "passed",
          timestamp: 6000,
        })
      );

      const stats = await repo.getTimingStats({});
      expect(stats).toHaveLength(1);
      expect(stats[0].testClass).toBe("LoginTest");
      expect(stats[0].testMethod).toBe("testLogin");
      expect(stats[0].averageDurationMs).toBe(1500);
      expect(stats[0].sampleSize).toBe(2);
      expect(stats[0].lastRunTimestampMs).toBe(6000);
      expect(stats[0].passedCount).toBe(2);
      expect(stats[0].failedCount).toBe(0);
      expect(stats[0].skippedCount).toBe(0);
    });

    test("computes counts for different statuses", async () => {
      await repo.recordExecution(
        makeExecution({ testClass: "T", testMethod: "m", status: "passed", durationMs: 100, timestamp: 1000 })
      );
      await repo.recordExecution(
        makeExecution({ testClass: "T", testMethod: "m", status: "failed", durationMs: 200, timestamp: 2000 })
      );
      await repo.recordExecution(
        makeExecution({ testClass: "T", testMethod: "m", status: "skipped", durationMs: 50, timestamp: 3000 })
      );

      const stats = await repo.getTimingStats({});
      expect(stats).toHaveLength(1);
      expect(stats[0].sampleSize).toBe(3);
      expect(stats[0].passedCount).toBe(1);
      expect(stats[0].failedCount).toBe(1);
      expect(stats[0].skippedCount).toBe(1);
    });

    test("groups different test methods separately", async () => {
      await repo.recordExecution(
        makeExecution({ testClass: "LoginTest", testMethod: "testLogin", durationMs: 100, timestamp: 1000 })
      );
      await repo.recordExecution(
        makeExecution({ testClass: "LoginTest", testMethod: "testLogout", durationMs: 200, timestamp: 2000 })
      );

      const stats = await repo.getTimingStats({});
      expect(stats).toHaveLength(2);

      const loginStats = stats.find(s => s.testMethod === "testLogin");
      const logoutStats = stats.find(s => s.testMethod === "testLogout");
      expect(loginStats).toBeDefined();
      expect(logoutStats).toBeDefined();
      expect(loginStats!.averageDurationMs).toBe(100);
      expect(logoutStats!.averageDurationMs).toBe(200);
    });

    test("returns empty array when no executions exist", async () => {
      const stats = await repo.getTimingStats({});
      expect(stats).toEqual([]);
    });

    test("computes standard deviation", async () => {
      // Values: 100, 200, 300 => avg=200, variance = ((100-200)^2 + (200-200)^2 + (300-200)^2)/3 = 20000/3
      // stdDev = sqrt(6666.67) ~= 81.65 -> rounded to 82
      await repo.recordExecution(
        makeExecution({ testClass: "T", testMethod: "m", durationMs: 100, timestamp: 1000 })
      );
      await repo.recordExecution(
        makeExecution({ testClass: "T", testMethod: "m", durationMs: 200, timestamp: 2000 })
      );
      await repo.recordExecution(
        makeExecution({ testClass: "T", testMethod: "m", durationMs: 300, timestamp: 3000 })
      );

      const stats = await repo.getTimingStats({});
      expect(stats).toHaveLength(1);
      expect(stats[0].averageDurationMs).toBe(200);
      // stdDev should be approximately 82 (population stddev of 100,200,300)
      expect(stats[0].stdDevDurationMs).toBeGreaterThanOrEqual(80);
      expect(stats[0].stdDevDurationMs).toBeLessThanOrEqual(84);
    });
  });

  describe("getTimingStats with filters", () => {
    test("filters by testClass", async () => {
      await repo.recordExecution(
        makeExecution({ testClass: "LoginTest", testMethod: "testLogin", durationMs: 100, timestamp: 1000 })
      );
      await repo.recordExecution(
        makeExecution({ testClass: "HomeTest", testMethod: "testHome", durationMs: 200, timestamp: 2000 })
      );

      const stats = await repo.getTimingStats({ testClass: "LoginTest" });
      expect(stats).toHaveLength(1);
      expect(stats[0].testClass).toBe("LoginTest");
    });

    test("filters by testMethod", async () => {
      await repo.recordExecution(
        makeExecution({ testClass: "T", testMethod: "testA", durationMs: 100, timestamp: 1000 })
      );
      await repo.recordExecution(
        makeExecution({ testClass: "T", testMethod: "testB", durationMs: 200, timestamp: 2000 })
      );

      const stats = await repo.getTimingStats({ testMethod: "testA" });
      expect(stats).toHaveLength(1);
      expect(stats[0].testMethod).toBe("testA");
    });

    test("filters by lookbackDays using FakeTimer", async () => {
      const oneDayMs = 24 * 60 * 60 * 1000;
      timer.setCurrentTime(10 * oneDayMs);

      await repo.recordExecution(
        makeExecution({ testClass: "T", testMethod: "m", durationMs: 100, timestamp: 2 * oneDayMs })
      );
      await repo.recordExecution(
        makeExecution({ testClass: "T", testMethod: "m", durationMs: 200, timestamp: 9 * oneDayMs })
      );

      // Lookback 3 days from day 10 = cutoff at day 7, only the day-9 execution is included
      const stats = await repo.getTimingStats({ lookbackDays: 3 });
      expect(stats).toHaveLength(1);
      expect(stats[0].sampleSize).toBe(1);
      expect(stats[0].averageDurationMs).toBe(200);
    });

    test("filters by deviceId", async () => {
      await repo.recordExecution(
        makeExecution({ testClass: "T", testMethod: "m", deviceId: "d-1", durationMs: 100, timestamp: 1000 })
      );
      await repo.recordExecution(
        makeExecution({ testClass: "T", testMethod: "m", deviceId: "d-2", durationMs: 200, timestamp: 2000 })
      );

      const stats = await repo.getTimingStats({ deviceId: "d-1" });
      expect(stats).toHaveLength(1);
      expect(stats[0].averageDurationMs).toBe(100);
    });

    test("respects limit", async () => {
      await repo.recordExecution(
        makeExecution({ testClass: "A", testMethod: "m1", durationMs: 100, timestamp: 1000 })
      );
      await repo.recordExecution(
        makeExecution({ testClass: "B", testMethod: "m2", durationMs: 200, timestamp: 2000 })
      );
      await repo.recordExecution(
        makeExecution({ testClass: "C", testMethod: "m3", durationMs: 300, timestamp: 3000 })
      );

      const stats = await repo.getTimingStats({ limit: 2 });
      expect(stats).toHaveLength(2);
    });

    test("respects minSamples filter", async () => {
      await repo.recordExecution(
        makeExecution({ testClass: "A", testMethod: "m1", durationMs: 100, timestamp: 1000 })
      );
      await repo.recordExecution(
        makeExecution({ testClass: "B", testMethod: "m2", durationMs: 200, timestamp: 2000 })
      );
      await repo.recordExecution(
        makeExecution({ testClass: "B", testMethod: "m2", durationMs: 250, timestamp: 3000 })
      );

      const stats = await repo.getTimingStats({ minSamples: 2 });
      expect(stats).toHaveLength(1);
      expect(stats[0].testClass).toBe("B");
      expect(stats[0].sampleSize).toBe(2);
    });
  });
});
