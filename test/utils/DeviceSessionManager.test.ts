import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DeviceSessionManager } from "../../src/utils/DeviceSessionManager";
import { FakeAdbExecutor } from "../fakes/FakeAdbExecutor";
import { FakeDeviceUtils } from "../fakes/FakeDeviceUtils";
import { AndroidAccessibilityServiceManager } from "../../src/utils/AccessibilityServiceManager";
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
  });

  afterEach(() => {
    Window.prototype.getActive = originalGetActive;
    AndroidAccessibilityServiceManager.getInstance = originalGetInstance;
  });

  test("should skip accessibility setup when requested", async () => {
    let setupCalled = false;
    AndroidAccessibilityServiceManager.getInstance = () =>
      ({
        setup: async () => {
          setupCalled = true;
          return { success: true, message: "ok" };
        }
      } as any);

    const manager = DeviceSessionManager.createInstance(fakeAdb, fakeDeviceUtils);
    await manager.ensureDeviceReady("android", "device-1", { skipAccessibilitySetup: true });

    expect(setupCalled).toBe(false);
  });

  test("should run accessibility setup by default", async () => {
    let setupCalled = false;
    AndroidAccessibilityServiceManager.getInstance = () =>
      ({
        setup: async () => {
          setupCalled = true;
          return { success: true, message: "ok" };
        }
      } as any);

    const manager = DeviceSessionManager.createInstance(fakeAdb, fakeDeviceUtils);
    await manager.ensureDeviceReady("android", "device-1");

    expect(setupCalled).toBe(true);
  });
});
