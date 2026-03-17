import { describe, it, expect, beforeEach } from "bun:test";
import { Socket } from "node:net";
import { TelemetryPushSocketServer } from "../../src/daemon/telemetryPushSocketServer";
import type { TelemetryEvent } from "../../src/features/telemetry/TelemetryRecorder";
import { FakeTimer } from "../fakes/FakeTimer";
import { FakeSocket } from "../fakes/FakeNetServer";

/**
 * Test helper that wraps TelemetryPushSocketServer to allow injecting fake sockets
 * without requiring real network connections.
 */
class TestableTelemetryPushSocketServer extends TelemetryPushSocketServer {
  constructor(timer: FakeTimer) {
    super("/fake/path/telemetry-push.sock", timer);
  }

  async startFake(): Promise<void> {
    (this as any).server = { listening: true };
    (this as any).onServerStarted();
  }

  async closeFake(): Promise<void> {
    (this as any).onServerClosing();
    (this as any).server = null;
  }

  simulateSubscription(options: {
    category?: string | null;
    deviceId?: string | null;
  }): { socket: FakeSocket; subscriptionId: string } {
    const socket = new FakeSocket();
    const subscriptionId = `telemetrypush-${++(this as any).subscriptionCounter}`;
    const timer = (this as any).timer as FakeTimer;
    this.subscribers.set(subscriptionId, {
      socket: socket as unknown as Socket,
      subscriptionId,
      lastActivity: timer.now(),
      filter: {
        category: options.category ?? null,
        deviceId: options.deviceId ?? null,
      },
    });
    return { socket, subscriptionId };
  }

  simulatePong(subscriptionId: string): void {
    const subscriber = this.subscribers.get(subscriptionId);
    if (subscriber) {
      const timer = (this as any).timer as FakeTimer;
      subscriber.lastActivity = timer.now();
    }
  }

  triggerKeepalive(): void {
    (this as any).checkKeepalive();
  }
}

