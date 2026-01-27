import { describe, expect, test, spyOn } from "bun:test";
import { DaemonMcpProxy } from "../../src/daemon/daemonMcpProxy";
import { DaemonManager } from "../../src/daemon/manager";
import type { DaemonClientLike } from "../../src/daemon/client";
import { DaemonClient, DaemonUnavailableError } from "../../src/daemon/client";

/**
 * Fake DaemonClient for testing
 */
class FakeDaemonClient implements DaemonClientLike {
  readonly callToolCalls: Array<{ toolName: string; params: Record<string, any> }> = [];
  readonly readResourceCalls: string[] = [];
  readonly callDaemonMethodCalls: Array<{ method: string; params: Record<string, any> }> = [];
  private connected = false;
  private toolResult: any;
  private resourceResult: any;
  private daemonMethodResults: Map<string, any> = new Map();
  shouldFailConnect = false;

  constructor(options: {
    toolResult?: any;
    resourceResult?: any;
    daemonMethodResults?: Map<string, any>;
  } = {}) {
    this.toolResult = options.toolResult ?? { content: [{ type: "text", text: "success" }] };
    this.resourceResult = options.resourceResult ?? { contents: [{ uri: "test", text: "test" }] };
    this.daemonMethodResults = options.daemonMethodResults ?? new Map();
  }

  async connect(): Promise<void> {
    if (this.shouldFailConnect) {
      throw new DaemonUnavailableError("Connection failed");
    }
    this.connected = true;
  }

  async close(): Promise<void> {
    this.connected = false;
  }

  async callTool(toolName: string, params: Record<string, any>): Promise<any> {
    this.callToolCalls.push({ toolName, params });
    return this.toolResult;
  }

  async readResource(uri: string): Promise<any> {
    this.readResourceCalls.push(uri);
    return this.resourceResult;
  }

  async callDaemonMethod(method: string, params: Record<string, any>): Promise<any> {
    this.callDaemonMethodCalls.push({ method, params });
    return this.daemonMethodResults.get(method) ?? {};
  }

  isConnected(): boolean {
    return this.connected;
  }
}

/**
 * Fake DaemonManager for testing
 */
class FakeDaemonManager extends DaemonManager {
  statusResult = { running: true, pid: 1234, port: 3000, socketPath: "/tmp/test.sock" };
  startCalled = false;
  waitForReadyResult = true;

  constructor() {
    super();
  }

  override async status() {
    return this.statusResult;
  }

  override async start() {
    this.startCalled = true;
  }

  override async waitForReady(_timeout: number) {
    return this.waitForReadyResult;
  }
}

