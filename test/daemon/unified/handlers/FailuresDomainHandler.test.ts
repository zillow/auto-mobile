import { describe, it, expect, beforeEach } from "bun:test";
import { FailuresDomainHandler } from "../../../../src/daemon/unified/handlers/FailuresDomainHandler";
import { ErrorCodes } from "../../../../src/daemon/unified/UnifiedSocketTypes";

/**
 * Fake repository for testing
 */
class FakeFailureAnalyticsRepository {
  private notificationsResult = {
    notifications: [],
    lastTimestamp: undefined as number | undefined,
    lastId: undefined as number | undefined,
  };
  private groupsResult = {
    groups: [],
    totals: { crashes: 0, anrs: 0, toolFailures: 0 },
  };
  private timelineResult = {
    dataPoints: [],
    previousPeriodTotals: undefined,
  };
  private acknowledgedIds: number[] = [];

  setNotificationsResult(result: typeof this.notificationsResult): void {
    this.notificationsResult = result;
  }

  setGroupsResult(result: typeof this.groupsResult): void {
    this.groupsResult = result;
  }

  setTimelineResult(result: typeof this.timelineResult): void {
    this.timelineResult = result;
  }

  getAcknowledgedIds(): number[] {
    return this.acknowledgedIds;
  }

  async getNotificationsSince(_options: unknown): Promise<typeof this.notificationsResult> {
    return this.notificationsResult;
  }

  async getAggregatedGroups(_options: unknown): Promise<typeof this.groupsResult> {
    return this.groupsResult;
  }

  async getTimelineData(_options: unknown): Promise<typeof this.timelineResult> {
    return this.timelineResult;
  }

  async acknowledgeNotifications(ids: number[]): Promise<void> {
    this.acknowledgedIds = ids;
  }
}

