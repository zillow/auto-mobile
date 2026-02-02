import { describe, it, expect, beforeEach } from "bun:test";
import { Socket } from "node:net";
import { UnifiedSocketServer } from "../../../src/daemon/unified/UnifiedSocketServer";
import { BaseDomainHandler } from "../../../src/daemon/unified/DomainHandler";
import type { RequestResult, SubscriptionFilter, PushEvent } from "../../../src/daemon/unified/UnifiedSocketTypes";
import { FakeTimer } from "../../fakes/FakeTimer";
import { FakeSocket } from "../../fakes/FakeNetServer";

/**
 * Test domain handler
 */
class TestDomainHandler extends BaseDomainHandler {
  readonly domain = "failures" as const;
  private testResponse: RequestResult = { result: { test: true } };

  setTestResponse(response: RequestResult): void {
    this.testResponse = response;
  }

  async handleRequest(
    method: string,
    _params: Record<string, unknown> | undefined
  ): Promise<RequestResult> {
    if (method === "error") {
      throw new Error("Test error");
    }
    return this.testResponse;
  }

  parseSubscriptionFilter(params: Record<string, unknown> | undefined): SubscriptionFilter {
    return {
      type: (params?.type as string) ?? null,
    };
  }

  matchesFilter(filter: SubscriptionFilter, event: PushEvent): boolean {
    const filterType = (filter as { type?: string }).type;
    const eventType = (event.data as { type?: string }).type;

    if (filterType && eventType && filterType !== eventType) {
      return false;
    }
    return true;
  }

  triggerPush(event: string, data: unknown): void {
    this.push(event, data);
  }
}

/**
 * Testable UnifiedSocketServer that exposes protected methods for testing
 */
class TestableUnifiedSocketServer extends UnifiedSocketServer {
  /**
   * Start without creating real socket
   */
  async startFake(): Promise<void> {
    (this as any).server = { listening: true };
    this.onServerStarted();
  }

  /**
   * Stop without real cleanup
   */
  async closeFake(): Promise<void> {
    this.onServerClosing();
    (this as any).server = null;
  }

  /**
   * Process a line directly for testing
   */
  async processLineForTest(socket: Socket, line: string): Promise<void> {
    await (this as any).processLine(socket, line);
  }

  /**
   * Simulate connection established
   */
  simulateConnectionEstablished(socket: Socket): void {
    (this as any).onConnectionEstablished(socket);
  }
}

/**
 * Create a testable server with fake timer and socket
 */
function createTestServer(): {
  server: TestableUnifiedSocketServer;
  timer: FakeTimer;
  handler: TestDomainHandler;
  } {
  const timer = new FakeTimer();
  const server = new TestableUnifiedSocketServer("/fake/path/api.sock", timer);
  const handler = new TestDomainHandler();
  server.registerHandler(handler);
  return { server, timer, handler };
}

/**
 * Create and register a fake socket
 */
function createTestSocket(server: TestableUnifiedSocketServer): FakeSocket {
  const socket = new FakeSocket();
  server.simulateConnectionEstablished(socket as unknown as Socket);
  return socket;
}

