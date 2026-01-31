import { describe, it, expect, beforeEach } from "bun:test";
import { Socket } from "node:net";
import {
  PerformancePushSocketServer,
  DEFAULT_THRESHOLDS,
  type LivePerformanceData,
} from "../../src/daemon/performancePushSocketServer";
import { FakeTimer } from "../fakes/FakeTimer";
import { FakeSocket } from "../fakes/FakeNetServer";

/**
 * Test helper that wraps PerformancePushSocketServer to allow injecting fake sockets
 * without requiring real network connections.
 */
class TestablePerformancePushSocketServer extends PerformancePushSocketServer {
  constructor(timer: FakeTimer) {
    // Use a dummy path since we won't actually create the socket
    super("/fake/path/test.sock", timer);
  }

  /**
   * Simulate starting the server without creating real socket file
   */
  async startFake(): Promise<void> {
    // Mark as listening without creating real socket
    (this as any).server = { listening: true };
    // Start keepalive using injected timer
    (this as any).onServerStarted();
  }

  /**
   * Simulate closing the server
   */
  async closeFake(): Promise<void> {
    (this as any).onServerClosing();
    (this as any).server = null;
  }

  /**
   * Simulate a client connection and subscription
   */
  simulateSubscription(options: {
    deviceId?: string;
    packageName?: string;
  }): { socket: FakeSocket; subscriptionId: string } {
    const socket = new FakeSocket();

    // Create subscription directly using protected members
    const subscriptionId = `performancepush-${++(this as any).subscriptionCounter}`;
    const timer = (this as any).timer as FakeTimer;
    this.subscribers.set(subscriptionId, {
      socket: socket as unknown as Socket,
      subscriptionId,
      lastActivity: timer.now(),
      filter: {
        deviceId: options.deviceId ?? null,
        packageName: options.packageName ?? null,
      },
    });

    return { socket, subscriptionId };
  }

  /**
   * Simulate a pong response from a subscriber
   */
  simulatePong(subscriptionId: string): void {
    const subscriber = this.subscribers.get(subscriptionId);
    if (subscriber) {
      const timer = (this as any).timer as FakeTimer;
      subscriber.lastActivity = timer.now();
    }
  }

  /**
   * Get subscriber info for testing
   */
  getSubscriber(subscriptionId: string): {
    deviceId: string | null;
    packageName: string | null;
    lastActivity: number;
  } | null {
    const subscriber = this.subscribers.get(subscriptionId);
    if (!subscriber) {return null;}
    return {
      deviceId: subscriber.filter.deviceId,
      packageName: subscriber.filter.packageName,
      lastActivity: subscriber.lastActivity,
    };
  }

  /**
   * Trigger keepalive check manually
   */
  triggerKeepalive(): void {
    (this as any).checkKeepalive();
  }
}

