import { beforeEach, afterEach, describe, expect, test } from "bun:test";
import type { Kysely } from "kysely";
import type { Database } from "../../src/db/types";
import { createTestDatabase } from "./testDbHelper";
import { FakeTimer } from "../fakes/FakeTimer";
import {
  PerformanceAuditRepository,
  type PerformanceAuditRecord,
  type PerformanceAuditMetricsRecord,
} from "../../src/db/performanceAuditRepository";

function makeMetrics(overrides: Partial<PerformanceAuditMetricsRecord> = {}): PerformanceAuditMetricsRecord {
  return {
    p50Ms: 8,
    p90Ms: 12,
    p95Ms: 14,
    p99Ms: 18,
    jankCount: 2,
    missedVsyncCount: 1,
    slowUiThreadCount: 0,
    frameDeadlineMissedCount: 3,
    cpuUsagePercent: 45,
    touchLatencyMs: 50,
    ...overrides,
  };
}

function makeRecord(overrides: Partial<PerformanceAuditRecord> = {}): PerformanceAuditRecord {
  return {
    deviceId: "device-1",
    sessionId: "session-1",
    packageName: "com.example.app",
    timestamp: "2024-06-01T12:00:00.000Z",
    passed: true,
    metrics: makeMetrics(),
    diagnostics: null,
    ...overrides,
  };
}

