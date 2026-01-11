import { describe, expect, spyOn, test } from "bun:test";
import { runDaemonCommand } from "../../src/daemon/manager";
import type { DaemonStateLike } from "../../src/daemon/daemonState";
import type { DaemonClientLike } from "../../src/daemon/client";

class FakeDaemonClient implements DaemonClientLike {
  readonly readResourceCalls: string[] = [];
  readonly callToolCalls: Array<{ toolName: string; params: Record<string, any> }> = [];
  private readonly result: any;

  constructor(result: any) {
    this.result = result;
  }

  async connect(): Promise<void> {}

  async close(): Promise<void> {}

  async callTool(toolName: string, params: Record<string, any>): Promise<any> {
    this.callToolCalls.push({ toolName, params });
    return {};
  }

  async readResource(uri: string): Promise<any> {
    this.readResourceCalls.push(uri);
    return this.result;
  }
}

describe("Daemon manager available-devices", () => {
  test("queries the booted devices resource when daemon is not initialized", async () => {
    const result = {
      contents: [
        {
          text: JSON.stringify({
            poolStatus: {
              idle: 2,
              assigned: 1,
              error: 0,
              total: 3
            }
          })
        }
      ]
    };
    const fakeClient = new FakeDaemonClient(result);
    const output: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args) => {
      output.push(args.join(" "));
    });

    try {
      await runDaemonCommand("available-devices", [], {
        clientFactory: () => fakeClient,
        stateProvider: () => ({
          isInitialized: () => false,
          getDevicePool: () => {
            throw new Error("Device pool unavailable");
          },
          getSessionManager: () => {
            throw new Error("Session manager unavailable");
          }
        } satisfies DaemonStateLike)
      });
    } finally {
      logSpy.mockRestore();
    }

    expect(fakeClient.readResourceCalls).toEqual(["automobile:devices/booted"]);
    expect(fakeClient.callToolCalls).toHaveLength(0);
    expect(output).toContain(JSON.stringify({
      availableDevices: 2,
      totalDevices: 3,
      assignedDevices: 1,
      errorDevices: 0
    }));
  });

  test("uses daemon state pool stats when initialized", async () => {
    const fakeClient = new FakeDaemonClient({});
    const output: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args) => {
      output.push(args.join(" "));
    });

    const fakeState: DaemonStateLike = {
      isInitialized: () => true,
      getDevicePool: () => ({
        getStats: () => ({
          idle: 1,
          assigned: 2,
          error: 1,
          total: 4
        })
      } as any),
      getSessionManager: () => ({
        getSession: () => null,
        releaseSession: async () => null
      } as any)
    };

    try {
      await runDaemonCommand("available-devices", [], {
        clientFactory: () => fakeClient,
        stateProvider: () => fakeState
      });
    } finally {
      logSpy.mockRestore();
    }

    expect(fakeClient.readResourceCalls).toHaveLength(0);
    expect(output).toContain(JSON.stringify({
      availableDevices: 1,
      totalDevices: 4,
      assignedDevices: 2,
      errorDevices: 1
    }));
  });
});
