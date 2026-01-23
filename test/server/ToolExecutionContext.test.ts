import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { SessionManager } from "../../src/daemon/sessionManager";
import { DevicePool } from "../../src/daemon/devicePool";
import { createToolExecutionContext } from "../../src/server/ToolExecutionContext";
import { AndroidAccessibilityServiceManager } from "../../src/utils/AccessibilityServiceManager";
import { AccessibilityServiceClient } from "../../src/features/observe/AccessibilityServiceClient";
import { FakeInstalledAppsRepository } from "../fakes/FakeInstalledAppsRepository";
import { FakeTimer } from "../fakes/FakeTimer";
import { FakeDeviceManager } from "../fakes/FakeDeviceManager";
import { BootedDevice } from "../../src/models";

describe("ToolExecutionContext", () => {
  let sessionManager: SessionManager;
  let devicePool: DevicePool;
  let fakeAppsRepo: FakeInstalledAppsRepository;
  let fakeTimer: FakeTimer;
  let originalGetInstance: typeof AndroidAccessibilityServiceManager.getInstance;
  let originalClientGetInstance: typeof AccessibilityServiceClient.getInstance;
  const sessionOptions = { keepScreenAwake: false };
  const createBootedDevice = (deviceId: string): BootedDevice => ({
    name: deviceId,
    platform: "android",
    deviceId
  });

  beforeEach(async () => {
    fakeTimer = new FakeTimer();
    sessionManager = new SessionManager(fakeTimer);
    fakeAppsRepo = new FakeInstalledAppsRepository();
    const fakeDeviceManager = new FakeDeviceManager();
    devicePool = new DevicePool(sessionManager, "test-daemon-session-id", fakeTimer, fakeAppsRepo, fakeDeviceManager);
    await devicePool.initializeWithDevices([createBootedDevice("device-1")]);
    originalGetInstance = AndroidAccessibilityServiceManager.getInstance;
    originalClientGetInstance = AccessibilityServiceClient.getInstance;

    // Reset AccessibilityServiceClient instances for clean test state
    AccessibilityServiceClient.resetInstances();
  });

  afterEach(() => {
    sessionManager.stopCleanupTimer();
    AndroidAccessibilityServiceManager.getInstance = originalGetInstance;
    AccessibilityServiceClient.getInstance = originalClientGetInstance;
    AccessibilityServiceClient.resetInstances();
  });

  test("should run accessibility setup when creating a new session", async () => {
    let setupCalls = 0;
    AndroidAccessibilityServiceManager.getInstance = () =>
      ({
        setup: async () => {
          setupCalls += 1;
          return { success: true, message: "ok" };
        }
      } as any);

    // Mock AccessibilityServiceClient to use fake WebSocket (no real connection)
    AccessibilityServiceClient.getInstance = ((deviceId: string) => ({
      waitForConnection: async () => true,
      close: async () => {}
    })) as any;

    const context = await createToolExecutionContext("session-1", sessionManager, devicePool, sessionOptions);

    expect(context.deviceId).toBe("device-1");
    expect(setupCalls).toBe(1);
  });

  test("should not run accessibility setup for existing sessions", async () => {
    let setupCalls = 0;
    AndroidAccessibilityServiceManager.getInstance = () =>
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