describe("UnifiedSocketServer", () => {
  let server: TestableUnifiedSocketServer;
  let timer: FakeTimer;
  let handler: TestDomainHandler;

  beforeEach(async () => {
    const setup = createTestServer();
    server = setup.server;
    timer = setup.timer;
    handler = setup.handler;
    await server.startFake();
  });

  describe("connection management", () => {
    it("tracks socket count correctly", () => {
      expect(server.getSocketCount()).toBe(0);

      createTestSocket(server);
      expect(server.getSocketCount()).toBe(1);

      createTestSocket(server);
      expect(server.getSocketCount()).toBe(2);
    });

    it("tracks subscription count correctly", () => {
      const socket = createTestSocket(server);
      expect(server.getSubscriptionCount()).toBe(0);

      server.simulateSubscription(socket as unknown as Socket, "failures", "failure_occurred");
      expect(server.getSubscriptionCount()).toBe(1);

      server.simulateSubscription(socket as unknown as Socket, "failures", "other_event");
      expect(server.getSubscriptionCount()).toBe(2);
    });
  });

  describe("request handling", () => {
    it("routes requests to correct handler", async () => {
      const socket = createTestSocket(server);

      const request = JSON.stringify({
        id: "1",
        type: "request",
        domain: "failures",
        method: "poll_notifications",
        timestamp: 0,
      });

      await server.processLineForTest(socket as unknown as Socket, request);

      const messages = socket.getWrittenMessages<{ id: string; type: string; result: unknown }>();
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe("1");
      expect(messages[0].type).toBe("response");
      expect(messages[0].result).toEqual({ test: true });
    });

    it("returns error for unknown domain", async () => {
      const socket = createTestSocket(server);

      const request = JSON.stringify({
        id: "1",
        type: "request",
        domain: "unknown",
        method: "test",
        timestamp: 0,
      });

      await server.processLineForTest(socket as unknown as Socket, request);

      const messages = socket.getWrittenMessages<{ type: string; error: { code: string } }>();
      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe("error");
      expect(messages[0].error.code).toBe("UNKNOWN_DOMAIN");
    });

    it("returns error for handler exceptions", async () => {
      const socket = createTestSocket(server);

      const request = JSON.stringify({
        id: "1",
        type: "request",
        domain: "failures",
        method: "error",
        timestamp: 0,
      });

      await server.processLineForTest(socket as unknown as Socket, request);

      const messages = socket.getWrittenMessages<{ type: string; error: { code: string; message: string } }>();
      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe("error");
      expect(messages[0].error.code).toBe("HANDLER_ERROR");
      expect(messages[0].error.message).toBe("Test error");
    });

    it("returns error for invalid JSON", async () => {
      const socket = createTestSocket(server);

      await server.processLineForTest(socket as unknown as Socket, "not valid json");

      const messages = socket.getWrittenMessages<{ type: string; error: { code: string } }>();
      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe("error");
      expect(messages[0].error.code).toBe("INVALID_JSON");
    });
  });

  describe("subscription management", () => {
    it("creates subscription with ID", async () => {
      const socket = createTestSocket(server);

      const subscribe = JSON.stringify({
        id: "1",
        type: "subscribe",
        domain: "failures",
        event: "failure_occurred",
        timestamp: 0,
      });

      await server.processLineForTest(socket as unknown as Socket, subscribe);

      const messages = socket.getWrittenMessages<{ id: string; type: string; result: { subscriptionId: string } }>();
      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe("response");
      expect(messages[0].result.subscriptionId).toMatch(/^sub-\d+$/);

      expect(server.getSubscriptionCount()).toBe(1);
    });

    it("removes subscription on unsubscribe", async () => {
      const socket = createTestSocket(server);

      // Subscribe
      await server.processLineForTest(socket as unknown as Socket, JSON.stringify({
        id: "1",
        type: "subscribe",
        domain: "failures",
        timestamp: 0,
      }));

      const subscribeResponse = socket.getWrittenMessages<{ result: { subscriptionId: string } }>()[0];
      const subscriptionId = subscribeResponse.result.subscriptionId;
      expect(server.getSubscriptionCount()).toBe(1);

      // Unsubscribe
      await server.processLineForTest(socket as unknown as Socket, JSON.stringify({
        id: "2",
        type: "unsubscribe",
        domain: "failures",
        params: { subscriptionId },
        timestamp: 0,
      }));

      expect(server.getSubscriptionCount()).toBe(0);
    });

    it("returns error for unsubscribe with invalid subscription ID", async () => {
      const socket = createTestSocket(server);

      await server.processLineForTest(socket as unknown as Socket, JSON.stringify({
        id: "1",
        type: "unsubscribe",
        domain: "failures",
        params: { subscriptionId: "invalid" },
        timestamp: 0,
      }));

      const messages = socket.getWrittenMessages<{ type: string; error: { code: string } }>();
      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe("error");
      expect(messages[0].error.code).toBe("SUBSCRIPTION_NOT_FOUND");
    });
  });

  describe("push events", () => {
    it("pushes events to matching subscribers", () => {
      const socket1 = createTestSocket(server);
      const socket2 = createTestSocket(server);

      server.simulateSubscription(socket1 as unknown as Socket, "failures", "failure_occurred");
      server.simulateSubscription(socket2 as unknown as Socket, "failures", "failure_occurred");

      handler.triggerPush("failure_occurred", { type: "crash", message: "test" });

      const messages1 = socket1.getWrittenMessages<{ type: string; event: string }>();
      const messages2 = socket2.getWrittenMessages<{ type: string; event: string }>();

      expect(messages1).toHaveLength(1);
      expect(messages1[0].type).toBe("push");
      expect(messages1[0].event).toBe("failure_occurred");

      expect(messages2).toHaveLength(1);
      expect(messages2[0].type).toBe("push");
    });

    it("filters pushes by event name", () => {
      const socket1 = createTestSocket(server);
      const socket2 = createTestSocket(server);

      server.simulateSubscription(socket1 as unknown as Socket, "failures", "failure_occurred");
      server.simulateSubscription(socket2 as unknown as Socket, "failures", "other_event");

      handler.triggerPush("failure_occurred", { message: "test" });

      const messages1 = socket1.getWrittenMessages<{ type: string }>();
      const messages2 = socket2.getWrittenMessages<{ type: string }>();

      expect(messages1).toHaveLength(1);
      expect(messages2).toHaveLength(0);
    });

    it("filters pushes by subscription filter", () => {
      const socket1 = createTestSocket(server);
      const socket2 = createTestSocket(server);

      server.simulateSubscription(socket1 as unknown as Socket, "failures", null, { type: "crash" });
      server.simulateSubscription(socket2 as unknown as Socket, "failures", null, { type: "anr" });

      handler.triggerPush("failure_occurred", { type: "crash" });

      const messages1 = socket1.getWrittenMessages<{ type: string }>();
      const messages2 = socket2.getWrittenMessages<{ type: string }>();

      expect(messages1).toHaveLength(1);
      expect(messages2).toHaveLength(0);
    });

    it("broadcasts to subscribers without event filter", () => {
      const socket1 = createTestSocket(server);
      const socket2 = createTestSocket(server);

      server.simulateSubscription(socket1 as unknown as Socket, "failures", null); // No event filter
      server.simulateSubscription(socket2 as unknown as Socket, "failures", "specific_event");

      handler.triggerPush("any_event", { message: "test" });

      const messages1 = socket1.getWrittenMessages<{ type: string }>();
      const messages2 = socket2.getWrittenMessages<{ type: string }>();

      expect(messages1).toHaveLength(1);
      expect(messages2).toHaveLength(0);
    });
  });

  describe("keepalive", () => {
    it("removes timed out sockets on keepalive check", () => {
      createTestSocket(server);
      expect(server.getSocketCount()).toBe(1);

      // Advance time past the timeout (30 seconds)
      timer.advanceTimersByTime(31_000);
      server.triggerKeepalive();

      expect(server.getSocketCount()).toBe(0);
    });

    it("keeps sockets alive when they respond with pong", () => {
      const socket = createTestSocket(server);
      expect(server.getSocketCount()).toBe(1);

      // Advance time but not past timeout
      timer.advanceTimersByTime(15_000);

      // Simulate pong
      server.simulatePong(socket as unknown as Socket);

      // Advance more time
      timer.advanceTimersByTime(20_000);

      // Trigger keepalive - socket should still be alive
      server.triggerKeepalive();

      expect(server.getSocketCount()).toBe(1);
    });

    it("sends pings to sockets on keepalive", () => {
      const socket = createTestSocket(server);

      // Advance time to trigger keepalive check
      timer.advanceTimersByTime(5_000);
      server.triggerKeepalive();

      const messages = socket.getWrittenMessages<{ type: string }>();
      expect(messages.some(m => m.type === "ping")).toBe(true);
    });

    it("removes sockets with destroyed underlying socket", () => {
      const socket = createTestSocket(server);
      expect(server.getSocketCount()).toBe(1);

      socket.destroy();
      server.triggerKeepalive();

      expect(server.getSocketCount()).toBe(0);
    });
  });

  describe("pong handling", () => {
    it("updates last activity on pong", async () => {
      const socket = createTestSocket(server);

      // Advance time
      timer.advanceTimersByTime(10_000);

      // Send pong via processLine
      await server.processLineForTest(socket as unknown as Socket, JSON.stringify({
        type: "pong",
        timestamp: 0,
      }));

      // Advance more time but not past timeout from last pong
      timer.advanceTimersByTime(25_000);
      server.triggerKeepalive();

      // Socket should still be alive
      expect(server.getSocketCount()).toBe(1);
    });
  });

  describe("message format", () => {
    it("includes timestamp in responses", async () => {
      const socket = createTestSocket(server);
      timer.setCurrentTime(12345);

      const request = JSON.stringify({
        id: "1",
        type: "request",
        domain: "failures",
        method: "test",
        timestamp: 0,
      });

      await server.processLineForTest(socket as unknown as Socket, request);

      const messages = socket.getWrittenMessages<{ timestamp: number }>();
      expect(messages).toHaveLength(1);
      expect(messages[0].timestamp).toBe(12345);
    });

    it("includes domain in responses", async () => {
      const socket = createTestSocket(server);

      const request = JSON.stringify({
        id: "1",
        type: "request",
        domain: "failures",
        method: "test",
        timestamp: 0,
      });

      await server.processLineForTest(socket as unknown as Socket, request);

      const messages = socket.getWrittenMessages<{ domain: string }>();
      expect(messages).toHaveLength(1);
      expect(messages[0].domain).toBe("failures");
    });
  });

  describe("handler registration", () => {
    it("registers handlers correctly", () => {
      const handlers = server.getHandlers();
      expect(handlers.size).toBe(1);
      expect(handlers.has("failures")).toBe(true);
    });

    it("returns handler by domain", () => {
      const foundHandler = server.getHandler("failures");
      expect(foundHandler).toBe(handler);
    });

    it("returns undefined for unknown domain", () => {
      const foundHandler = server.getHandler("unknown" as any);
      expect(foundHandler).toBeUndefined();
    });
  });
});
