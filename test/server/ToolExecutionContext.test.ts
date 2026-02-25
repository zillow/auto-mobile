import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { SessionManager } from "../../src/daemon/sessionManager";
import { DevicePool } from "../../src/daemon/devicePool";
import { createToolExecutionContext } from "../../src/server/ToolExecutionContext";
import { AndroidCtrlProxyManager } from "../../src/utils/CtrlProxyManager";
import { CtrlProxyClient } from "../../src/features/observe/android";
import { FakeInstalledAppsRepository } from "../fakes/FakeInstalledAppsRepository";
import { FakeTimer } from "../fakes/FakeTimer";
import { FakeDeviceManager } from "../fakes/FakeDeviceManager";
import { BootedDevice } from "../../src/models";

describe("ToolExecutionContext", () => {
  let sessionManager: SessionManager;
  let devicePool: DevicePool;
  let fakeAppsRepo: FakeInstalledAppsRepository;
  let fakeTimer: FakeTimer;
  let originalGetInstance: typeof AndroidCtrlProxyManager.getInstance;
  let originalClientGetInstance: typeof CtrlProxyClient.getInstance;
  const sessionOptions = { keepScreenAwake: false };
  const createBootedDevice = (deviceId: string): BootedDevice => ({
    name: deviceId,
    platform: "android",
    deviceId
  });

  beforeEach(async () => {
    fakeTimer = new FakeTimer();
    fakeTimer.enableAutoAdvance();
    sessionManager = new SessionManager(fakeTimer);
    fakeAppsRepo = new FakeInstalledAppsRepository();
    const fakeDeviceManager = new FakeDeviceManager();
    devicePool = new DevicePool(sessionManager, "test-daemon-session-id", fakeTimer, fakeAppsRepo, fakeDeviceManager);
    await devicePool.initializeWithDevices([createBootedDevice("device-1")]);
    originalGetInstance = AndroidCtrlProxyManager.getInstance;
    originalClientGetInstance = CtrlProxyClient.getInstance;

    // Reset CtrlProxyClient instances for clean test state
    CtrlProxyClient.resetInstances();
  });

  afterEach(() => {
    sessionManager.stopCleanupTimer();
    AndroidCtrlProxyManager.getInstance = originalGetInstance;
    CtrlProxyClient.getInstance = originalClientGetInstance;
    CtrlProxyClient.resetInstances();
  });

  test("should run accessibility setup when creating a new session", async () => {
    let setupCalls = 0;
    AndroidCtrlProxyManager.getInstance = () =>
      ({
        setup: async () => {
          setupCalls += 1;
          return { success: true, message: "ok" };
        }
      } as any);

    // Mock CtrlProxyClient to use fake WebSocket (no real connection)
    CtrlProxyClient.getInstance = ((deviceId: string) => ({
      waitForConnection: async () => true,
      close: async () => {}
    })) as any;

    const context = await createToolExecutionContext("session-1", sessionManager, devicePool, sessionOptions);

    expect(context.deviceId).toBe("device-1");
    expect(setupCalls).toBe(1);
  });

  test("should not run accessibility setup for existing sessions", async () => {
    let setupCalls = 0;
    AndroidCtrlProxyManager.getInstance = () =>
      ({
        setup: async () => {
          setupCalls += 1;
          return { success: true, message: "ok" };
        }
      } as any);

    await sessionManager.createSession("session-1", "device-1", "android");
    const context = await createToolExecutionContext("session-1", sessionManager, devicePool, sessionOptions);

    expect(context.deviceId).toBe("device-1");
    expect(setupCalls).toBe(0);
  });
});
