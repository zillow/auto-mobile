import { beforeEach, afterEach, describe, expect, test } from "bun:test";
import type { Kysely } from "kysely";
import type { Database } from "../../src/db/types";
import { FailureAnalyticsRepository } from "../../src/db/failureAnalyticsRepository";
import type { RecordFailureInput } from "../../src/db/failureAnalyticsRepository";
import { createTestDatabase } from "./testDbHelper";
import { FakeTimer } from "../fakes/FakeTimer";

describe("FailureAnalyticsRepository", () => {
  let db: Kysely<Database>;
  let timer: FakeTimer;
  let repo: FailureAnalyticsRepository;

  beforeEach(async () => {
    db = await createTestDatabase();
    timer = new FakeTimer();
    timer.setCurrentTime(1000000);
    repo = new FailureAnalyticsRepository(timer, db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  function makeFailureInput(overrides: Partial<RecordFailureInput> = {}): RecordFailureInput {
    return {
      type: "crash",
      signature: "com.example.NullPointerException@MainActivity.onCreate",
      title: "NullPointerException in MainActivity",
      message: "Attempt to invoke method on null reference",
      severity: "critical",
      occurrence: {
        deviceModel: "Pixel 7",
        os: "Android 14",
        appVersion: "1.0.0",
        sessionId: "session-1",
      },
      ...overrides,
    };
  }

  describe("recordFailure", () => {
    test("creates a group and occurrence on first failure", async () => {
      const occurrenceId = await repo.recordFailure(makeFailureInput());

      expect(occurrenceId).toBeDefined();
      expect(typeof occurrenceId).toBe("string");

      const groups = await db.selectFrom("failure_groups").selectAll().execute();
      expect(groups).toHaveLength(1);
      expect(groups[0].type).toBe("crash");
      expect(groups[0].signature).toBe("com.example.NullPointerException@MainActivity.onCreate");
      expect(groups[0].title).toBe("NullPointerException in MainActivity");
      expect(groups[0].total_count).toBe(1);
      expect(groups[0].unique_sessions).toBe(1);

      const occurrences = await db.selectFrom("failure_occurrences").selectAll().execute();
      expect(occurrences).toHaveLength(1);
      expect(occurrences[0].id).toBe(occurrenceId);
      expect(occurrences[0].device_model).toBe("Pixel 7");
      expect(occurrences[0].os).toBe("Android 14");
    });

    test("creates a notification for streaming", async () => {
      await repo.recordFailure(makeFailureInput());

      const notifications = await db.selectFrom("failure_notifications").selectAll().execute();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe("crash");
      expect(notifications[0].severity).toBe("critical");
      expect(notifications[0].acknowledged).toBe(0);
    });

    test("updates group count on second occurrence with same signature", async () => {
      await repo.recordFailure(makeFailureInput());

      timer.advanceTime(5000);

      await repo.recordFailure(
        makeFailureInput({
          occurrence: {
            deviceModel: "Pixel 8",
            os: "Android 14",
            appVersion: "1.0.1",
            sessionId: "session-2",
          },
        })
      );

      const groups = await db.selectFrom("failure_groups").selectAll().execute();
      expect(groups).toHaveLength(1);
      expect(groups[0].total_count).toBe(2);
      expect(groups[0].unique_sessions).toBe(2);

      const occurrences = await db.selectFrom("failure_occurrences").selectAll().execute();
      expect(occurrences).toHaveLength(2);
    });

    test("does not increment unique_sessions for same session", async () => {
      await repo.recordFailure(makeFailureInput());

      timer.advanceTime(1000);

      await repo.recordFailure(
        makeFailureInput({
          occurrence: {
            deviceModel: "Pixel 7",
            os: "Android 14",
            appVersion: "1.0.0",
            sessionId: "session-1",
          },
        })
      );

      const groups = await db.selectFrom("failure_groups").selectAll().execute();
      expect(groups[0].total_count).toBe(2);
      expect(groups[0].unique_sessions).toBe(1);
    });

    test("records capture when provided", async () => {
      await repo.recordFailure(
        makeFailureInput({
          capture: {
            type: "screenshot",
            path: "/tmp/screenshot.png",
          },
        })
      );

      const captures = await db.selectFrom("failure_captures").selectAll().execute();
      expect(captures).toHaveLength(1);
      expect(captures[0].type).toBe("screenshot");
      expect(captures[0].path).toBe("/tmp/screenshot.png");
    });

    test("records screens visited", async () => {
      await repo.recordFailure(
        makeFailureInput({
          occurrence: {
            deviceModel: "Pixel 7",
            os: "Android 14",
            appVersion: "1.0.0",
            sessionId: "session-1",
            screensVisited: ["Login", "Home", "Settings"],
          },
        })
      );

      const screens = await db
        .selectFrom("failure_occurrence_screens")
        .selectAll()
        .orderBy("visit_order", "asc")
        .execute();
      expect(screens).toHaveLength(3);
      expect(screens[0].screen_name).toBe("Login");
      expect(screens[1].screen_name).toBe("Home");
      expect(screens[2].screen_name).toBe("Settings");
    });
  });

  describe("getFailureGroups", () => {
    test("returns all groups unfiltered", async () => {
      await repo.recordFailure(makeFailureInput());

      timer.advanceTime(1000);

      await repo.recordFailure(
        makeFailureInput({
          signature: "com.example.OtherException@OtherActivity",
          title: "OtherException",
          type: "anr",
          severity: "high",
        })
      );

      const groups = await repo.getFailureGroups();
      expect(groups).toHaveLength(2);
    });

    test("filters by type", async () => {
      await repo.recordFailure(makeFailureInput());

      timer.advanceTime(1000);

      await repo.recordFailure(
        makeFailureInput({
          signature: "com.example.ANR@MainActivity",
          title: "ANR in MainActivity",
          type: "anr",
          severity: "high",
        })
      );

      const crashGroups = await repo.getFailureGroups({ type: "crash" });
      expect(crashGroups).toHaveLength(1);
      expect(crashGroups[0].type).toBe("crash");

      const anrGroups = await repo.getFailureGroups({ type: "anr" });
      expect(anrGroups).toHaveLength(1);
      expect(anrGroups[0].type).toBe("anr");
    });

    test("filters by severity", async () => {
      await repo.recordFailure(makeFailureInput({ severity: "critical" }));

      timer.advanceTime(1000);

      await repo.recordFailure(
        makeFailureInput({
          signature: "com.example.Warning",
          severity: "low",
        })
      );

      const criticalGroups = await repo.getFailureGroups({ severity: "critical" });
      expect(criticalGroups).toHaveLength(1);
      expect(criticalGroups[0].severity).toBe("critical");
    });

    test("returns group with correct aggregated fields", async () => {
      await repo.recordFailure(
        makeFailureInput({
          occurrence: {
            deviceModel: "Pixel 7",
            os: "Android 14",
            appVersion: "1.0.0",
            sessionId: "session-1",
            screenAtFailure: "HomeScreen",
          },
        })
      );

      const groups = await repo.getFailureGroups();
      expect(groups).toHaveLength(1);

      const group = groups[0];
      expect(group.title).toBe("NullPointerException in MainActivity");
      expect(group.totalCount).toBe(1);
      expect(group.uniqueSessions).toBe(1);
      expect(group.deviceBreakdown).toHaveLength(1);
      expect(group.deviceBreakdown[0].deviceModel).toBe("Pixel 7");
      expect(group.versionBreakdown).toHaveLength(1);
      expect(group.versionBreakdown[0].version).toBe("1.0.0");
    });
  });

  describe("getNotificationsSince", () => {
    test("returns all notifications when no cursor given", async () => {
      await repo.recordFailure(makeFailureInput());

      timer.advanceTime(1000);

      await repo.recordFailure(
        makeFailureInput({
          signature: "sig-2",
          title: "Second failure",
        })
      );

      const response = await repo.getNotificationsSince({});
      expect(response.notifications).toHaveLength(2);
      expect(response.lastTimestamp).toBeDefined();
      expect(response.lastId).toBeDefined();
    });

    test("returns notifications after sinceTimestamp and sinceId cursor", async () => {
      await repo.recordFailure(makeFailureInput());

      // Get the cursor from the first batch
      const firstBatch = await repo.getNotificationsSince({});
      expect(firstBatch.notifications).toHaveLength(1);

      timer.advanceTime(5000);

      await repo.recordFailure(
        makeFailureInput({
          signature: "sig-2",
          title: "Second failure",
        })
      );

      const response = await repo.getNotificationsSince({
        sinceTimestamp: firstBatch.lastTimestamp,
        sinceId: firstBatch.lastId,
      });
      expect(response.notifications).toHaveLength(1);
      expect(response.notifications[0].title).toBe("Second failure");
    });

    test("filters by type", async () => {
      await repo.recordFailure(makeFailureInput({ type: "crash" }));

      timer.advanceTime(1000);

      await repo.recordFailure(
        makeFailureInput({
          signature: "sig-anr",
          type: "anr",
          severity: "high",
        })
      );

      const response = await repo.getNotificationsSince({ type: "crash" });
      expect(response.notifications).toHaveLength(1);
      expect(response.notifications[0].type).toBe("crash");
    });
  });

  describe("acknowledgeNotifications", () => {
    test("marks notifications as acknowledged", async () => {
      await repo.recordFailure(makeFailureInput());

      timer.advanceTime(1000);

      await repo.recordFailure(
        makeFailureInput({
          signature: "sig-2",
          title: "Second failure",
        })
      );

      const before = await repo.getNotificationsSince({});
      expect(before.notifications).toHaveLength(2);
      expect(before.notifications[0].acknowledged).toBe(false);
      expect(before.notifications[1].acknowledged).toBe(false);

      // Acknowledge the first notification
      await repo.acknowledgeNotifications([before.notifications[0].id]);

      const after = await repo.getNotificationsSince({});
      const acked = after.notifications.find(n => n.id === before.notifications[0].id);
      expect(acked!.acknowledged).toBe(true);

      const unacked = after.notifications.find(n => n.id === before.notifications[1].id);
      expect(unacked!.acknowledged).toBe(false);
    });

    test("does nothing for empty array", async () => {
      await repo.acknowledgeNotifications([]);
      // Should not throw
    });

    test("filters by acknowledged status", async () => {
      await repo.recordFailure(makeFailureInput());

      timer.advanceTime(1000);

      await repo.recordFailure(
        makeFailureInput({
          signature: "sig-2",
          title: "Second failure",
        })
      );

      const all = await repo.getNotificationsSince({});
      await repo.acknowledgeNotifications([all.notifications[0].id]);

      const unackedOnly = await repo.getNotificationsSince({ acknowledged: false });
      expect(unackedOnly.notifications).toHaveLength(1);
      expect(unackedOnly.notifications[0].acknowledged).toBe(false);

      const ackedOnly = await repo.getNotificationsSince({ acknowledged: true });
      expect(ackedOnly.notifications).toHaveLength(1);
      expect(ackedOnly.notifications[0].acknowledged).toBe(true);
    });
  });
});
