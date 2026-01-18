import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  DevicePoolStats,
  handleDaemonRequest,
} from "../../src/daemon/daemonRequestHandlers";
import { SessionManager } from "../../src/daemon/sessionManager";
import { DaemonRequest } from "../../src/daemon/types";
import { FakeTimer } from "../fakes/FakeTimer";

class FakeDevicePool {
  stats: DevicePoolStats;
  refreshedCount = 0;
  releasedDevices: string[] = [];
  addedDevices: number;

  constructor(stats: DevicePoolStats, addedDevices: number = 0) {
    this.stats = stats;
    this.addedDevices = addedDevices;
  }

  async refreshDevices(): Promise<number> {
    this.refreshedCount += 1;
    return this.addedDevices;
  }

  getStats(): DevicePoolStats {
    return this.stats;
  }

  async releaseDevice(deviceId: string): Promise<void> {
    this.releasedDevices.push(deviceId);
  }
}

class FakeDaemonState {
  private sessionManager: SessionManager | null;
  private devicePool: FakeDevicePool | null;

  constructor(sessionManager: SessionManager | null, devicePool: FakeDevicePool | null) {
    this.sessionManager = sessionManager;
    this.devicePool = devicePool;
  }

  isInitialized(): boolean {
    return this.sessionManager !== null && this.devicePool !== null;
  }

  getSessionManager(): SessionManager {
    if (!this.sessionManager) {
      throw new Error("DaemonState not initialized");
    }
    return this.sessionManager;
  }

  getDevicePool(): FakeDevicePool {
    if (!this.devicePool) {
      throw new Error("DaemonState not initialized");
    }
    return this.devicePool;
  }
}

const buildRequest = (
  method: string,
  params: Record<string, unknown> = {}
): DaemonRequest => ({
  id: "request-1",
  type: "daemon_request",
  method,
  params,
});

describe("handleDaemonRequest", () => {
  let fakeTimer: FakeTimer;
  let sessionManager: SessionManager;

  beforeEach(() => {
    fakeTimer = new FakeTimer();
    fakeTimer.setManualMode();
    sessionManager = new SessionManager(fakeTimer);
  });

  afterEach(() => {
    sessionManager.stopCleanupTimer();
  });

  test("returns error when daemon is not initialized", async () => {
    const state = new FakeDaemonState(null, null);
    const response = await handleDaemonRequest(
      buildRequest("daemon/availableDevices"),
      state
    );

    expect(response.success).toBe(false);
    expect(response.error).toBe("Daemon not initialized");
  });

  test("returns session info for active session", async () => {
    const devicePool = new FakeDevicePool({
      total: 1,
      idle: 1,
      assigned: 0,
      error: 0,
      avgAssignments: 0,
    });
    const state = new FakeDaemonState(sessionManager, devicePool);
    const sessionId = "session-1";
    const deviceId = "emulator-5554";
    const session = await sessionManager.createSession(sessionId, deviceId, "android");

    const response = await handleDaemonRequest(
      buildRequest("daemon/sessionInfo", { sessionId }),
      state
    );

    expect(response.success).toBe(true);
    expect(response.result).toEqual({
      sessionId,
      assignedDevice: deviceId,
      platform: "android",
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
      cacheSize: JSON.stringify(session.cacheData).length,
    });
  });

  test("returns error when sessionId is missing", async () => {
    const devicePool = new FakeDevicePool({
      total: 0,
      idle: 0,
      assigned: 0,
      error: 0,
      avgAssignments: 0,
    });
    const state = new FakeDaemonState(sessionManager, devicePool);

    const response = await handleDaemonRequest(
      buildRequest("daemon/sessionInfo"),
      state
    );

    expect(response.success).toBe(false);
    expect(response.error).toBe("sessionId parameter required");
  });

  test("releases session and device", async () => {
    const devicePool = new FakeDevicePool({
      total: 1,
      idle: 0,
      assigned: 1,
      error: 0,
      avgAssignments: 0,
    });
    const state = new FakeDaemonState(sessionManager, devicePool);
    const sessionId = "session-2";
    const deviceId = "emulator-5556";
    await sessionManager.createSession(sessionId, deviceId, "android");

    const response = await handleDaemonRequest(
      buildRequest("daemon/releaseSession", { sessionId }),
      state
    );

    expect(response.success).toBe(true);
    expect(response.result).toEqual({
      message: `Session ${sessionId} released`,
      device: deviceId,
    });
    expect(devicePool.releasedDevices).toEqual([deviceId]);
    expect(sessionManager.getSession(sessionId)).toBeNull();
  });

  test("refreshes device pool and returns stats", async () => {
    const devicePool = new FakeDevicePool(
      {
        total: 2,
        idle: 1,
        assigned: 1,
        error: 0,
        avgAssignments: 0,
      },
      1
    );
    const state = new FakeDaemonState(sessionManager, devicePool);

    const response = await handleDaemonRequest(
      buildRequest("daemon/refreshDevices"),
      state
    );

    expect(response.success).toBe(true);
    expect(response.result).toEqual({
      addedDevices: 1,
      totalDevices: 2,
      availableDevices: 1,
      stats: devicePool.stats,
    });
    expect(devicePool.refreshedCount).toBe(1);
  });

  test("returns available device stats", async () => {
    const devicePool = new FakeDevicePool({
      total: 3,
      idle: 2,
      assigned: 1,
      error: 0,
      avgAssignments: 2,
    });
    const state = new FakeDaemonState(sessionManager, devicePool);

    const response = await handleDaemonRequest(
      buildRequest("daemon/availableDevices"),
      state
    );

    expect(response.success).toBe(true);
    expect(response.result).toEqual({
      availableDevices: 2,
      totalDevices: 3,
      assignedDevices: 1,
      errorDevices: 0,
      stats: devicePool.stats,
    });
  });
});
