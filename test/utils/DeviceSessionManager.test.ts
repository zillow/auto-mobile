import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DeviceSessionManager } from "../../src/utils/DeviceSessionManager";
import { FakeAdbExecutor } from "../fakes/FakeAdbExecutor";
import { FakeDeviceUtils } from "../fakes/FakeDeviceUtils";
import { AndroidAccessibilityServiceManager } from "../../src/utils/AccessibilityServiceManager";
import { AccessibilityServiceClient } from "../../src/features/observe/AccessibilityServiceClient";
import { Window } from "../../src/features/observe/Window";
import { BootedDevice } from "../../src/models";

describe("DeviceSessionManager", () => {
  const device: BootedDevice = {
    name: "device-1",
    deviceId: "device-1",
    platform: "android",
  };

  let fakeAdb: FakeAdbExecutor;
  let fakeDeviceUtils: FakeDeviceUtils;
  let originalGetActive: typeof Window.prototype.getActive;
  let originalGetInstance: typeof AndroidAccessibilityServiceManager.getInstance;
  let originalAccessibilityClientGetInstance: typeof AccessibilityServiceClient.getInstance;

  beforeEach(() => {
    fakeAdb = new FakeAdbExecutor();
    fakeDeviceUtils = new FakeDeviceUtils();
    fakeAdb.setDevices([device]);

    originalGetActive = Window.prototype.getActive;
    Window.prototype.getActive = async function() {
      return {
        appId: "com.example.app",
        activityName: "MainActivity",
        layoutSeqSum: 0
      };
    };

    originalGetInstance = AndroidAccessibilityServiceManager.getInstance;
    originalAccessibilityClientGetInstance = AccessibilityServiceClient.getInstance;
  });

  afterEach(() => {
    Window.prototype.getActive = originalGetActive;
    AndroidAccessibilityServiceManager.getInstance = originalGetInstance;
    AccessibilityServiceClient.getInstance = originalAccessibilityClientGetInstance;
  });

  test("should skip accessibility download when requested and not installed", async () => {
    let setupCalled = false;
    let enableCalled = false;
    AndroidAccessibilityServiceManager.getInstance = () =>
      ({
        isInstalled: async () => false,
        isEnabled: async () => false,
        enable: async () => {
          enableCalled = true;
        },
        setup: async () => {
          setupCalled = true;
          return { success: true, message: "ok" };
        }
      } as any);
    AccessibilityServiceClient.getInstance = () =>
      ({
        isConnected: () => false
      } as any);

    const manager = DeviceSessionManager.createInstance(fakeAdb, fakeDeviceUtils);
    await manager.ensureDeviceReady("android", "device-1", { skipAccessibilityDownload: true });

    expect(setupCalled).toBe(false);
    expect(enableCalled).toBe(false);
  });

  test("should enable accessibility when installed but disabled even when download is skipped", async () => {
    let setupCalled = false;
    let enableCalled = false;
    AndroidAccessibilityServiceManager.getInstance = () =>
      ({
        isInstalled: async () => true,
        isEnabled: async () => false,
        enable: async () => {
          enableCalled = true;
        },
        setup: async () => {
          setupCalled = true;
          return { success: true, message: "ok" };
        }
      } as any);
    AccessibilityServiceClient.getInstance = () =>
      ({
        isConnected: () => false
      } as any);

    const manager = DeviceSessionManager.createInstance(fakeAdb, fakeDeviceUtils);
    await manager.ensureDeviceReady("android", "device-1", { skipAccessibilityDownload: true });

    expect(enableCalled).toBe(true);
    expect(setupCalled).toBe(false);
  });

  test("should run accessibility setup by default", async () => {
    let setupCalled = false;
    AndroidAccessibilityServiceManager.getInstance = () =>
      ({
        isInstalled: async () => false,
        isEnabled: async () => false,
        enable: async () => {},
        setup: async () => {
          setupCalled = true;
          return { success: true, message: "ok" };
        }
      } as any);
    AccessibilityServiceClient.getInstance = () =>
      ({
        isConnected: () => false
      } as any);

    const manager = DeviceSessionManager.createInstance(fakeAdb, fakeDeviceUtils);
    await manager.ensureDeviceReady("android", "device-1");

    expect(setupCalled).toBe(true);
  });

  test("should verify compatibility when accessibility is already enabled", async () => {
    let setupCalled = false;
    AndroidAccessibilityServiceManager.getInstance = () =>
      ({
        isInstalled: async () => true,
        isEnabled: async () => true,
        enable: async () => {},
        setup: async () => {
          setupCalled = true;
          return { success: true, message: "ok" };
        }
      } as any);
    AccessibilityServiceClient.getInstance = () =>
      ({
        isConnected: () => false
      } as any);

    const manager = DeviceSessionManager.createInstance(fakeAdb, fakeDeviceUtils);
    await manager.ensureDeviceReady("android", "device-1");

    expect(setupCalled).toBe(true);
  });

  test("should skip accessibility checks when websocket is connected", async () => {
    let managerTouched = false;
    AndroidAccessibilityServiceManager.getInstance = () => {
      managerTouched = true;
      return {
        isInstalled: async () => false,
        isEnabled: async () => false,
        enable: async () => {},
        setup: async () => ({ success: true, message: "ok" })
      } as any;
    };
    AccessibilityServiceClient.getInstance = () =>
      ({
        isConnected: () => true
      } as any);

    const manager = DeviceSessionManager.createInstance(fakeAdb, fakeDeviceUtils);
    await manager.ensureDeviceReady("android", "device-1");

    expect(managerTouched).toBe(false);
  });
});
