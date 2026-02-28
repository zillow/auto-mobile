import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UnixSocketServer } from "../../src/daemon/socketServer";
import { FakeTimer } from "../fakes/FakeTimer";
import type { DaemonResponse } from "../../src/daemon/types";

/**
 * Minimal fake MCP client interface for testing.
 * Only implements the methods exercised by handleIdeRequest.
 */
interface FakeMcpClient {
  listTools: () => Promise<{ tools: unknown[] }>;
  callTool: (...args: unknown[]) => Promise<unknown>;
  listResources: () => Promise<{ resources: unknown[] }>;
  readResource: (...args: unknown[]) => Promise<unknown>;
  listResourceTemplates: () => Promise<{ resourceTemplates: unknown[] }>;
  close: () => Promise<void>;
}

function createFakeMcpClient(overrides: Partial<FakeMcpClient> = {}): FakeMcpClient {
  return {
    listTools: async () => ({ tools: [] }),
    callTool: async () => ({ content: [] }),
    listResources: async () => ({ resources: [] }),
    readResource: async () => ({ contents: [] }),
    listResourceTemplates: async () => ({ resourceTemplates: [] }),
    close: async () => {},
    ...overrides,
  };
}

function createFakeDaemonState() {
  return {
    isInitialized: () => true,
    getSessionManager: () => ({ getSession: () => null, releaseSession: async () => null }),
    getDevicePool: () => ({
      refreshDevices: async () => 0,
      getStats: () => ({ total: 0, idle: 0, assigned: 0, error: 0 }),
      releaseDevice: async () => {},
    }),
  };
}

function sendRequest(socketPath: string, method: string, params: Record<string, unknown> = {}): Promise<DaemonResponse> {
  return new Promise((resolve, reject) => {
    const client = new Socket();
    let buffer = "";

    client.connect(socketPath, () => {
      const request = JSON.stringify({
        id: randomUUID(),
        type: "mcp_request",
        method,
        params,
      });
      client.write(request + "\n");
    });

    client.on("data", data => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      for (const line of lines) {
        if (line.trim()) {
          try {
            const response = JSON.parse(line) as DaemonResponse;
            client.destroy();
            resolve(response);
            return;
          } catch {
            // Incomplete JSON, keep buffering
          }
        }
      }
    });

    client.on("error", reject);
    client.on("close", () => {
      if (!buffer.trim()) {
        reject(new Error("Connection closed without response"));
      }
    });
  });
}

describe("UnixSocketServer MCP session reconnect", () => {
  let socketPath: string;
  let server: UnixSocketServer;
  let fakeTimer: FakeTimer;

  beforeEach(async () => {
    socketPath = join(tmpdir(), `mcp-rc-${randomUUID()}.sock`);
    fakeTimer = new FakeTimer();
    server = new UnixSocketServer(
      socketPath,
      "http://localhost:0/mcp",
      createFakeDaemonState(),
      fakeTimer,
    );
    await server.start();
  });

  afterEach(async () => {
    await server.close();
    if (existsSync(socketPath)) {
      await unlink(socketPath);
    }
  });

  test("retries with a fresh client when MCP throws 'Session not found'", async () => {
    let clientsCreated = 0;

    (server as any).createMcpClient = async () => {
      const clientIndex = ++clientsCreated;
      return createFakeMcpClient({
        listTools: async () => {
          if (clientIndex === 1) {
            throw new Error("Session not found");
          }
          return { tools: [{ name: "observe" }] };
        },
      });
    };

    const response = await sendRequest(socketPath, "tools/list");

    expect(response.success).toBe(true);
    expect(clientsCreated).toBe(2);
    const result = response.result as { tools: Array<{ name: string }> };
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].name).toBe("observe");
  });

  test("resets cached client before reconnecting so getMcpClient creates a fresh one", async () => {
    let clientsCreated = 0;

    (server as any).createMcpClient = async () => {
      ++clientsCreated;
      return createFakeMcpClient({
        listTools: async () => {
          if (clientsCreated === 1) {
            throw new Error("Session not found: MCP session expired");
          }
          return { tools: [] };
        },
      });
    };

    await sendRequest(socketPath, "tools/list");

    // After reconnect, mcpClient should hold the fresh client
    expect((server as any).mcpClient).not.toBeNull();
    expect(clientsCreated).toBe(2);
  });

  test("does not retry on non-session errors and returns failure", async () => {
    let clientsCreated = 0;

    (server as any).createMcpClient = async () => {
      ++clientsCreated;
      return createFakeMcpClient({
        listTools: async () => {
          throw new Error("Connection refused");
        },
      });
    };

    const response = await sendRequest(socketPath, "tools/list");

    expect(response.success).toBe(false);
    expect(response.error).toContain("Connection refused");
    // Only one client created — no retry
    expect(clientsCreated).toBe(1);
  });

  test("subsequent requests reuse the reconnected client without creating another", async () => {
    let clientsCreated = 0;

    (server as any).createMcpClient = async () => {
      ++clientsCreated;
      const isFailing = clientsCreated === 1;
      return createFakeMcpClient({
        listTools: async () => {
          if (isFailing) {throw new Error("Session not found");}
          return { tools: [] };
        },
      });
    };

    // First request triggers reconnect (2 clients)
    const first = await sendRequest(socketPath, "tools/list");
    expect(first.success).toBe(true);
    expect(clientsCreated).toBe(2);

    // Second request reuses the cached client (still 2 clients)
    const second = await sendRequest(socketPath, "tools/list");
    expect(second.success).toBe(true);
    expect(clientsCreated).toBe(2);
  });
});
