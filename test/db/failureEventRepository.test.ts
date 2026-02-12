import { beforeEach, afterEach, describe, expect, test } from "bun:test";
import type { Kysely } from "kysely";
import type { Database } from "../../src/db/types";
import { FailureEventRepository } from "../../src/db/failureEventRepository";
import { createTestDatabase } from "./testDbHelper";
import { FakeTimer } from "../fakes/FakeTimer";
import type { CrashEvent, AnrEvent } from "../../src/utils/interfaces/CrashMonitor";

function makeCrashEvent(overrides: Partial<CrashEvent> = {}): CrashEvent {
  return {
    deviceId: "emulator-5554",
    packageName: "com.example.app",
    crashType: "java",
    timestamp: 1000000,
    detectionSource: "logcat",
    exceptionClass: "java.lang.NullPointerException",
    exceptionMessage: "Attempt to invoke virtual method on null",
    stacktrace: "at com.example.app.Main.run(Main.java:42)",
    ...overrides,
  };
}

function makeAnrEvent(overrides: Partial<AnrEvent> = {}): AnrEvent {
  return {
    deviceId: "emulator-5554",
    packageName: "com.example.app",
    timestamp: 2000000,
    detectionSource: "logcat",
    reason: "Input dispatching timed out",
    activity: "com.example.app.MainActivity",
    waitDurationMs: 5000,
    stacktrace: "at android.os.MessageQueue.nativePollOnce(Native Method)",
    ...overrides,
  };
}

