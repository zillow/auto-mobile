import { describe, it, expect, beforeEach } from "bun:test";
import { Socket } from "node:net";
import { PushSubscriptionSocketServer } from "../../../src/daemon/socketServer/PushSubscriptionSocketServer";
import { FakeTimer } from "../../../src/utils/SystemTimer";
import { FakeSocket } from "../../fakes/FakeNetServer";

interface TestFilter {
  deviceId: string | null;
  packageName: string | null;
}

interface TestPushData {
  deviceId: string;
  packageName: string;
  value: number;
}

interface TestPushMessage {
  type: "test_push";
  data: TestPushData;
  timestamp: number;
}

class TestablePushSubscriptionServer extends PushSubscriptionSocketServer<TestFilter, TestPushData> {
  constructor(timer: FakeTimer) {
    super("/fake/path/test.sock", timer, "TestPush");
  }

  /**
   * Start without creating real socket
   */
  async startFake(): Promise<void> {
    (this as any).server = { listening: true };
    this.onServerStarted();
  }

  /**
   * Close without real cleanup
   */
  async closeFake(): Promise<void> {
    this.onServerClosing();
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
    const subscriptionId = `testpush-${++(this as any).subscriptionCounter}`;
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
   * Simulate a pong from a subscriber
   */
  simulatePong(subscriptionId: string): void {
    const subscriber = this.subscribers.get(subscriptionId);
    if (subscriber) {
      subscriber.lastActivity = (this as any).timer.now();
    }
  }

  /**
   * Trigger keepalive check
   */
  triggerKeepalive(): void {
    (this as any).checkKeepalive();
  }

  /**
   * Push data to subscribers (public wrapper)
   */
  pushData(data: TestPushData): number {
    return this.pushToSubscribers(data);
  }

  protected parseSubscriptionFilter(request: Record<string, unknown>): TestFilter {
    return {
      deviceId: (request.deviceId as string) ?? null,
      packageName: (request.packageName as string) ?? null,
    };
  }

  protected matchesFilter(filter: TestFilter, data: TestPushData): boolean {
    const matchesDevice = filter.deviceId === null || filter.deviceId === data.deviceId;
    const matchesPackage = filter.packageName === null || filter.packageName === data.packageName;
    return matchesDevice && matchesPackage;
  }

  protected createPushMessage(data: TestPushData): TestPushMessage {
    return {
      type: "test_push",
      data,
      timestamp: (this as any).timer.now(),
    };
  }
}

describe("PushSubscriptionSocketServer", () => {
  let server: TestablePushSubscriptionServer;
  let timer: FakeTimer;

  beforeEach(async () => {
    timer = new FakeTimer();
    server = new TestablePushSubscriptionServer(timer);
    await server.startFake();
  });

  describe("subscriber management", () => {
    it("tracks subscriber count correctly", () => {
      expect(server.getSubscriberCount()).toBe(0);

      server.simulateSubscription({});
      expect(server.getSubscriberCount()).toBe(1);

      server.simulateSubscription({ deviceId: "device-1" });
      expect(server.getSubscriberCount()).toBe(2);
    });

    it("removes subscribers on close", async () => {
      server.simulateSubscription({});
      server.simulateSubscription({});
      expect(server.getSubscriberCount()).toBe(2);

      await server.closeFake();
      expect(server.getSubscriberCount()).toBe(0);
    });
  });

  describe("push filtering", () => {
    it("pushes data to all subscribers when no filter", () => {
      const { socket: socket1 } = server.simulateSubscription({});
      const { socket: socket2 } = server.simulateSubscription({});

      const data: TestPushData = { deviceId: "device-1", packageName: "com.app", value: 42 };
      const sentCount = server.pushData(data);

      expect(sentCount).toBe(2);
      expect(socket1.getWrittenMessages()).toHaveLength(1);
      expect(socket2.getWrittenMessages()).toHaveLength(1);
    });

    it("filters pushes by deviceId", () => {
      const { socket: socket1 } = server.simulateSubscription({ deviceId: "device-1" });
      const { socket: socket2 } = server.simulateSubscription({ deviceId: "device-2" });

      const data: TestPushData = { deviceId: "device-1", packageName: "com.app", value: 42 };
      const sentCount = server.pushData(data);

      expect(sentCount).toBe(1);
      expect(socket1.getWrittenMessages()).toHaveLength(1);
      expect(socket2.getWrittenMessages()).toHaveLength(0);
    });

    it("filters pushes by packageName", () => {
      const { socket: socket1 } = server.simulateSubscription({ packageName: "com.app.one" });
      const { socket: socket2 } = server.simulateSubscription({ packageName: "com.app.two" });

      const data: TestPushData = { deviceId: "device-1", packageName: "com.app.one", value: 42 };
      const sentCount = server.pushData(data);

      expect(sentCount).toBe(1);
      expect(socket1.getWrittenMessages()).toHaveLength(1);
      expect(socket2.getWrittenMessages()).toHaveLength(0);
    });

    it("filters by both deviceId and packageName", () => {
      const { socket: socket1 } = server.simulateSubscription({
        deviceId: "device-1",
        packageName: "com.app.one",
      });
      const { socket: socket2 } = server.simulateSubscription({
        deviceId: "device-1",
        packageName: "com.app.two",
      });
      const { socket: socket3 } = server.simulateSubscription({
        deviceId: "device-2",
        packageName: "com.app.one",
      });

      const data: TestPushData = { deviceId: "device-1", packageName: "com.app.one", value: 42 };
      const sentCount = server.pushData(data);

      expect(sentCount).toBe(1);
      expect(socket1.getWrittenMessages()).toHaveLength(1);
      expect(socket2.getWrittenMessages()).toHaveLength(0);
      expect(socket3.getWrittenMessages()).toHaveLength(0);
    });
  });

  describe("keepalive", () => {
    it("removes timed out subscribers on keepalive check", () => {
      server.simulateSubscription({});
      expect(server.getSubscriberCount()).toBe(1);

      // Advance time past the timeout (30 seconds)
      timer.advanceTimersByTime(31_000);

      // Trigger keepalive check
      server.triggerKeepalive();

      expect(server.getSubscriberCount()).toBe(0);
    });

    it("keeps subscribers alive when they respond to pongs", () => {
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

    it("sends pings to subscribers on keepalive", () => {
      const { socket } = server.simulateSubscription({});

      // Advance time to trigger keepalive check
      timer.advanceTimersByTime(5_000);
      server.triggerKeepalive();

      const messages = socket.getWrittenMessages<{ type: string }>();
      expect(messages.some(m => m.type === "ping")).toBe(true);
    });

    it("removes subscribers with destroyed sockets", () => {
      const { socket } = server.simulateSubscription({});
      expect(server.getSubscriberCount()).toBe(1);

      socket.destroy();
      server.triggerKeepalive();

      expect(server.getSubscriberCount()).toBe(0);
    });
  });

  describe("push message format", () => {
    it("includes correct message type and data", () => {
      const { socket } = server.simulateSubscription({});
      timer.setCurrentTime(12345);

      const data: TestPushData = { deviceId: "device-1", packageName: "com.app", value: 99 };
      server.pushData(data);

      const messages = socket.getWrittenMessages<TestPushMessage>();
      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe("test_push");
      expect(messages[0].data).toEqual(data);
      expect(messages[0].timestamp).toBe(12345);
    });
  });

  describe("error handling", () => {
    it("removes subscribers that fail to receive push", () => {
      const { socket } = server.simulateSubscription({});

      // Override write to throw
      socket.write = () => {
        throw new Error("Connection broken");
      };

      const data: TestPushData = { deviceId: "device-1", packageName: "com.app", value: 42 };
      server.pushData(data);

      expect(server.getSubscriberCount()).toBe(0);
    });
  });
});