describe("FailuresDomainHandler", () => {
  let handler: FailuresDomainHandler;
  let fakeRepository: FakeFailureAnalyticsRepository;

  beforeEach(() => {
    fakeRepository = new FakeFailureAnalyticsRepository();
    handler = new FailuresDomainHandler(fakeRepository as any);
  });

  describe("domain", () => {
    it("has correct domain name", () => {
      expect(handler.domain).toBe("failures");
    });
  });

  describe("poll_notifications", () => {
    it("returns notifications from repository", async () => {
      fakeRepository.setNotificationsResult({
        notifications: [
          { id: 1, title: "Test", type: "crash", timestamp: 12345 } as any,
        ],
        lastTimestamp: 12345,
        lastId: 1,
      });

      const result = await handler.handleRequest("poll_notifications", {});

      expect(result.error).toBeUndefined();
      expect(result.result).toEqual({
        notifications: [{ id: 1, title: "Test", type: "crash", timestamp: 12345 }],
        lastTimestamp: 12345,
        lastId: 1,
      });
    });

    it("accepts sinceTimestamp parameter", async () => {
      const result = await handler.handleRequest("poll_notifications", {
        sinceTimestamp: 12345,
      });

      expect(result.error).toBeUndefined();
    });

    it("accepts dateRange parameter", async () => {
      const result = await handler.handleRequest("poll_notifications", {
        dateRange: "24h",
      });

      expect(result.error).toBeUndefined();
    });

    it("returns error for invalid sinceTimestamp", async () => {
      const result = await handler.handleRequest("poll_notifications", {
        sinceTimestamp: -1,
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe(ErrorCodes.HANDLER_ERROR);
    });

    it("returns error for invalid limit", async () => {
      const result = await handler.handleRequest("poll_notifications", {
        limit: -1,
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe(ErrorCodes.HANDLER_ERROR);
    });
  });

  describe("poll_groups", () => {
    it("returns groups from repository", async () => {
      fakeRepository.setGroupsResult({
        groups: [{ groupId: "g1", count: 5 } as any],
        totals: { crashes: 3, anrs: 1, toolFailures: 1 },
      });

      const result = await handler.handleRequest("poll_groups", {});

      expect(result.error).toBeUndefined();
      expect(result.result).toEqual({
        groups: [{ groupId: "g1", count: 5 }],
        totals: { crashes: 3, anrs: 1, toolFailures: 1 },
      });
    });

    it("accepts type filter", async () => {
      const result = await handler.handleRequest("poll_groups", {
        type: "crash",
      });

      expect(result.error).toBeUndefined();
    });
  });

  describe("poll_timeline", () => {
    it("returns timeline data from repository", async () => {
      fakeRepository.setTimelineResult({
        dataPoints: [{ timestamp: 12345, count: 10 } as any],
        previousPeriodTotals: { total: 5 } as any,
      });

      const result = await handler.handleRequest("poll_timeline", {});

      expect(result.error).toBeUndefined();
      expect(result.result).toEqual({
        dataPoints: [{ timestamp: 12345, count: 10 }],
        previousPeriodTotals: { total: 5 },
      });
    });

    it("accepts aggregation parameter", async () => {
      const result = await handler.handleRequest("poll_timeline", {
        aggregation: "day",
      });

      expect(result.error).toBeUndefined();
    });

    it("returns error for invalid aggregation", async () => {
      const result = await handler.handleRequest("poll_timeline", {
        aggregation: "invalid",
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe(ErrorCodes.HANDLER_ERROR);
    });
  });

  describe("acknowledge", () => {
    it("acknowledges notifications", async () => {
      const result = await handler.handleRequest("acknowledge", {
        notificationIds: [1, 2, 3],
      });

      expect(result.error).toBeUndefined();
      expect(result.result).toEqual({ acknowledgedCount: 3 });
      expect(fakeRepository.getAcknowledgedIds()).toEqual([1, 2, 3]);
    });

    it("returns error for missing notificationIds", async () => {
      const result = await handler.handleRequest("acknowledge", {});

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it("returns error for invalid notification ID", async () => {
      const result = await handler.handleRequest("acknowledge", {
        notificationIds: [1, -1, 3],
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe(ErrorCodes.INVALID_MESSAGE);
    });
  });

  describe("unknown method", () => {
    it("returns error for unknown method", async () => {
      const result = await handler.handleRequest("unknown_method", {});

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe(ErrorCodes.UNKNOWN_METHOD);
    });
  });

  describe("parseSubscriptionFilter", () => {
    it("extracts type and severity from params", () => {
      const filter = handler.parseSubscriptionFilter({
        type: "crash",
        severity: "high",
      });

      expect(filter).toEqual({ type: "crash", severity: "high" });
    });

    it("returns empty filter for undefined params", () => {
      const filter = handler.parseSubscriptionFilter(undefined);

      expect(filter).toEqual({ type: undefined, severity: undefined });
    });
  });

  describe("matchesFilter", () => {
    it("matches when no filter specified", () => {
      const filter = { type: undefined, severity: undefined };
      const event = { event: "failure_occurred", data: { type: "crash", severity: "high" } };

      expect(handler.matchesFilter(filter, event)).toBe(true);
    });

    it("matches when type matches", () => {
      const filter = { type: "crash" };
      const event = { event: "failure_occurred", data: { type: "crash", severity: "high" } };

      expect(handler.matchesFilter(filter, event)).toBe(true);
    });

    it("does not match when type differs", () => {
      const filter = { type: "anr" };
      const event = { event: "failure_occurred", data: { type: "crash", severity: "high" } };

      expect(handler.matchesFilter(filter, event)).toBe(false);
    });

    it("matches when severity matches", () => {
      const filter = { severity: "high" };
      const event = { event: "failure_occurred", data: { type: "crash", severity: "high" } };

      expect(handler.matchesFilter(filter, event)).toBe(true);
    });

    it("does not match when severity differs", () => {
      const filter = { severity: "low" };
      const event = { event: "failure_occurred", data: { type: "crash", severity: "high" } };

      expect(handler.matchesFilter(filter, event)).toBe(false);
    });
  });

  describe("pushFailure", () => {
    it("emits failure_occurred event", () => {
      const pushedEvents: { event: string; data: unknown }[] = [];
      handler.initialize((event, data) => {
        pushedEvents.push({ event, data });
      });

      handler.pushFailure({
        occurrenceId: "o1",
        groupId: "g1",
        type: "crash",
        severity: "high",
        title: "Test",
        message: "Test message",
        timestamp: 12345,
      });

      expect(pushedEvents).toHaveLength(1);
      expect(pushedEvents[0].event).toBe("failure_occurred");
      expect(pushedEvents[0].data).toEqual({
        occurrenceId: "o1",
        groupId: "g1",
        type: "crash",
        severity: "high",
        title: "Test",
        message: "Test message",
        timestamp: 12345,
      });
    });
  });
});
