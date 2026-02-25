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

describe("UnixSocketServer ide/status and ide/updateService handlers", () => {
  let socketPath: string;
  let server: UnixSocketServer;
  let fakeTimer: FakeTimer;

  beforeEach(async () => {
    socketPath = join(tmpdir(), `t-ids-${randomUUID().slice(0, 8)}.sock`);
    fakeTimer = new FakeTimer();

    server = new UnixSocketServer(
      socketPath,
      "http://localhost:0/mcp",
      createFakeDaemonState(),
      fakeTimer,
      null
    );
    await server.start();
  });

  afterEach(async () => {
    await server.close();
    if (existsSync(socketPath)) {
      await unlink(socketPath);
    }
  });

  test("ide/status returns expected shape", async () => {
    const response = await sendRequest(socketPath, "ide/status");

    expect(response.success).toBe(true);
    const result = response.result as {
      version: string;
      releaseVersion: string;
      android: { ctrlProxy: { expectedSha256: string; url: string } };
      ios: { xcTestService: { expectedSha256: string; expectedAppHash: string; url: string } };
    };
    expect(typeof result.version).toBe("string");
    expect(typeof result.releaseVersion).toBe("string");
    expect(result.android).toBeDefined();
    expect(result.android.ctrlProxy).toBeDefined();
    expect(typeof result.android.ctrlProxy.expectedSha256).toBe("string");
    expect(typeof result.android.ctrlProxy.url).toBe("string");
    expect(result.ios).toBeDefined();
    expect(result.ios.xcTestService).toBeDefined();
    expect(typeof result.ios.xcTestService.expectedSha256).toBe("string");
    expect(typeof result.ios.xcTestService.expectedAppHash).toBe("string");
    expect(typeof result.ios.xcTestService.url).toBe("string");
  });

  test("ide/updateService returns error for missing params", async () => {
    const response = await sendRequest(socketPath, "ide/updateService", {});

    expect(response.success).toBe(false);
    expect(response.error).toContain("requires");
  });

  test("ide/updateService returns error for missing deviceId", async () => {
    const response = await sendRequest(socketPath, "ide/updateService", { platform: "android" });

    expect(response.success).toBe(false);
    expect(response.error).toContain("requires");
  });

  test("ide/updateService returns error for invalid platform", async () => {
    const response = await sendRequest(socketPath, "ide/updateService", {
      deviceId: "emulator-5554",
      platform: "windows",
    });

    expect(response.success).toBe(false);
    expect(response.error).toContain("Invalid platform");
  });
});