describe("PerformancePushSocketServer", () => {
  let server: TestablePerformancePushSocketServer;
  let timer: FakeTimer;

  beforeEach(async () => {
    timer = new FakeTimer();
    server = new TestablePerformancePushSocketServer(timer);
    await server.startFake();
  });

  it("tracks subscriber count correctly", () => {
    expect(server.getSubscriberCount()).toBe(0);

    server.simulateSubscription({});
    expect(server.getSubscriberCount()).toBe(1);

    server.simulateSubscription({ deviceId: "device-1" });
    expect(server.getSubscriberCount()).toBe(2);
  });

  it("stores subscription filters correctly", () => {
    const { subscriptionId } = server.simulateSubscription({
      deviceId: "emulator-5554",
      packageName: "com.example.app",
    });

    const subscriber = server.getSubscriber(subscriptionId);
    expect(subscriber).not.toBeNull();
    expect(subscriber?.deviceId).toBe("emulator-5554");
    expect(subscriber?.packageName).toBe("com.example.app");
  });

  it("pushes data to all subscribers when no filter", async () => {
    const { socket: socket1 } = server.simulateSubscription({});
    const { socket: socket2 } = server.simulateSubscription({});

    const testData: LivePerformanceData = {
      deviceId: "emulator-5554",
      packageName: "com.example.app",
      timestamp: Date.now(),
      nodeId: 42,
      screenName: "Home",
      metrics: {
        fps: 60,
        frameTimeMs: 16.5,
        jankFrames: 0,
        touchLatencyMs: 45,
        ttffMs: 300,
        ttiMs: 500,
        cpuUsagePercent: 15,
        memoryUsageMb: 128,
      },
      thresholds: DEFAULT_THRESHOLDS,
      health: "healthy",
    };

    server.pushPerformanceData(testData);

    const msgs1 = socket1.getWrittenMessages<{ type: string; data?: LivePerformanceData }>();
    const msgs2 = socket2.getWrittenMessages<{ type: string; data?: LivePerformanceData }>();

    expect(msgs1).toHaveLength(1);
    expect(msgs1[0].type).toBe("performance_push");
    expect(msgs1[0].data?.deviceId).toBe("emulator-5554");

    expect(msgs2).toHaveLength(1);
    expect(msgs2[0].type).toBe("performance_push");
  });

  it("filters pushes by deviceId", async () => {
    const { socket: socket1 } = server.simulateSubscription({ deviceId: "device-1" });
    const { socket: socket2 } = server.simulateSubscription({ deviceId: "device-2" });

    const testData: LivePerformanceData = {
      deviceId: "device-1",
      packageName: "com.example.app",
      timestamp: Date.now(),
      nodeId: null,
      screenName: null,
      metrics: {
        fps: 60, frameTimeMs: 16, jankFrames: 0, touchLatencyMs: null,
        ttffMs: null, ttiMs: null, cpuUsagePercent: null, memoryUsageMb: null,
      },
      thresholds: DEFAULT_THRESHOLDS,
      health: "healthy",
    };

    server.pushPerformanceData(testData);

    const msgs1 = socket1.getWrittenMessages();
    const msgs2 = socket2.getWrittenMessages();

    expect(msgs1).toHaveLength(1);
    expect(msgs2).toHaveLength(0);
  });

  it("filters pushes by packageName", async () => {
    const { socket: socket1 } = server.simulateSubscription({ packageName: "com.app.one" });
    const { socket: socket2 } = server.simulateSubscription({ packageName: "com.app.two" });

    const testData: LivePerformanceData = {
      deviceId: "device-1",
      packageName: "com.app.one",
      timestamp: Date.now(),
      nodeId: null,
      screenName: null,
      metrics: {
        fps: 60, frameTimeMs: 16, jankFrames: 0, touchLatencyMs: null,
        ttffMs: null, ttiMs: null, cpuUsagePercent: null, memoryUsageMb: null,
      },
      thresholds: DEFAULT_THRESHOLDS,
      health: "healthy",
    };

    server.pushPerformanceData(testData);

    expect(socket1.getWrittenMessages()).toHaveLength(1);
    expect(socket2.getWrittenMessages()).toHaveLength(0);
  });

  it("removes destroyed sockets on push", async () => {
    const { socket: socket1 } = server.simulateSubscription({});
    server.simulateSubscription({});

    expect(server.getSubscriberCount()).toBe(2);

    // Destroy socket1
    socket1.destroy();

    // Push data - should clean up destroyed socket
    const testData: LivePerformanceData = {
      deviceId: "device-1",
      packageName: "com.app",
      timestamp: Date.now(),
      nodeId: null,
      screenName: null,
      metrics: {
        fps: 60, frameTimeMs: 16, jankFrames: 0, touchLatencyMs: null,
        ttffMs: null, ttiMs: null, cpuUsagePercent: null, memoryUsageMb: null,
      },
      thresholds: DEFAULT_THRESHOLDS,
      health: "healthy",
    };

    server.pushPerformanceData(testData);

    expect(server.getSubscriberCount()).toBe(1);
  });

  it("removes timed out subscribers on keepalive check", async () => {
    server.simulateSubscription({});
    expect(server.getSubscriberCount()).toBe(1);

    // Advance time past the timeout (30 seconds)
    timer.advanceTimersByTime(31_000);

    // Trigger keepalive check
    server.triggerKeepalive();

    expect(server.getSubscriberCount()).toBe(0);
  });

  it("keeps subscribers alive when they respond to pongs", async () => {
    const { subscriptionId } = server.simulateSubscription({});
    expect(server.getSubscriberCount()).toBe(1);

    // Advance time but not past timeout
    timer.advanceTimersByTime(15_000);

    // Simulate pong response
    server.simulatePong(subscriptionId);

    // Advance more time
    timer.advanceTimersByTime(20_000);

    // Trigger keepalive - subscriber should still be alive
    server.triggerKeepalive();

    expect(server.getSubscriberCount()).toBe(1);
  });

  describe("calculateHealth", () => {
    it("returns healthy when all metrics are good", () => {
      const metrics = {
        fps: 60, frameTimeMs: 16, jankFrames: 0, touchLatencyMs: 50,
        ttffMs: 300, ttiMs: 500, cpuUsagePercent: 20, memoryUsageMb: 100,
      };
      expect(PerformancePushSocketServer.calculateHealth(metrics, DEFAULT_THRESHOLDS)).toBe("healthy");
    });

    it("returns warning when fps is below warning threshold", () => {
      const metrics = {
        fps: 50, frameTimeMs: 16, jankFrames: 0, touchLatencyMs: null,
        ttffMs: null, ttiMs: null, cpuUsagePercent: null, memoryUsageMb: null,
      };
      expect(PerformancePushSocketServer.calculateHealth(metrics, DEFAULT_THRESHOLDS)).toBe("warning");
    });

    it("returns critical when fps is below critical threshold", () => {
      const metrics = {
        fps: 40, frameTimeMs: 16, jankFrames: 0, touchLatencyMs: null,
        ttffMs: null, ttiMs: null, cpuUsagePercent: null, memoryUsageMb: null,
      };
      expect(PerformancePushSocketServer.calculateHealth(metrics, DEFAULT_THRESHOLDS)).toBe("critical");
    });

    it("returns warning when frame time exceeds warning threshold", () => {
      const metrics = {
        fps: 60, frameTimeMs: 25, jankFrames: 0, touchLatencyMs: null,
        ttffMs: null, ttiMs: null, cpuUsagePercent: null, memoryUsageMb: null,
      };
      expect(PerformancePushSocketServer.calculateHealth(metrics, DEFAULT_THRESHOLDS)).toBe("warning");
    });

    it("returns critical when frame time exceeds critical threshold", () => {
      const metrics = {
        fps: 60, frameTimeMs: 40, jankFrames: 0, touchLatencyMs: null,
        ttffMs: null, ttiMs: null, cpuUsagePercent: null, memoryUsageMb: null,
      };
      expect(PerformancePushSocketServer.calculateHealth(metrics, DEFAULT_THRESHOLDS)).toBe("critical");
    });

    it("returns warning when touch latency is high", () => {
      const metrics = {
        fps: 60, frameTimeMs: 16, jankFrames: 0, touchLatencyMs: 150,
        ttffMs: null, ttiMs: null, cpuUsagePercent: null, memoryUsageMb: null,
      };
      expect(PerformancePushSocketServer.calculateHealth(metrics, DEFAULT_THRESHOLDS)).toBe("warning");
    });

    it("returns critical when touch latency is very high", () => {
      const metrics = {
        fps: 60, frameTimeMs: 16, jankFrames: 0, touchLatencyMs: 250,
        ttffMs: null, ttiMs: null, cpuUsagePercent: null, memoryUsageMb: null,
      };
      expect(PerformancePushSocketServer.calculateHealth(metrics, DEFAULT_THRESHOLDS)).toBe("critical");
    });

    it("returns warning when jank frames exceed warning threshold", () => {
      const metrics = {
        fps: 60, frameTimeMs: 16, jankFrames: 7, touchLatencyMs: null,
        ttffMs: null, ttiMs: null, cpuUsagePercent: null, memoryUsageMb: null,
      };
      expect(PerformancePushSocketServer.calculateHealth(metrics, DEFAULT_THRESHOLDS)).toBe("warning");
    });

    it("returns critical when jank frames exceed critical threshold", () => {
      const metrics = {
        fps: 60, frameTimeMs: 16, jankFrames: 15, touchLatencyMs: null,
        ttffMs: null, ttiMs: null, cpuUsagePercent: null, memoryUsageMb: null,
      };
      expect(PerformancePushSocketServer.calculateHealth(metrics, DEFAULT_THRESHOLDS)).toBe("critical");
    });

    it("returns warning when TTFF exceeds warning threshold", () => {
      const metrics = {
        fps: 60, frameTimeMs: 16, jankFrames: 0, touchLatencyMs: null,
        ttffMs: 600, ttiMs: null, cpuUsagePercent: null, memoryUsageMb: null,
      };
      expect(PerformancePushSocketServer.calculateHealth(metrics, DEFAULT_THRESHOLDS)).toBe("warning");
    });

    it("returns critical when TTFF exceeds critical threshold", () => {
      const metrics = {
        fps: 60, frameTimeMs: 16, jankFrames: 0, touchLatencyMs: null,
        ttffMs: 1200, ttiMs: null, cpuUsagePercent: null, memoryUsageMb: null,
      };
      expect(PerformancePushSocketServer.calculateHealth(metrics, DEFAULT_THRESHOLDS)).toBe("critical");
    });

    it("returns warning when TTI exceeds warning threshold", () => {
      const metrics = {
        fps: 60, frameTimeMs: 16, jankFrames: 0, touchLatencyMs: null,
        ttffMs: null, ttiMs: 800, cpuUsagePercent: null, memoryUsageMb: null,
      };
      expect(PerformancePushSocketServer.calculateHealth(metrics, DEFAULT_THRESHOLDS)).toBe("warning");
    });

    it("returns critical when TTI exceeds critical threshold", () => {
      const metrics = {
        fps: 60, frameTimeMs: 16, jankFrames: 0, touchLatencyMs: null,
        ttffMs: null, ttiMs: 1600, cpuUsagePercent: null, memoryUsageMb: null,
      };
      expect(PerformancePushSocketServer.calculateHealth(metrics, DEFAULT_THRESHOLDS)).toBe("critical");
    });

    it("handles all null metrics as healthy", () => {
      const metrics = {
        fps: null, frameTimeMs: null, jankFrames: null, touchLatencyMs: null,
        ttffMs: null, ttiMs: null, cpuUsagePercent: null, memoryUsageMb: null,
      };
      expect(PerformancePushSocketServer.calculateHealth(metrics, DEFAULT_THRESHOLDS)).toBe("healthy");
    });
  });
});