describe("FailureEventRepository", () => {
  let db: Kysely<Database>;
  let repo: FailureEventRepository;
  let timer: FakeTimer;

  beforeEach(async () => {
    db = await createTestDatabase();
    timer = new FakeTimer();
    repo = new FailureEventRepository(timer, db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  describe("saveCrash and getCrashes", () => {
    test("saves a crash and retrieves it", async () => {
      const event = makeCrashEvent();
      const id = await repo.saveCrash(event);
      expect(id).toBeGreaterThan(0);

      const crashes = await repo.getCrashes();
      expect(crashes).toHaveLength(1);
      expect(crashes[0].device_id).toBe("emulator-5554");
      expect(crashes[0].package_name).toBe("com.example.app");
      expect(crashes[0].crash_type).toBe("java");
      expect(crashes[0].timestamp).toBe(1000000);
      expect(crashes[0].exception_class).toBe("java.lang.NullPointerException");
      expect(crashes[0].exception_message).toBe("Attempt to invoke virtual method on null");
      expect(crashes[0].stacktrace).toBe("at com.example.app.Main.run(Main.java:42)");
      expect(crashes[0].detection_source).toBe("logcat");
    });

    test("saves multiple crashes and returns them ordered by timestamp desc", async () => {
      await repo.saveCrash(makeCrashEvent({ timestamp: 1000 }));
      await repo.saveCrash(makeCrashEvent({ timestamp: 3000 }));
      await repo.saveCrash(makeCrashEvent({ timestamp: 2000 }));

      const crashes = await repo.getCrashes();
      expect(crashes).toHaveLength(3);
      expect(crashes[0].timestamp).toBe(3000);
      expect(crashes[1].timestamp).toBe(2000);
      expect(crashes[2].timestamp).toBe(1000);
    });

    test("saves crash with optional fields as null", async () => {
      const id = await repo.saveCrash({
        deviceId: "device-1",
        packageName: "com.test",
        crashType: "native",
        timestamp: 5000,
        detectionSource: "tombstone",
      });
      expect(id).toBeGreaterThan(0);

      const crash = await repo.getCrashById(id);
      expect(crash).not.toBeNull();
      expect(crash!.process_name).toBeNull();
      expect(crash!.pid).toBeNull();
      expect(crash!.exception_class).toBeNull();
      expect(crash!.stacktrace).toBeNull();
      expect(crash!.signal).toBeNull();
    });
  });

  describe("saveAnr and getAnrs", () => {
    test("saves an ANR and retrieves it", async () => {
      const event = makeAnrEvent();
      const id = await repo.saveAnr(event);
      expect(id).toBeGreaterThan(0);

      const anrs = await repo.getAnrs();
      expect(anrs).toHaveLength(1);
      expect(anrs[0].device_id).toBe("emulator-5554");
      expect(anrs[0].package_name).toBe("com.example.app");
      expect(anrs[0].timestamp).toBe(2000000);
      expect(anrs[0].reason).toBe("Input dispatching timed out");
      expect(anrs[0].activity).toBe("com.example.app.MainActivity");
      expect(anrs[0].wait_duration_ms).toBe(5000);
      expect(anrs[0].detection_source).toBe("logcat");
    });

    test("saves multiple ANRs and returns them ordered by timestamp desc", async () => {
      await repo.saveAnr(makeAnrEvent({ timestamp: 100 }));
      await repo.saveAnr(makeAnrEvent({ timestamp: 300 }));
      await repo.saveAnr(makeAnrEvent({ timestamp: 200 }));

      const anrs = await repo.getAnrs();
      expect(anrs).toHaveLength(3);
      expect(anrs[0].timestamp).toBe(300);
      expect(anrs[1].timestamp).toBe(200);
      expect(anrs[2].timestamp).toBe(100);
    });

    test("saves ANR with optional fields as null", async () => {
      const id = await repo.saveAnr({
        deviceId: "device-1",
        packageName: "com.test",
        timestamp: 5000,
        detectionSource: "logcat",
      });
      expect(id).toBeGreaterThan(0);

      const anr = await repo.getAnrById(id);
      expect(anr).not.toBeNull();
      expect(anr!.process_name).toBeNull();
      expect(anr!.pid).toBeNull();
      expect(anr!.reason).toBeNull();
      expect(anr!.activity).toBeNull();
      expect(anr!.wait_duration_ms).toBeNull();
      expect(anr!.stacktrace).toBeNull();
    });
  });

  describe("saveToolCall and getToolCallFailures", () => {
    test("saves a failed tool call and retrieves it", async () => {
      const id = await repo.saveToolCall("tapOn", {
        status: "failure",
        errorMessage: "Element not found",
        errorType: "ElementNotFoundError",
        deviceId: "emulator-5554",
        packageName: "com.example.app",
        durationMs: 150,
        toolArgs: '{"element":"button"}',
        sessionUuid: "session-abc",
      });
      expect(id).toBeGreaterThan(0);

      const failures = await repo.getToolCallFailures();
      expect(failures).toHaveLength(1);
      expect(failures[0].tool_name).toBe("tapOn");
      expect(failures[0].status).toBe("failure");
      expect(failures[0].error_message).toBe("Element not found");
      expect(failures[0].error_type).toBe("ElementNotFoundError");
      expect(failures[0].device_id).toBe("emulator-5554");
      expect(failures[0].package_name).toBe("com.example.app");
      expect(failures[0].duration_ms).toBe(150);
      expect(failures[0].tool_args).toBe('{"element":"button"}');
      expect(failures[0].session_uuid).toBe("session-abc");
    });

    test("getToolCallFailures excludes successful tool calls", async () => {
      await repo.saveToolCall("tapOn", { status: "success" });
      await repo.saveToolCall("observe", { status: "failure", errorMessage: "timeout" });

      const failures = await repo.getToolCallFailures();
      expect(failures).toHaveLength(1);
      expect(failures[0].tool_name).toBe("observe");
    });

    test("saveToolCall defaults to success status", async () => {
      await repo.saveToolCall("observe");

      const failures = await repo.getToolCallFailures();
      expect(failures).toHaveLength(0);

      const rows = await db.selectFrom("tool_calls").selectAll().execute();
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("success");
    });
  });

  describe("getCrashById", () => {
    test("returns crash when found", async () => {
      const id = await repo.saveCrash(makeCrashEvent());
      const crash = await repo.getCrashById(id);
      expect(crash).not.toBeNull();
      expect(crash!.id).toBe(id);
      expect(crash!.exception_class).toBe("java.lang.NullPointerException");
    });

    test("returns null when not found", async () => {
      const crash = await repo.getCrashById(99999);
      expect(crash).toBeNull();
    });
  });

  describe("getAnrById", () => {
    test("returns ANR when found", async () => {
      const id = await repo.saveAnr(makeAnrEvent());
      const anr = await repo.getAnrById(id);
      expect(anr).not.toBeNull();
      expect(anr!.id).toBe(id);
      expect(anr!.reason).toBe("Input dispatching timed out");
    });

    test("returns null when not found", async () => {
      const anr = await repo.getAnrById(99999);
      expect(anr).toBeNull();
    });
  });

  describe("filtering by deviceId, packageName, and since", () => {
    test("getCrashes filters by deviceId", async () => {
      await repo.saveCrash(makeCrashEvent({ deviceId: "device-1" }));
      await repo.saveCrash(makeCrashEvent({ deviceId: "device-2" }));

      const crashes = await repo.getCrashes({ deviceId: "device-1" });
      expect(crashes).toHaveLength(1);
      expect(crashes[0].device_id).toBe("device-1");
    });

    test("getCrashes filters by packageName", async () => {
      await repo.saveCrash(makeCrashEvent({ packageName: "com.app.one" }));
      await repo.saveCrash(makeCrashEvent({ packageName: "com.app.two" }));

      const crashes = await repo.getCrashes({ packageName: "com.app.one" });
      expect(crashes).toHaveLength(1);
      expect(crashes[0].package_name).toBe("com.app.one");
    });

    test("getCrashes filters by since timestamp", async () => {
      await repo.saveCrash(makeCrashEvent({ timestamp: 1000 }));
      await repo.saveCrash(makeCrashEvent({ timestamp: 3000 }));
      await repo.saveCrash(makeCrashEvent({ timestamp: 5000 }));

      const crashes = await repo.getCrashes({ since: 2500 });
      expect(crashes).toHaveLength(2);
      expect(crashes[0].timestamp).toBe(5000);
      expect(crashes[1].timestamp).toBe(3000);
    });

    test("getCrashes respects limit", async () => {
      await repo.saveCrash(makeCrashEvent({ timestamp: 1000 }));
      await repo.saveCrash(makeCrashEvent({ timestamp: 2000 }));
      await repo.saveCrash(makeCrashEvent({ timestamp: 3000 }));

      const crashes = await repo.getCrashes({ limit: 2 });
      expect(crashes).toHaveLength(2);
      expect(crashes[0].timestamp).toBe(3000);
      expect(crashes[1].timestamp).toBe(2000);
    });

    test("getAnrs filters by deviceId", async () => {
      await repo.saveAnr(makeAnrEvent({ deviceId: "device-A" }));
      await repo.saveAnr(makeAnrEvent({ deviceId: "device-B" }));

      const anrs = await repo.getAnrs({ deviceId: "device-A" });
      expect(anrs).toHaveLength(1);
      expect(anrs[0].device_id).toBe("device-A");
    });

    test("getAnrs filters by packageName", async () => {
      await repo.saveAnr(makeAnrEvent({ packageName: "com.pkg.x" }));
      await repo.saveAnr(makeAnrEvent({ packageName: "com.pkg.y" }));

      const anrs = await repo.getAnrs({ packageName: "com.pkg.x" });
      expect(anrs).toHaveLength(1);
      expect(anrs[0].package_name).toBe("com.pkg.x");
    });

    test("getAnrs filters by since timestamp", async () => {
      await repo.saveAnr(makeAnrEvent({ timestamp: 100 }));
      await repo.saveAnr(makeAnrEvent({ timestamp: 500 }));

      const anrs = await repo.getAnrs({ since: 300 });
      expect(anrs).toHaveLength(1);
      expect(anrs[0].timestamp).toBe(500);
    });

    test("getCrashes filters by sessionUuid", async () => {
      await repo.saveCrash(makeCrashEvent({ sessionUuid: "sess-1" }));
      await repo.saveCrash(makeCrashEvent({ sessionUuid: "sess-2" }));

      const crashes = await repo.getCrashes({ sessionUuid: "sess-1" });
      expect(crashes).toHaveLength(1);
      expect(crashes[0].session_uuid).toBe("sess-1");
    });

    test("getCrashes filters by navigationNodeId", async () => {
      await repo.saveCrash(makeCrashEvent({ navigationNodeId: 10 }));
      await repo.saveCrash(makeCrashEvent({ navigationNodeId: 20 }));

      const crashes = await repo.getCrashes({ navigationNodeId: 10 });
      expect(crashes).toHaveLength(1);
      expect(crashes[0].navigation_node_id).toBe(10);
    });

    test("getCrashes filters by testExecutionId", async () => {
      await repo.saveCrash(makeCrashEvent({ testExecutionId: 42 }));
      await repo.saveCrash(makeCrashEvent({ testExecutionId: 99 }));

      const crashes = await repo.getCrashes({ testExecutionId: 42 });
      expect(crashes).toHaveLength(1);
      expect(crashes[0].test_execution_id).toBe(42);
    });

    test("getToolCallFailures filters by deviceId", async () => {
      await repo.saveToolCall("tapOn", { status: "failure", deviceId: "d-1", errorMessage: "err" });
      await repo.saveToolCall("tapOn", { status: "failure", deviceId: "d-2", errorMessage: "err" });

      const failures = await repo.getToolCallFailures({ deviceId: "d-1" });
      expect(failures).toHaveLength(1);
      expect(failures[0].device_id).toBe("d-1");
    });

    test("getToolCallFailures filters by sessionUuid", async () => {
      await repo.saveToolCall("tapOn", { status: "failure", sessionUuid: "s-1", errorMessage: "err" });
      await repo.saveToolCall("tapOn", { status: "failure", sessionUuid: "s-2", errorMessage: "err" });

      const failures = await repo.getToolCallFailures({ sessionUuid: "s-1" });
      expect(failures).toHaveLength(1);
      expect(failures[0].session_uuid).toBe("s-1");
    });
  });

  describe("getAllFailures", () => {
    test("combines crashes, ANRs, and tool call failures", async () => {
      await repo.saveCrash(makeCrashEvent({ timestamp: 3000 }));
      await repo.saveAnr(makeAnrEvent({ timestamp: 2000 }));
      await repo.saveToolCall("tapOn", { status: "failure", errorMessage: "err" });

      const all = await repo.getAllFailures();
      expect(all).toHaveLength(3);

      const types = all.map(f => f.type);
      expect(types).toContain("crash");
      expect(types).toContain("anr");
      expect(types).toContain("tool_call_failure");
    });

    test("returns results sorted by timestamp descending", async () => {
      await repo.saveCrash(makeCrashEvent({ timestamp: 1000 }));
      await repo.saveAnr(makeAnrEvent({ timestamp: 3000 }));
      await repo.saveCrash(makeCrashEvent({ timestamp: 2000 }));

      const all = await repo.getAllFailures();
      expect(all).toHaveLength(3);
      expect(all[0].timestamp).toBe(3000);
      expect(all[1].timestamp).toBe(2000);
      expect(all[2].timestamp).toBe(1000);
    });

    test("respects limit across combined results", async () => {
      await repo.saveCrash(makeCrashEvent({ timestamp: 1000 }));
      await repo.saveAnr(makeAnrEvent({ timestamp: 2000 }));
      await repo.saveCrash(makeCrashEvent({ timestamp: 3000 }));

      const all = await repo.getAllFailures({ limit: 2 });
      expect(all).toHaveLength(2);
      expect(all[0].timestamp).toBe(3000);
      expect(all[1].timestamp).toBe(2000);
    });

    test("excludes tool call failures when includeToolCallFailures is false", async () => {
      await repo.saveCrash(makeCrashEvent({ timestamp: 1000 }));
      await repo.saveToolCall("tapOn", { status: "failure", errorMessage: "err" });

      const all = await repo.getAllFailures({ includeToolCallFailures: false });
      expect(all).toHaveLength(1);
      expect(all[0].type).toBe("crash");
    });

    test("crash records contain crash-specific fields", async () => {
      await repo.saveCrash(
        makeCrashEvent({
          crashType: "native",
          exceptionClass: "SIGSEGV",
          signal: "11",
        })
      );

      const all = await repo.getAllFailures();
      const crash = all.find(f => f.type === "crash")!;
      expect(crash.crashType).toBe("native");
      expect(crash.exceptionClass).toBe("SIGSEGV");
      expect(crash.signal).toBe("11");
    });

    test("ANR records contain ANR-specific fields", async () => {
      await repo.saveAnr(
        makeAnrEvent({
          reason: "Broadcast timeout",
          activity: "com.test.Activity",
          waitDurationMs: 10000,
        })
      );

      const all = await repo.getAllFailures();
      const anr = all.find(f => f.type === "anr")!;
      expect(anr.reason).toBe("Broadcast timeout");
      expect(anr.activity).toBe("com.test.Activity");
      expect(anr.waitDurationMs).toBe(10000);
    });

    test("tool call failure records contain tool-specific fields", async () => {
      await repo.saveToolCall("swipeOn", {
        status: "failure",
        errorMessage: "scroll failed",
        errorType: "SwipeError",
        toolArgs: '{"direction":"up"}',
      });

      const all = await repo.getAllFailures();
      const tcf = all.find(f => f.type === "tool_call_failure")!;
      expect(tcf.toolName).toBe("swipeOn");
      expect(tcf.message).toBe("scroll failed");
      expect(tcf.errorType).toBe("SwipeError");
      expect(tcf.toolArgs).toBe('{"direction":"up"}');
    });
  });

  describe("deleteOldFailures", () => {
    test("deletes crashes older than specified days using FakeTimer", async () => {
      const oneDayMs = 24 * 60 * 60 * 1000;
      // Set timer to day 10
      timer.setCurrentTime(10 * oneDayMs);

      // Crash at day 1 (old) and day 9 (recent)
      await repo.saveCrash(makeCrashEvent({ timestamp: 1 * oneDayMs }));
      await repo.saveCrash(makeCrashEvent({ timestamp: 9 * oneDayMs }));

      // Delete failures older than 5 days (cutoff = day 10 - 5 days = day 5)
      await repo.deleteOldFailures(5);

      const crashes = await repo.getCrashes();
      expect(crashes).toHaveLength(1);
      expect(crashes[0].timestamp).toBe(9 * oneDayMs);
    });

    test("deletes ANRs older than specified days using FakeTimer", async () => {
      const oneDayMs = 24 * 60 * 60 * 1000;
      timer.setCurrentTime(10 * oneDayMs);

      await repo.saveAnr(makeAnrEvent({ timestamp: 2 * oneDayMs }));
      await repo.saveAnr(makeAnrEvent({ timestamp: 8 * oneDayMs }));

      await repo.deleteOldFailures(5);

      const anrs = await repo.getAnrs();
      expect(anrs).toHaveLength(1);
      expect(anrs[0].timestamp).toBe(8 * oneDayMs);
    });

    test("deletes old tool call failures using FakeTimer", async () => {
      const oneDayMs = 24 * 60 * 60 * 1000;
      timer.setCurrentTime(10 * oneDayMs);

      // Insert tool calls with timestamps at day 1 and day 9
      // Tool calls store timestamps as ISO strings, so we use direct DB inserts
      // to control timestamps precisely
      await repo.saveToolCall("old-tool", {
        status: "failure",
        errorMessage: "old error",
      });
      await repo.saveToolCall("new-tool", {
        status: "failure",
        errorMessage: "new error",
      });

      // The saveToolCall method uses new Date().toISOString() not the timer,
      // so we manipulate the DB directly for precise timestamp control
      const rows = await db.selectFrom("tool_calls").selectAll().execute();
      expect(rows).toHaveLength(2);

      // Set the first tool call to an old date and second to a recent date
      const oldDate = new Date(1 * oneDayMs).toISOString();
      const newDate = new Date(9 * oneDayMs).toISOString();

      await db
        .updateTable("tool_calls")
        .set({ timestamp: oldDate })
        .where("id", "=", rows[0].id)
        .execute();
      await db
        .updateTable("tool_calls")
        .set({ timestamp: newDate })
        .where("id", "=", rows[1].id)
        .execute();

      await repo.deleteOldFailures(5);

      const remaining = await db
        .selectFrom("tool_calls")
        .selectAll()
        .where("status", "=", "failure")
        .execute();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].tool_name).toBe("new-tool");
    });

    test("keeps all failures when none are old enough", async () => {
      const oneDayMs = 24 * 60 * 60 * 1000;
      timer.setCurrentTime(3 * oneDayMs);

      await repo.saveCrash(makeCrashEvent({ timestamp: 2 * oneDayMs }));
      await repo.saveAnr(makeAnrEvent({ timestamp: 2 * oneDayMs }));

      await repo.deleteOldFailures(5);

      const crashes = await repo.getCrashes();
      const anrs = await repo.getAnrs();
      expect(crashes).toHaveLength(1);
      expect(anrs).toHaveLength(1);
    });
  });

  describe("getFailureCounts", () => {
    test("returns zero counts when no failures exist", async () => {
      const counts = await repo.getFailureCounts();
      expect(counts).toEqual({
        crashes: 0,
        anrs: 0,
        toolCallFailures: 0,
      });
    });

    test("returns correct counts for each type", async () => {
      await repo.saveCrash(makeCrashEvent({ timestamp: 1000 }));
      await repo.saveCrash(makeCrashEvent({ timestamp: 2000 }));
      await repo.saveAnr(makeAnrEvent({ timestamp: 3000 }));
      await repo.saveToolCall("tapOn", { status: "failure", errorMessage: "err" });
      await repo.saveToolCall("observe", { status: "success" });

      const counts = await repo.getFailureCounts();
      expect(counts.crashes).toBe(2);
      expect(counts.anrs).toBe(1);
      expect(counts.toolCallFailures).toBe(1);
    });

    test("respects filters in counts", async () => {
      await repo.saveCrash(makeCrashEvent({ deviceId: "d-1" }));
      await repo.saveCrash(makeCrashEvent({ deviceId: "d-2" }));
      await repo.saveAnr(makeAnrEvent({ deviceId: "d-1" }));

      const counts = await repo.getFailureCounts({ deviceId: "d-1" });
      expect(counts.crashes).toBe(1);
      expect(counts.anrs).toBe(1);
    });

    test("excludes tool call failures when includeToolCallFailures is false", async () => {
      await repo.saveCrash(makeCrashEvent());
      await repo.saveToolCall("tapOn", { status: "failure", errorMessage: "err" });

      const counts = await repo.getFailureCounts({ includeToolCallFailures: false });
      expect(counts.crashes).toBe(1);
      expect(counts.toolCallFailures).toBe(0);
    });
  });
});