describe("DaemonMcpProxy", () => {
  describe("connection management", () => {
    test("connects to daemon on first request", async () => {
      const fakeClient = new FakeDaemonClient({
        daemonMethodResults: new Map([
          ["tools/list", { tools: [{ name: "testTool", inputSchema: {} }] }]
        ])
      });
      const fakeManager = new FakeDaemonManager();

      // Mock DaemonClient.isAvailable to return true
      const isAvailableSpy = spyOn(DaemonClient, "isAvailable").mockResolvedValue(true);

      const proxy = new DaemonMcpProxy({
        clientFactory: () => fakeClient,
        daemonManager: fakeManager,
        autoStartDaemon: false
      });

      try {
        await proxy.listTools();

        expect(fakeClient.isConnected()).toBe(true);
        expect(fakeClient.callDaemonMethodCalls).toHaveLength(1);
        expect(fakeClient.callDaemonMethodCalls[0].method).toBe("tools/list");
      } finally {
        isAvailableSpy.mockRestore();
        await proxy.close();
      }
    });

    test("auto-starts daemon when not running", async () => {
      const fakeClient = new FakeDaemonClient({
        daemonMethodResults: new Map([
          ["tools/list", { tools: [] }]
        ])
      });
      const fakeManager = new FakeDaemonManager();
      fakeManager.statusResult = { running: false };

      // Mock DaemonClient.isAvailable to return false initially, then true after start
      let isAvailableCalls = 0;
      const isAvailableSpy = spyOn(DaemonClient, "isAvailable").mockImplementation(async () => {
        isAvailableCalls++;
        return isAvailableCalls > 1;
      });

      const proxy = new DaemonMcpProxy({
        clientFactory: () => fakeClient,
        daemonManager: fakeManager,
        autoStartDaemon: true
      });

      try {
        await proxy.listTools();

        expect(fakeManager.startCalled).toBe(true);
      } finally {
        isAvailableSpy.mockRestore();
        await proxy.close();
      }
    });

    test("throws error when auto-start is disabled and daemon not running", async () => {
      const fakeClient = new FakeDaemonClient();
      const fakeManager = new FakeDaemonManager();
      fakeManager.statusResult = { running: false };

      const isAvailableSpy = spyOn(DaemonClient, "isAvailable").mockResolvedValue(false);

      const proxy = new DaemonMcpProxy({
        clientFactory: () => fakeClient,
        daemonManager: fakeManager,
        autoStartDaemon: false
      });

      try {
        await expect(proxy.listTools()).rejects.toThrow("auto-start is disabled");
      } finally {
        isAvailableSpy.mockRestore();
        await proxy.close();
      }
    });
  });

  describe("tool operations", () => {
    test("listTools returns tools from daemon", async () => {
      const expectedTools = [
        { name: "tapOn", description: "Tap on element", inputSchema: {} },
        { name: "observe", description: "Observe screen", inputSchema: {} }
      ];
      const fakeClient = new FakeDaemonClient({
        daemonMethodResults: new Map([
          ["tools/list", { tools: expectedTools }]
        ])
      });
      const isAvailableSpy = spyOn(DaemonClient, "isAvailable").mockResolvedValue(true);

      const proxy = new DaemonMcpProxy({
        clientFactory: () => fakeClient,
        autoStartDaemon: false
      });

      try {
        const tools = await proxy.listTools();

        expect(tools).toEqual(expectedTools);
        expect(fakeClient.callDaemonMethodCalls).toContainEqual({
          method: "tools/list",
          params: {}
        });
      } finally {
        isAvailableSpy.mockRestore();
        await proxy.close();
      }
    });

    test("listTools caches results", async () => {
      const fakeClient = new FakeDaemonClient({
        daemonMethodResults: new Map([
          ["tools/list", { tools: [{ name: "test" }] }]
        ])
      });
      const isAvailableSpy = spyOn(DaemonClient, "isAvailable").mockResolvedValue(true);

      const proxy = new DaemonMcpProxy({
        clientFactory: () => fakeClient,
        autoStartDaemon: false
      });

      try {
        await proxy.listTools();
        await proxy.listTools();
        await proxy.listTools();

        // Should only call daemon once due to caching
        expect(fakeClient.callDaemonMethodCalls.length).toBe(1);
      } finally {
        isAvailableSpy.mockRestore();
        await proxy.close();
      }
    });

    test("callTool forwards to daemon", async () => {
      const expectedResult = { content: [{ type: "text", text: "tapped!" }] };
      const fakeClient = new FakeDaemonClient({ toolResult: expectedResult });
      const isAvailableSpy = spyOn(DaemonClient, "isAvailable").mockResolvedValue(true);

      const proxy = new DaemonMcpProxy({
        clientFactory: () => fakeClient,
        autoStartDaemon: false
      });

      try {
        const result = await proxy.callTool("tapOn", { text: "Button" });

        expect(result).toEqual(expectedResult);
        expect(fakeClient.callToolCalls).toContainEqual({
          toolName: "tapOn",
          params: { text: "Button" }
        });
      } finally {
        isAvailableSpy.mockRestore();
        await proxy.close();
      }
    });
  });

  describe("resource operations", () => {
    test("listResources returns resources from daemon", async () => {
      const expectedResources = [
        { uri: "automobile:devices/booted", name: "Booted devices" }
      ];
      const fakeClient = new FakeDaemonClient({
        daemonMethodResults: new Map([
          ["resources/list", { resources: expectedResources }]
        ])
      });
      const isAvailableSpy = spyOn(DaemonClient, "isAvailable").mockResolvedValue(true);

      const proxy = new DaemonMcpProxy({
        clientFactory: () => fakeClient,
        autoStartDaemon: false
      });

      try {
        const resources = await proxy.listResources();

        expect(resources).toEqual(expectedResources);
      } finally {
        isAvailableSpy.mockRestore();
        await proxy.close();
      }
    });

    test("readResource forwards to daemon", async () => {
      const expectedResult = { contents: [{ uri: "automobile:test", text: "data" }] };
      const fakeClient = new FakeDaemonClient({ resourceResult: expectedResult });
      const isAvailableSpy = spyOn(DaemonClient, "isAvailable").mockResolvedValue(true);

      const proxy = new DaemonMcpProxy({
        clientFactory: () => fakeClient,
        autoStartDaemon: false
      });

      try {
        const result = await proxy.readResource("automobile:devices/booted");

        expect(result).toEqual(expectedResult);
        expect(fakeClient.readResourceCalls).toContain("automobile:devices/booted");
      } finally {
        isAvailableSpy.mockRestore();
        await proxy.close();
      }
    });
  });

  describe("cache invalidation", () => {
    test("invalidateCache clears all caches", async () => {
      const fakeClient = new FakeDaemonClient({
        daemonMethodResults: new Map([
          ["tools/list", { tools: [{ name: "test" }] }],
          ["resources/list", { resources: [{ uri: "test" }] }]
        ])
      });
      const isAvailableSpy = spyOn(DaemonClient, "isAvailable").mockResolvedValue(true);

      const proxy = new DaemonMcpProxy({
        clientFactory: () => fakeClient,
        autoStartDaemon: false
      });

      try {
        // Populate caches
        await proxy.listTools();
        await proxy.listResources();

        expect(fakeClient.callDaemonMethodCalls.length).toBe(2);

        // Invalidate caches
        proxy.invalidateCache();

        // Should fetch again
        await proxy.listTools();
        await proxy.listResources();

        expect(fakeClient.callDaemonMethodCalls.length).toBe(4);
      } finally {
        isAvailableSpy.mockRestore();
        await proxy.close();
      }
    });
  });
});