describe("PerformanceAuditRepository", () => {
  let db: Kysely<Database>;
  let timer: FakeTimer;
  let repo: PerformanceAuditRepository;

  beforeEach(async () => {
    db = await createTestDatabase();
    timer = new FakeTimer();
    repo = new PerformanceAuditRepository(timer, db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  describe("recordAudit + listResults", () => {
    test("inserts a record and retrieves it via listResults", async () => {
      await repo.recordAudit(makeRecord());

      const page = await repo.listResults({});
      expect(page.results).toHaveLength(1);
      expect(page.hasMore).toBe(false);
      expect(page.nextOffset).toBeNull();

      const entry = page.results[0];
      expect(entry.deviceId).toBe("device-1");
      expect(entry.sessionId).toBe("session-1");
      expect(entry.packageName).toBe("com.example.app");
      expect(entry.timestamp).toBe("2024-06-01T12:00:00.000Z");
      expect(entry.passed).toBe(true);
      expect(entry.diagnostics).toBeNull();
      expect(entry.nodeId).toBeNull();

      expect(entry.metrics.p50Ms).toBe(8);
      expect(entry.metrics.p90Ms).toBe(12);
      expect(entry.metrics.p95Ms).toBe(14);
      expect(entry.metrics.p99Ms).toBe(18);
      expect(entry.metrics.jankCount).toBe(2);
      expect(entry.metrics.missedVsyncCount).toBe(1);
      expect(entry.metrics.slowUiThreadCount).toBe(0);
      expect(entry.metrics.frameDeadlineMissedCount).toBe(3);
      expect(entry.metrics.cpuUsagePercent).toBe(45);
      expect(entry.metrics.touchLatencyMs).toBe(50);
    });

    test("stores passed=false correctly", async () => {
      await repo.recordAudit(makeRecord({ passed: false }));

      const page = await repo.listResults({});
      expect(page.results[0].passed).toBe(false);
    });

    test("stores diagnostics and nodeId", async () => {
      await repo.recordAudit(makeRecord({
        diagnostics: '{"warning":"high_jank"}',
        nodeId: 42,
      }));

      const page = await repo.listResults({});
      expect(page.results[0].diagnostics).toBe('{"warning":"high_jank"}');
      expect(page.results[0].nodeId).toBe(42);
    });

    test("stores live metrics extension fields", async () => {
      await repo.recordAudit(makeRecord({
        metrics: makeMetrics({
          timeToFirstFrameMs: 120,
          timeToInteractiveMs: 350,
          frameRateFps: 60,
        }),
      }));

      const page = await repo.listResults({});
      const m = page.results[0].metrics;
      expect(m.timeToFirstFrameMs).toBe(120);
      expect(m.timeToInteractiveMs).toBe(350);
      expect(m.frameRateFps).toBe(60);
    });

    test("returns results ordered by timestamp desc", async () => {
      await repo.recordAudit(makeRecord({ timestamp: "2024-06-01T10:00:00.000Z", sessionId: "s1" }));
      await repo.recordAudit(makeRecord({ timestamp: "2024-06-01T12:00:00.000Z", sessionId: "s2" }));
      await repo.recordAudit(makeRecord({ timestamp: "2024-06-01T11:00:00.000Z", sessionId: "s3" }));

      const page = await repo.listResults({});
      expect(page.results.map(r => r.sessionId)).toEqual(["s2", "s3", "s1"]);
    });
  });

  describe("pagination", () => {
    test("hasMore is true when more results exist", async () => {
      await repo.recordAudit(makeRecord({ timestamp: "2024-06-01T10:00:00.000Z" }));
      await repo.recordAudit(makeRecord({ timestamp: "2024-06-01T11:00:00.000Z" }));
      await repo.recordAudit(makeRecord({ timestamp: "2024-06-01T12:00:00.000Z" }));

      const page = await repo.listResults({ limit: 2 });
      expect(page.results).toHaveLength(2);
      expect(page.hasMore).toBe(true);
      expect(page.nextOffset).toBe(2);
    });

    test("hasMore is false when all results fit in limit", async () => {
      await repo.recordAudit(makeRecord({ timestamp: "2024-06-01T10:00:00.000Z" }));
      await repo.recordAudit(makeRecord({ timestamp: "2024-06-01T11:00:00.000Z" }));

      const page = await repo.listResults({ limit: 5 });
      expect(page.results).toHaveLength(2);
      expect(page.hasMore).toBe(false);
      expect(page.nextOffset).toBeNull();
    });

    test("offset skips initial results", async () => {
      await repo.recordAudit(makeRecord({ timestamp: "2024-06-01T10:00:00.000Z", sessionId: "s1" }));
      await repo.recordAudit(makeRecord({ timestamp: "2024-06-01T11:00:00.000Z", sessionId: "s2" }));
      await repo.recordAudit(makeRecord({ timestamp: "2024-06-01T12:00:00.000Z", sessionId: "s3" }));

      const page = await repo.listResults({ limit: 2, offset: 1 });
      // Ordered desc: s3, s2, s1 -> offset 1 -> s2, s1
      expect(page.results).toHaveLength(2);
      expect(page.results[0].sessionId).toBe("s2");
      expect(page.results[1].sessionId).toBe("s1");
      expect(page.hasMore).toBe(false);
    });

    test("paging through all results", async () => {
      for (let i = 0; i < 5; i++) {
        await repo.recordAudit(makeRecord({
          timestamp: `2024-06-01T${String(10 + i).padStart(2, "0")}:00:00.000Z`,
          sessionId: `s${i}`,
        }));
      }

      const page1 = await repo.listResults({ limit: 2, offset: 0 });
      expect(page1.results).toHaveLength(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextOffset).toBe(2);

      const page2 = await repo.listResults({ limit: 2, offset: page1.nextOffset! });
      expect(page2.results).toHaveLength(2);
      expect(page2.hasMore).toBe(true);
      expect(page2.nextOffset).toBe(4);

      const page3 = await repo.listResults({ limit: 2, offset: page2.nextOffset! });
      expect(page3.results).toHaveLength(1);
      expect(page3.hasMore).toBe(false);
      expect(page3.nextOffset).toBeNull();
    });
  });

  describe("filtering", () => {
    test("filters by deviceId", async () => {
      await repo.recordAudit(makeRecord({ deviceId: "device-a", timestamp: "2024-06-01T10:00:00.000Z" }));
      await repo.recordAudit(makeRecord({ deviceId: "device-b", timestamp: "2024-06-01T11:00:00.000Z" }));
      await repo.recordAudit(makeRecord({ deviceId: "device-a", timestamp: "2024-06-01T12:00:00.000Z" }));

      const page = await repo.listResults({ deviceId: "device-a" });
      expect(page.results).toHaveLength(2);
      expect(page.results.every(r => r.deviceId === "device-a")).toBe(true);
    });

    test("filters by startTime", async () => {
      await repo.recordAudit(makeRecord({ timestamp: "2024-06-01T08:00:00.000Z", sessionId: "early" }));
      await repo.recordAudit(makeRecord({ timestamp: "2024-06-01T12:00:00.000Z", sessionId: "later" }));

      const page = await repo.listResults({ startTime: "2024-06-01T10:00:00.000Z" });
      expect(page.results).toHaveLength(1);
      expect(page.results[0].sessionId).toBe("later");
    });

    test("filters by endTime", async () => {
      await repo.recordAudit(makeRecord({ timestamp: "2024-06-01T08:00:00.000Z", sessionId: "early" }));
      await repo.recordAudit(makeRecord({ timestamp: "2024-06-01T12:00:00.000Z", sessionId: "later" }));

      const page = await repo.listResults({ endTime: "2024-06-01T10:00:00.000Z" });
      expect(page.results).toHaveLength(1);
      expect(page.results[0].sessionId).toBe("early");
    });

    test("combines deviceId, startTime, and endTime filters", async () => {
      await repo.recordAudit(makeRecord({
        deviceId: "d1", timestamp: "2024-06-01T08:00:00.000Z", sessionId: "s1",
      }));
      await repo.recordAudit(makeRecord({
        deviceId: "d1", timestamp: "2024-06-01T12:00:00.000Z", sessionId: "s2",
      }));
      await repo.recordAudit(makeRecord({
        deviceId: "d2", timestamp: "2024-06-01T12:00:00.000Z", sessionId: "s3",
      }));
      await repo.recordAudit(makeRecord({
        deviceId: "d1", timestamp: "2024-06-01T18:00:00.000Z", sessionId: "s4",
      }));

      const page = await repo.listResults({
        deviceId: "d1",
        startTime: "2024-06-01T10:00:00.000Z",
        endTime: "2024-06-01T14:00:00.000Z",
      });
      expect(page.results).toHaveLength(1);
      expect(page.results[0].sessionId).toBe("s2");
    });
  });

  describe("listResultsSince", () => {
    test("returns results since a given timestamp", async () => {
      await repo.recordAudit(makeRecord({ timestamp: "2024-06-01T08:00:00.000Z", sessionId: "s1" }));
      await repo.recordAudit(makeRecord({ timestamp: "2024-06-01T10:00:00.000Z", sessionId: "s2" }));
      await repo.recordAudit(makeRecord({ timestamp: "2024-06-01T12:00:00.000Z", sessionId: "s3" }));

      const results = await repo.listResultsSince({
        sinceTimestamp: "2024-06-01T09:00:00.000Z",
      });
      // Only s2 and s3 have timestamp > sinceTimestamp
      expect(results).toHaveLength(2);
      expect(results[0].sessionId).toBe("s2");
      expect(results[1].sessionId).toBe("s3");
    });

    test("returns results since a given timestamp and id", async () => {
      await repo.recordAudit(makeRecord({ timestamp: "2024-06-01T10:00:00.000Z", sessionId: "s1" }));
      await repo.recordAudit(makeRecord({ timestamp: "2024-06-01T10:00:00.000Z", sessionId: "s2" }));
      await repo.recordAudit(makeRecord({ timestamp: "2024-06-01T12:00:00.000Z", sessionId: "s3" }));

      // Get all results to find the id of s1
      const all = await repo.listResultsSince({});
      const s1 = all.find(r => r.sessionId === "s1")!;

      const results = await repo.listResultsSince({
        sinceTimestamp: "2024-06-01T10:00:00.000Z",
        sinceId: s1.id,
      });
      // s2 has same timestamp but higher id, s3 has later timestamp
      expect(results).toHaveLength(2);
      expect(results[0].sessionId).toBe("s2");
      expect(results[1].sessionId).toBe("s3");
    });

    test("returns results ordered ascending by timestamp", async () => {
      await repo.recordAudit(makeRecord({ timestamp: "2024-06-01T12:00:00.000Z", sessionId: "s3" }));
      await repo.recordAudit(makeRecord({ timestamp: "2024-06-01T08:00:00.000Z", sessionId: "s1" }));
      await repo.recordAudit(makeRecord({ timestamp: "2024-06-01T10:00:00.000Z", sessionId: "s2" }));

      const results = await repo.listResultsSince({});
      expect(results.map(r => r.sessionId)).toEqual(["s1", "s2", "s3"]);
    });

    test("filters by deviceId", async () => {
      await repo.recordAudit(makeRecord({ deviceId: "d1", timestamp: "2024-06-01T10:00:00.000Z" }));
      await repo.recordAudit(makeRecord({ deviceId: "d2", timestamp: "2024-06-01T11:00:00.000Z" }));

      const results = await repo.listResultsSince({ deviceId: "d1" });
      expect(results).toHaveLength(1);
      expect(results[0].deviceId).toBe("d1");
    });

    test("filters by sessionId", async () => {
      await repo.recordAudit(makeRecord({ sessionId: "s1", timestamp: "2024-06-01T10:00:00.000Z" }));
      await repo.recordAudit(makeRecord({ sessionId: "s2", timestamp: "2024-06-01T11:00:00.000Z" }));

      const results = await repo.listResultsSince({ sessionId: "s1" });
      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe("s1");
    });

    test("filters by packageName", async () => {
      await repo.recordAudit(makeRecord({ packageName: "com.a", timestamp: "2024-06-01T10:00:00.000Z" }));
      await repo.recordAudit(makeRecord({ packageName: "com.b", timestamp: "2024-06-01T11:00:00.000Z" }));

      const results = await repo.listResultsSince({ packageName: "com.b" });
      expect(results).toHaveLength(1);
      expect(results[0].packageName).toBe("com.b");
    });

    test("respects limit", async () => {
      for (let i = 0; i < 5; i++) {
        await repo.recordAudit(makeRecord({
          timestamp: `2024-06-01T${String(10 + i).padStart(2, "0")}:00:00.000Z`,
          sessionId: `s${i}`,
        }));
      }

      const results = await repo.listResultsSince({ limit: 3 });
      expect(results).toHaveLength(3);
    });

    test("clamps limit to max 500", async () => {
      // Insert just 1 record and request a very high limit; should not error
      await repo.recordAudit(makeRecord());
      const results = await repo.listResultsSince({ limit: 99999 });
      expect(results).toHaveLength(1);
    });
  });

  describe("pruneOldRecords", () => {
    test("removes records older than 24 hours based on timer", async () => {
      // Set timer to a known point in time
      const baseTime = new Date("2024-06-02T12:00:00.000Z").getTime();
      timer.setCurrentTime(baseTime);

      // Insert a record 25 hours ago (should be pruned)
      const oldTimestamp = new Date(baseTime - 25 * 60 * 60 * 1000).toISOString();
      await repo.recordAudit(makeRecord({ timestamp: oldTimestamp, sessionId: "old" }));

      // Insert a record 23 hours ago (should be kept)
      const recentTimestamp = new Date(baseTime - 23 * 60 * 60 * 1000).toISOString();
      await repo.recordAudit(makeRecord({ timestamp: recentTimestamp, sessionId: "recent" }));

      const deleted = await repo.pruneOldRecords();
      expect(deleted).toBe(1);

      const page = await repo.listResults({});
      expect(page.results).toHaveLength(1);
      expect(page.results[0].sessionId).toBe("recent");
    });

    test("returns 0 when nothing to prune", async () => {
      const baseTime = new Date("2024-06-02T12:00:00.000Z").getTime();
      timer.setCurrentTime(baseTime);

      // Insert a record 1 hour ago
      const recentTimestamp = new Date(baseTime - 1 * 60 * 60 * 1000).toISOString();
      await repo.recordAudit(makeRecord({ timestamp: recentTimestamp }));

      const deleted = await repo.pruneOldRecords();
      expect(deleted).toBe(0);
    });

    test("returns 0 when table is empty", async () => {
      timer.setCurrentTime(Date.now());
      const deleted = await repo.pruneOldRecords();
      expect(deleted).toBe(0);
    });

    test("prunes multiple old records at once", async () => {
      const baseTime = new Date("2024-06-02T12:00:00.000Z").getTime();
      timer.setCurrentTime(baseTime);

      // Insert 3 old records and 1 recent
      for (let i = 0; i < 3; i++) {
        const ts = new Date(baseTime - (25 + i) * 60 * 60 * 1000).toISOString();
        await repo.recordAudit(makeRecord({ timestamp: ts, sessionId: `old-${i}` }));
      }
      const recentTs = new Date(baseTime - 1 * 60 * 60 * 1000).toISOString();
      await repo.recordAudit(makeRecord({ timestamp: recentTs, sessionId: "recent" }));

      const deleted = await repo.pruneOldRecords();
      expect(deleted).toBe(3);

      const page = await repo.listResults({});
      expect(page.results).toHaveLength(1);
      expect(page.results[0].sessionId).toBe("recent");
    });

    test("advancing timer changes the prune cutoff", async () => {
      const baseTime = new Date("2024-06-02T12:00:00.000Z").getTime();
      timer.setCurrentTime(baseTime);

      // Insert a record 23 hours ago - not yet eligible
      const timestamp = new Date(baseTime - 23 * 60 * 60 * 1000).toISOString();
      await repo.recordAudit(makeRecord({ timestamp, sessionId: "borderline" }));

      let deleted = await repo.pruneOldRecords();
      expect(deleted).toBe(0);

      // Advance timer by 2 hours - now the record is 25 hours old
      timer.advanceTime(2 * 60 * 60 * 1000);

      deleted = await repo.pruneOldRecords();
      expect(deleted).toBe(1);
    });
  });
});
