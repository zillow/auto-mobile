import { describe, it, expect, beforeEach } from "bun:test";
import {
  NetworkState,
  type NetworkNotification,
  type ResourceNotifier,
} from "../../src/server/NetworkState";
import { FakeTimer } from "../fakes/FakeTimer";

class FakeNotifier implements ResourceNotifier {
  notifications: string[] = [];

  notifyResourceUpdated(uri: string): void {
    this.notifications.push(uri);
  }
}

function makeNotification(overrides: Partial<NetworkNotification> = {}): NetworkNotification {
  return {
    id: 1,
    timestamp: 1000,
    method: "GET",
    url: "https://api.example.com/data",
    host: "api.example.com",
    path: "/data",
    statusCode: 200,
    durationMs: 100,
    contentType: "application/json",
    error: null,
    ...overrides,
  };
}

describe("NetworkState", () => {
  let state: NetworkState;
  let timer: FakeTimer;
  let notifier: FakeNotifier;

  beforeEach(() => {
    timer = new FakeTimer();
    notifier = new FakeNotifier();
    state = new NetworkState({ timer, notifier });
  });

  describe("capture", () => {
    it("defaults to false", () => {
      expect(state.capturing).toBe(false);
    });

    it("toggles capture", () => {
      state.setCapture(true);
      expect(state.capturing).toBe(true);
      state.setCapture(false);
      expect(state.capturing).toBe(false);
    });
  });

  describe("simulation", () => {
    it("starts simulation with expiration", () => {
      state.startSimulation("http500", 30, null);
      const sim = state.simulation;
      expect(sim).not.toBeNull();
      expect(sim!.errorType).toBe("http500");
      expect(sim!.limit).toBeNull();
      expect(sim!.expiresAt).toBe(30_000);
    });

    it("expires simulation after duration", () => {
      state.startSimulation("timeout", 10, null);
      expect(state.simulation).not.toBeNull();

      timer.advanceTime(10_000);
      expect(state.simulation).toBeNull();
    });

    it("cancels simulation", () => {
      state.startSimulation("http500", 30, null);
      state.cancelSimulation();
      expect(state.simulation).toBeNull();
    });

    it("tracks limit", () => {
      state.startSimulation("dnsFailure", 60, 5);
      const sim = state.simulation;
      expect(sim!.limit).toBe(5);
      expect(sim!.remaining).toBe(5);
    });

    it("replaces previous simulation", () => {
      state.startSimulation("http500", 30, null);
      state.startSimulation("timeout", 60, 3);
      const sim = state.simulation;
      expect(sim!.errorType).toBe("timeout");
      expect(sim!.limit).toBe(3);
    });
  });

  describe("notification config", () => {
    it("has sensible defaults", () => {
      expect(state.notifFilter).toBe("all");
      expect(state.notifDebounceMs).toBe(100);
      expect(state.slowThresholdMs).toBe(2000);
    });

    it("updates filter", () => {
      state.setNotifFilter("errors");
      expect(state.notifFilter).toBe("errors");
    });

    it("updates debounce", () => {
      state.setNotifDebounceMs(500);
      expect(state.notifDebounceMs).toBe(500);
    });

    it("updates slow threshold", () => {
      state.setSlowThresholdMs(5000);
      expect(state.slowThresholdMs).toBe(5000);
    });
  });

  describe("mocks", () => {
    it("adds mock with generated id", () => {
      const mock = state.addMock({
        host: "api.example.com",
        path: "/data",
        method: "GET",
        limit: null,
        remaining: null,
        statusCode: 200,
        responseHeaders: {},
        responseBody: "{}",
        contentType: "application/json",
      });

      expect(mock.mockId).toMatch(/^mock-\d+$/);
      expect(state.getMocks().size).toBe(1);
    });

    it("removes specific mock", () => {
      const mock = state.addMock({
        host: "a.com",
        path: "/x",
        method: "*",
        limit: null,
        remaining: null,
        statusCode: 200,
        responseHeaders: {},
        responseBody: "",
        contentType: "application/json",
      });

      expect(state.removeMock(mock.mockId)).toBe(true);
      expect(state.getMocks().size).toBe(0);
    });

    it("returns false for unknown mock id", () => {
      expect(state.removeMock("mock-999")).toBe(false);
    });

    it("clears all mocks", () => {
      state.addMock({ host: "a.com", path: "/1", method: "*", limit: null, remaining: null, statusCode: 200, responseHeaders: {}, responseBody: "", contentType: "application/json" });
      state.addMock({ host: "b.com", path: "/2", method: "POST", limit: 5, remaining: 5, statusCode: 201, responseHeaders: {}, responseBody: "", contentType: "application/json" });

      const cleared = state.clearAllMocks();
      expect(cleared).toBe(2);
      expect(state.getMocks().size).toBe(0);
    });

    it("builds mock summary", () => {
      state.addMock({ host: "a.com", path: "/x", method: "GET", limit: null, remaining: null, statusCode: 200, responseHeaders: {}, responseBody: "", contentType: "application/json" });
      state.addMock({ host: "b.com", path: "/y", method: "POST", limit: 3, remaining: 3, statusCode: 201, responseHeaders: {}, responseBody: "", contentType: "application/json" });

      const summary = state.getMockSummary();
      expect(summary["GET a.com/x"]).toBe(-1);
      expect(summary["POST b.com/y"]).toBe(3);
    });
  });

  describe("snapshot", () => {
    it("returns current state", () => {
      state.setCapture(true);
      state.setNotifFilter("errors");
      state.setNotifDebounceMs(200);
      state.setSlowThresholdMs(3000);

      const snap = state.getSnapshot();
      expect(snap.capturing).toBe(true);
      expect(snap.notifFilter).toBe("errors");
      expect(snap.notifDebounceMs).toBe(200);
      expect(snap.slowThresholdMs).toBe(3000);
      expect(snap.simulatingErrors).toBeUndefined();
    });

    it("includes simulation when active", () => {
      state.startSimulation("http500", 60, 10);
      const snap = state.getSnapshot();
      expect(snap.simulatingErrors).toBeDefined();
      expect(snap.simulatingErrors!.errorType).toBe("http500");
      expect(snap.simulatingErrors!.limit).toBe(10);
      expect(snap.simulatingErrors!.remainingSeconds).toBe(60);
    });
  });

  describe("notification dispatch", () => {
    it("does not notify when capture is off", () => {
      state.onNetworkEvent(makeNotification());
      timer.advanceTime(200);
      expect(notifier.notifications).toHaveLength(0);
    });

    it("notifies live and stats on successful request", () => {
      state.setCapture(true);
      state.onNetworkEvent(makeNotification());
      timer.advanceTime(200);

      expect(notifier.notifications).toContain("automobile://network/traffic/live");
      expect(notifier.notifications).toContain("automobile://network/stats");
      expect(notifier.notifications).not.toContain("automobile://network/traffic/errors");
    });

    it("notifies errors resource on 4xx/5xx", () => {
      state.setCapture(true);
      state.onNetworkEvent(makeNotification({ statusCode: 500 }));
      timer.advanceTime(200);

      expect(notifier.notifications).toContain("automobile://network/traffic/errors");
    });

    it("filters to errors only", () => {
      state.setCapture(true);
      state.setNotifFilter("errors");

      // Successful request should be ignored
      state.onNetworkEvent(makeNotification({ statusCode: 200 }));
      timer.advanceTime(200);
      expect(notifier.notifications).toHaveLength(0);

      // Error request should notify
      state.onNetworkEvent(makeNotification({ statusCode: 500 }));
      timer.advanceTime(200);
      expect(notifier.notifications.length).toBeGreaterThan(0);
    });

    it("filters to slow only", () => {
      state.setCapture(true);
      state.setNotifFilter("slow");
      state.setSlowThresholdMs(1000);

      // Fast request should be ignored
      state.onNetworkEvent(makeNotification({ durationMs: 100 }));
      timer.advanceTime(200);
      expect(notifier.notifications).toHaveLength(0);

      // Slow request should notify
      state.onNetworkEvent(makeNotification({ durationMs: 1500 }));
      timer.advanceTime(200);
      expect(notifier.notifications.length).toBeGreaterThan(0);
    });

    it("notifies slow resource on slow request", () => {
      state.setCapture(true);
      state.setSlowThresholdMs(1000);

      state.onNetworkEvent(makeNotification({ durationMs: 1500 }));
      timer.advanceTime(200);

      expect(notifier.notifications).toContain("automobile://network/traffic/slow");
    });

    it("does not notify slow resource on fast request", () => {
      state.setCapture(true);
      state.setSlowThresholdMs(1000);

      state.onNetworkEvent(makeNotification({ durationMs: 100 }));
      timer.advanceTime(200);

      expect(notifier.notifications).not.toContain("automobile://network/traffic/slow");
    });

    it("debounces rapid notifications", () => {
      state.setCapture(true);
      state.setNotifDebounceMs(100);

      state.onNetworkEvent(makeNotification({ id: 1 }));
      state.onNetworkEvent(makeNotification({ id: 2 }));
      state.onNetworkEvent(makeNotification({ id: 3 }));

      // Before debounce fires
      expect(notifier.notifications).toHaveLength(0);

      timer.advanceTime(100);

      // Should only fire one batch of notifications
      expect(notifier.notifications).toContain("automobile://network/traffic/live");
      expect(notifier.notifications).toContain("automobile://network/stats");
    });
  });

  describe("dispose", () => {
    it("cleans up timers and state", () => {
      state.setCapture(true);
      state.startSimulation("http500", 60, null);
      state.onNetworkEvent(makeNotification());

      state.dispose();

      expect(state.simulation).toBeNull();
      expect(state.pendingNotificationCount).toBe(0);
    });
  });
});