describe("TelemetryPushSocketServer", () => {
  let server: TestableTelemetryPushSocketServer;
  let timer: FakeTimer;

  beforeEach(async () => {
    timer = new FakeTimer();
    server = new TestableTelemetryPushSocketServer(timer);
    await server.startFake();
  });

  it("tracks subscriber count correctly", () => {
    expect(server.getSubscriberCount()).toBe(0);

    server.simulateSubscription({});
    expect(server.getSubscriberCount()).toBe(1);

    server.simulateSubscription({ category: "network" });
    expect(server.getSubscriberCount()).toBe(2);
  });

  it("pushes data to all subscribers when no category filter", () => {
    const { socket: socket1 } = server.simulateSubscription({});
    const { socket: socket2 } = server.simulateSubscription({});

    const event: TelemetryEvent = {
      category: "network",
      timestamp: 1000,
      deviceId: null,
      data: { method: "GET", url: "/users", statusCode: 200, durationMs: 42 },
    };

    server.pushTelemetryEvent(event);

    const msgs1 = socket1.getWrittenMessages<{ type: string; data?: TelemetryEvent }>();
    const msgs2 = socket2.getWrittenMessages<{ type: string; data?: TelemetryEvent }>();

    expect(msgs1).toHaveLength(1);
    expect(msgs1[0].type).toBe("telemetry_push");
    expect(msgs1[0].data?.category).toBe("network");

    expect(msgs2).toHaveLength(1);
    expect(msgs2[0].type).toBe("telemetry_push");
  });

  it("filters pushes by category", () => {
    const { socket: networkSocket } = server.simulateSubscription({ category: "network" });
    const { socket: logSocket } = server.simulateSubscription({ category: "log" });
    const { socket: allSocket } = server.simulateSubscription({});

    const networkEvent: TelemetryEvent = {
      category: "network",
      timestamp: 1000,
      deviceId: null,
      data: { method: "GET", url: "/users", statusCode: 200, durationMs: 42 },
    };

    server.pushTelemetryEvent(networkEvent);

    expect(networkSocket.getWrittenMessages()).toHaveLength(1);
    expect(logSocket.getWrittenMessages()).toHaveLength(0);
    expect(allSocket.getWrittenMessages()).toHaveLength(1);
  });

  it("pushes different event categories to matching subscribers", () => {
    const { socket: logSocket } = server.simulateSubscription({ category: "log" });

    const logEvent: TelemetryEvent = {
      category: "log",
      timestamp: 2000,
      deviceId: null,
      data: { level: 4, tag: "TestTag", message: "hello" },
    };

    const networkEvent: TelemetryEvent = {
      category: "network",
      timestamp: 3000,
      deviceId: null,
      data: { method: "POST", url: "/submit", statusCode: 201, durationMs: 100 },
    };

    server.pushTelemetryEvent(logEvent);
    server.pushTelemetryEvent(networkEvent);

    const msgs = logSocket.getWrittenMessages<{ type: string; data?: TelemetryEvent }>();
    expect(msgs).toHaveLength(1);
    expect(msgs[0].data?.category).toBe("log");
  });

  it("pushes custom events correctly", () => {
    const { socket } = server.simulateSubscription({ category: "custom" });

    const event: TelemetryEvent = {
      category: "custom",
      timestamp: 4000,
      deviceId: null,
      data: { name: "purchase", properties: { item: "premium" } },
    };

    server.pushTelemetryEvent(event);

    const msgs = socket.getWrittenMessages<{ type: string; data?: TelemetryEvent }>();
    expect(msgs).toHaveLength(1);
    expect(msgs[0].data?.category).toBe("custom");
  });

  it("pushes os events correctly", () => {
    const { socket } = server.simulateSubscription({ category: "os" });

    const event: TelemetryEvent = {
      category: "os",
      timestamp: 5000,
      deviceId: null,
      data: { category: "lifecycle", kind: "foreground", details: null },
    };

    server.pushTelemetryEvent(event);

    const msgs = socket.getWrittenMessages<{ type: string; data?: TelemetryEvent }>();
    expect(msgs).toHaveLength(1);
    expect(msgs[0].data?.category).toBe("os");
  });

  it("removes destroyed sockets on push", () => {
    const { socket: socket1 } = server.simulateSubscription({});
    server.simulateSubscription({});

    expect(server.getSubscriberCount()).toBe(2);
    socket1.destroy();

    const event: TelemetryEvent = {
      category: "log",
      timestamp: 6000,
      deviceId: null,
      data: { level: 4, tag: "Test", message: "msg" },
    };

    server.pushTelemetryEvent(event);
    expect(server.getSubscriberCount()).toBe(1);
  });

  it("removes timed out subscribers on keepalive check", () => {
    server.simulateSubscription({});
    expect(server.getSubscriberCount()).toBe(1);

    timer.advanceTimersByTime(31_000);
    server.triggerKeepalive();

    expect(server.getSubscriberCount()).toBe(0);
  });

  it("keeps subscribers alive when they respond to pongs", () => {
    const { subscriptionId } = server.simulateSubscription({});
    expect(server.getSubscriberCount()).toBe(1);

    timer.advanceTimersByTime(15_000);
    server.simulatePong(subscriptionId);

    timer.advanceTimersByTime(20_000);
    server.triggerKeepalive();

    expect(server.getSubscriberCount()).toBe(1);
  });

  it("includes server timestamp in push message", () => {
    timer.setCurrentTime(99999);
    const { socket } = server.simulateSubscription({});

    const event: TelemetryEvent = {
      category: "network",
      timestamp: 50000,
      deviceId: null,
      data: { method: "GET", url: "/test", statusCode: 200, durationMs: 10 },
    };

    server.pushTelemetryEvent(event);

    const msgs = socket.getWrittenMessages<{ type: string; timestamp: number; data?: TelemetryEvent }>();
    expect(msgs[0].timestamp).toBe(99999);
    expect(msgs[0].data?.timestamp).toBe(50000);
  });

  it("filters pushes by deviceId", () => {
    const { socket: d1Socket } = server.simulateSubscription({ deviceId: "device-1" });
    const { socket: d2Socket } = server.simulateSubscription({ deviceId: "device-2" });
    const { socket: allSocket } = server.simulateSubscription({});

    const event: TelemetryEvent = {
      category: "network",
      timestamp: 1000,
      deviceId: "device-1",
      data: { method: "GET", url: "/test", statusCode: 200, durationMs: 10 },
    };

    server.pushTelemetryEvent(event);

    expect(d1Socket.getWrittenMessages()).toHaveLength(1);
    expect(d2Socket.getWrittenMessages()).toHaveLength(0);
    expect(allSocket.getWrittenMessages()).toHaveLength(1);
  });

  it("filters by both category and deviceId", () => {
    const { socket } = server.simulateSubscription({ category: "log", deviceId: "device-1" });

    const matchEvent: TelemetryEvent = {
      category: "log",
      timestamp: 1000,
      deviceId: "device-1",
      data: { level: 4, tag: "t", message: "m" },
    };
    const wrongCategory: TelemetryEvent = {
      category: "network",
      timestamp: 2000,
      deviceId: "device-1",
      data: { method: "GET", url: "/x", statusCode: 200, durationMs: 0 },
    };
    const wrongDevice: TelemetryEvent = {
      category: "log",
      timestamp: 3000,
      deviceId: "device-2",
      data: { level: 4, tag: "t", message: "m" },
    };

    server.pushTelemetryEvent(matchEvent);
    server.pushTelemetryEvent(wrongCategory);
    server.pushTelemetryEvent(wrongDevice);

    expect(socket.getWrittenMessages()).toHaveLength(1);
  });
});
