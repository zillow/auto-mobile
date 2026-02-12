import { describe, it, expect, beforeEach } from "bun:test";
import { Socket } from "node:net";
import {
  DeviceDataStreamSocketServer,
  type NavigationGraphStreamData,
} from "../../src/daemon/deviceDataStreamSocketServer";
import { FakeTimer } from "../fakes/FakeTimer";
import { FakeSocket } from "../fakes/FakeNetServer";

/**
 * Test helper that wraps DeviceDataStreamSocketServer to allow injecting fake sockets
 * without requiring real network connections.
 */
class TestableDeviceDataStreamSocketServer extends DeviceDataStreamSocketServer {
  constructor(timer: FakeTimer) {
    super("/fake/path/test.sock", timer);
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
    deviceId?: string;
  }): { socket: FakeSocket; subscriptionId: string } {
    const socket = new FakeSocket();
    const subscriptionId = `devicedatastream-${++(this as any).subscriptionCounter}`;
    const timer = (this as any).timer as FakeTimer;
    this.subscribers.set(subscriptionId, {
      socket: socket as unknown as Socket,
      subscriptionId,
      lastActivity: timer.now(),
      filter: {
        deviceId: options.deviceId ?? null,
      },
    });
    return { socket, subscriptionId };
  }

  async processLineForTest(socket: FakeSocket, line: string): Promise<void> {
    await this.processLine(socket as unknown as Socket, line);
  }
}

describe("DeviceDataStreamSocketServer", () => {
  let server: TestableDeviceDataStreamSocketServer;
  let timer: FakeTimer;

  beforeEach(async () => {
    timer = new FakeTimer();
    server = new TestableDeviceDataStreamSocketServer(timer);
    await server.startFake();
  });

  describe("request_navigation_graph", () => {
    const sampleGraphData: NavigationGraphStreamData = {
      appId: "com.example.app",
      nodes: [
        { id: 1, screenName: "Home", visitCount: 3 },
        { id: 2, screenName: "Settings", visitCount: 1 },
      ],
      edges: [
        { id: 1, from: "Home", to: "Settings", toolName: "tapOn", traversalCount: 2 },
      ],
      currentScreen: "Home",
    };

    it("returns navigation_update to requesting socket only when callback returns data", async () => {
      server.setOnNavigationGraphRequested(async () => sampleGraphData);

      // Subscribe two sockets
      const { socket: socket1 } = server.simulateSubscription({});
      const requestSocket = new FakeSocket();

      const requestLine = JSON.stringify({
        id: "req-1",
        command: "request_navigation_graph",
      });

      await server.processLineForTest(requestSocket, requestLine);

      // Requesting socket should receive the navigation_update
      const msgs = requestSocket.getWrittenMessages<{
        id?: string;
        type: string;
        navigationGraph?: NavigationGraphStreamData;
      }>();
      expect(msgs).toHaveLength(1);
      expect(msgs[0].type).toBe("navigation_update");
      expect(msgs[0].id).toBe("req-1");
      expect(msgs[0].navigationGraph?.appId).toBe("com.example.app");
      expect(msgs[0].navigationGraph?.nodes).toHaveLength(2);
      expect(msgs[0].navigationGraph?.edges).toHaveLength(1);

      // Other subscriber should NOT receive anything
      const otherMsgs = socket1.getWrittenMessages();
      expect(otherMsgs).toHaveLength(0);
    });

    it("returns success acknowledgement when no callback is set", async () => {
      const requestSocket = new FakeSocket();

      const requestLine = JSON.stringify({
        id: "req-2",
        command: "request_navigation_graph",
      });

      await server.processLineForTest(requestSocket, requestLine);

      const msgs = requestSocket.getWrittenMessages<{
        id?: string;
        type: string;
        success?: boolean;
      }>();
      expect(msgs).toHaveLength(1);
      expect(msgs[0].type).toBe("subscription_response");
      expect(msgs[0].id).toBe("req-2");
      expect(msgs[0].success).toBe(true);
    });

    it("returns success acknowledgement when callback returns null", async () => {
      server.setOnNavigationGraphRequested(async () => null);

      const requestSocket = new FakeSocket();

      const requestLine = JSON.stringify({
        id: "req-3",
        command: "request_navigation_graph",
      });

      await server.processLineForTest(requestSocket, requestLine);

      const msgs = requestSocket.getWrittenMessages<{
        id?: string;
        type: string;
        success?: boolean;
      }>();
      expect(msgs).toHaveLength(1);
      expect(msgs[0].type).toBe("subscription_response");
      expect(msgs[0].id).toBe("req-3");
      expect(msgs[0].success).toBe(true);
    });

    it("returns error response when callback throws", async () => {
      server.setOnNavigationGraphRequested(async () => {
        throw new Error("Graph export failed");
      });

      const requestSocket = new FakeSocket();

      const requestLine = JSON.stringify({
        id: "req-4",
        command: "request_navigation_graph",
      });

      await server.processLineForTest(requestSocket, requestLine);

      const msgs = requestSocket.getWrittenMessages<{
        id?: string;
        type: string;
        success?: boolean;
        error?: string;
      }>();
      expect(msgs).toHaveLength(1);
      expect(msgs[0].type).toBe("error");
      expect(msgs[0].id).toBe("req-4");
      expect(msgs[0].success).toBe(false);
      expect(msgs[0].error).toBe("Graph export failed");
    });
  });

  describe("subscribe and unsubscribe", () => {
    it("handles subscribe command", async () => {
      const socket = new FakeSocket();

      const requestLine = JSON.stringify({
        id: "sub-1",
        command: "subscribe",
        deviceId: "emulator-5554",
      });

      await server.processLineForTest(socket, requestLine);

      const msgs = socket.getWrittenMessages<{
        id?: string;
        type: string;
        success?: boolean;
      }>();
      expect(msgs).toHaveLength(1);
      expect(msgs[0].type).toBe("subscription_response");
      expect(msgs[0].success).toBe(true);
      expect(server.getSubscriberCount()).toBe(1);
    });

    it("handles unsubscribe command", async () => {
      const { socket } = server.simulateSubscription({});
      expect(server.getSubscriberCount()).toBe(1);

      const requestLine = JSON.stringify({
        id: "unsub-1",
        command: "unsubscribe",
      });

      await server.processLineForTest(socket, requestLine);

      const msgs = socket.getWrittenMessages<{
        id?: string;
        type: string;
        success?: boolean;
      }>();
      expect(msgs).toHaveLength(1);
      expect(msgs[0].type).toBe("subscription_response");
      expect(msgs[0].success).toBe(true);
      expect(server.getSubscriberCount()).toBe(0);
    });
  });
});
