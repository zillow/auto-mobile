import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  SocketServerRegistry,
  getSocketServerRegistry,
  resetSocketServerRegistry,
} from "../../src/daemon/SocketServerRegistry";
import { BaseSocketServer } from "../../src/daemon/socketServer/BaseSocketServer";
import { Socket } from "node:net";

// Mock socket server for testing
class MockSocketServer extends BaseSocketServer {
  public startCallCount = 0;
  public closeCallCount = 0;

  constructor() {
    super("/tmp/mock-test.sock", undefined, "MockServer");
  }

  protected async processLine(_socket: Socket, _line: string): Promise<void> {
    // No-op for testing
  }

  override async start(): Promise<void> {
    this.startCallCount++;
    // Simulate started state without actually starting
    (this as unknown as { server: { listening: boolean } }).server = { listening: true };
  }

  override async close(): Promise<void> {
    this.closeCallCount++;
    (this as unknown as { server: null }).server = null;
  }
}

describe("SocketServerRegistry", () => {
  let registry: SocketServerRegistry;

  beforeEach(() => {
    registry = new SocketServerRegistry();
  });

  afterEach(() => {
    registry.clear();
  });

  describe("register", () => {
    it("registers a server factory", () => {
      registry.register("test", { factory: () => new MockSocketServer() });
      expect(registry.getRegisteredNames()).toContain("test");
    });

    it("allows overwriting registration", () => {
      const factory1 = () => new MockSocketServer();
      const factory2 = () => new MockSocketServer();

      registry.register("test", { factory: factory1 });
      registry.register("test", { factory: factory2 });

      expect(registry.getRegisteredNames()).toEqual(["test"]);
    });
  });

  describe("start", () => {
    it("creates and starts a server", async () => {
      const mockServer = new MockSocketServer();
      registry.register("test", { factory: () => mockServer });

      const server = await registry.start("test");

      expect(server).toBe(mockServer);
      expect(mockServer.startCallCount).toBe(1);
      expect(registry.isRunning("test")).toBe(true);
    });

    it("reuses existing server instance", async () => {
      let createCount = 0;
      registry.register("test", {
        factory: () => {
          createCount++;
          return new MockSocketServer();
        },
      });

      await registry.start("test");
      await registry.start("test");

      expect(createCount).toBe(1);
    });

    it("throws for unknown server", async () => {
      await expect(registry.start("unknown")).rejects.toThrow(
        "[SocketServerRegistry] Unknown server: unknown"
      );
    });
  });

  describe("stop", () => {
    it("stops a running server", async () => {
      const mockServer = new MockSocketServer();
      registry.register("test", { factory: () => mockServer });

      await registry.start("test");
      await registry.stop("test");

      expect(mockServer.closeCallCount).toBe(1);
      expect(registry.isRunning("test")).toBe(false);
    });

    it("no-ops for non-running server", async () => {
      registry.register("test", { factory: () => new MockSocketServer() });
      await registry.stop("test"); // Should not throw
    });
  });

  describe("startAll", () => {
    it("starts all servers with autoStart=true (default)", async () => {
      const server1 = new MockSocketServer();
      const server2 = new MockSocketServer();

      registry.register("server1", { factory: () => server1 });
      registry.register("server2", { factory: () => server2 });

      await registry.startAll();

      expect(server1.startCallCount).toBe(1);
      expect(server2.startCallCount).toBe(1);
    });

    it("skips servers with autoStart=false", async () => {
      const server1 = new MockSocketServer();
      const server2 = new MockSocketServer();

      registry.register("server1", { factory: () => server1 });
      registry.register("server2", { factory: () => server2, autoStart: false });

      await registry.startAll();

      expect(server1.startCallCount).toBe(1);
      expect(server2.startCallCount).toBe(0);
    });
  });

  describe("stopAll", () => {
    it("stops all running servers", async () => {
      const server1 = new MockSocketServer();
      const server2 = new MockSocketServer();

      registry.register("server1", { factory: () => server1 });
      registry.register("server2", { factory: () => server2 });

      await registry.startAll();
      await registry.stopAll();

      expect(server1.closeCallCount).toBe(1);
      expect(server2.closeCallCount).toBe(1);
      expect(registry.getRunningNames()).toEqual([]);
    });
  });

  describe("get", () => {
    it("returns null for non-started server", () => {
      registry.register("test", { factory: () => new MockSocketServer() });
      expect(registry.get("test")).toBeNull();
    });

    it("returns server instance after start", async () => {
      const mockServer = new MockSocketServer();
      registry.register("test", { factory: () => mockServer });

      await registry.start("test");

      expect(registry.get("test")).toBe(mockServer);
    });
  });

  describe("getRunningNames", () => {
    it("returns only running servers", async () => {
      registry.register("server1", { factory: () => new MockSocketServer() });
      registry.register("server2", { factory: () => new MockSocketServer() });
      registry.register("server3", { factory: () => new MockSocketServer() });

      await registry.start("server1");
      await registry.start("server2");

      const running = registry.getRunningNames();
      expect(running).toContain("server1");
      expect(running).toContain("server2");
      expect(running).not.toContain("server3");
    });
  });
});

describe("getSocketServerRegistry", () => {
  afterEach(() => {
    resetSocketServerRegistry();
  });

  it("returns singleton instance", () => {
    const registry1 = getSocketServerRegistry();
    const registry2 = getSocketServerRegistry();
    expect(registry1).toBe(registry2);
  });

  it("resetSocketServerRegistry clears instance", () => {
    const registry1 = getSocketServerRegistry();
    registry1.register("test", { factory: () => new MockSocketServer() });

    resetSocketServerRegistry();

    const registry2 = getSocketServerRegistry();
    expect(registry2.getRegisteredNames()).toEqual([]);
  });
});
