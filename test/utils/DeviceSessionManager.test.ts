import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DeviceSessionManager } from "../../src/utils/DeviceSessionManager";
import { FakeAdbExecutor } from "../fakes/FakeAdbExecutor";
import { FakeDeviceUtils } from "../fakes/FakeDeviceUtils";
import { FakeDeviceClientProvider } from "../fakes/FakeDeviceClientProvider";
import { FakeCtrlProxyManager } from "../fakes/FakeCtrlProxyManager";
import { AndroidCtrlProxyManager } from "../../src/utils/CtrlProxyManager";
import { CtrlProxyClient } from "../../src/features/observe/android";
import { Window } from "../../src/features/observe/Window";
import { BootedDevice, AppearanceConfigInput } from "../../src/models";
import { serverConfig } from "../../src/utils/ServerConfig";

describe("DeviceSessionManager", () => {
  const device: BootedDevice = {
    name: "device-1",
    deviceId: "device-1",
    platform: "android",
  };

  let fakeAdb: FakeAdbExecutor;
  let fakeDeviceUtils: FakeDeviceUtils;
  let originalGetActive: typeof Window.prototype.getActive;
  let originalGetInstance: typeof AndroidCtrlProxyManager.getInstance;
  let originalAccessibilityClientGetInstance: typeof CtrlProxyClient.getInstance;
  let originalAppearanceDefaults: AppearanceConfigInput;

  beforeEach(() => {
    fakeAdb = new FakeAdbExecutor();
    fakeDeviceUtils = new FakeDeviceUtils();
    fakeAdb.setDevices([device]);

    originalAppearanceDefaults = serverConfig.getAppearanceDefaults();
    serverConfig.setAppearanceDefaults({
      ...originalAppearanceDefaults,
      applyOnConnect: false,
      syncWithHost: false,
      defaultMode: "light"
    });

    originalGetActive = Window.prototype.getActive;
    Window.prototype.getActive = async function() {
      return {
        appId: "com.example.app",
        activityName: "MainActivity",
        layoutSeqSum: 0
      };
    };

    originalGetInstance = AndroidCtrlProxyManager.getInstance;
    originalAccessibilityClientGetInstance = CtrlProxyClient.getInstance;
  });

  afterEach(() => {
    Window.prototype.getActive = originalGetActive;
    AndroidCtrlProxyManager.getInstance = originalGetInstance;
    CtrlProxyClient.getInstance = originalAccessibilityClientGetInstance;
    serverConfig.setAppearanceDefaults(originalAppearanceDefaults);
  });

  test("should skip accessibility download when requested and not installed", async () => {
    const accessibilityManager = new FakeCtrlProxyManager();
    accessibilityManager.setInstalled(false);
    accessibilityManager.setEnabled(false);
    AndroidCtrlProxyManager.getInstance = () => accessibilityManager as any;
    CtrlProxyClient.getInstance = () =>
      ({
        isConnected: () => false
      } as any);

    const manager = DeviceSessionManager.createInstance(new FakeDeviceClientProvider(fakeAdb, fakeDeviceUtils));
    await manager.ensureDeviceReady("android", "device-1", { skipCtrlProxyDownload: true });

    expect(accessibilityManager.wasMethodCalled("setup")).toBe(false);
    expect(accessibilityManager.wasMethodCalled("enable")).toBe(false);
  });

  test("should enable accessibility when installed but disabled even when download is skipped", async () => {
    const accessibilityManager = new FakeCtrlProxyManager();
    accessibilityManager.setInstalled(true);
    accessibilityManager.setEnabled(false);
    accessibilityManager.setVersionCompatible(true);
    AndroidCtrlProxyManager.getInstance = () => accessibilityManager as any;
    CtrlProxyClient.getInstance = () =>
      ({
        isConnected: () => false,
        waitForConnection: () => Promise.resolve(true)
      } as any);

    const manager = DeviceSessionManager.createInstance(new FakeDeviceClientProvider(fakeAdb, fakeDeviceUtils));
    await manager.ensureDeviceReady("android", "device-1", { skipCtrlProxyDownload: true });

    expect(accessibilityManager.wasMethodCalled("enable")).toBe(true);
    expect(accessibilityManager.wasMethodCalled("isVersionCompatible")).toBe(true);
    expect(accessibilityManager.wasMethodCalled("setup")).toBe(false);
  });

  test("should verify compatibility when download is skipped and service enabled", async () => {
    const accessibilityManager = new FakeCtrlProxyManager();
    accessibilityManager.setInstalled(true);
    accessibilityManager.setEnabled(true);
    accessibilityManager.setVersionCompatible(true);
    AndroidCtrlProxyManager.getInstance = () => accessibilityManager as any;
    CtrlProxyClient.getInstance = () =>
      ({
        isConnected: () => false,
        waitForConnection: () => Promise.resolve(true)
      } as any);

    const manager = DeviceSessionManager.createInstance(new FakeDeviceClientProvider(fakeAdb, fakeDeviceUtils));
    await manager.ensureDeviceReady("android", "device-1", { skipCtrlProxyDownload: true });

    expect(accessibilityManager.wasMethodCalled("isVersionCompatible")).toBe(true);
    expect(accessibilityManager.wasMethodCalled("setup")).toBe(false);
  });

  test("should error on incompatible accessibility version when download is skipped", async () => {
    const accessibilityManager = new FakeCtrlProxyManager();
    accessibilityManager.setInstalled(true);
    accessibilityManager.setEnabled(true);
    accessibilityManager.setVersionCompatible(false);
    AndroidCtrlProxyManager.getInstance = () => accessibilityManager as any;
    CtrlProxyClient.getInstance = () =>
      ({
        isConnected: () => false,
        waitForConnection: () => Promise.resolve(true)
      } as any);

    const manager = DeviceSessionManager.createInstance(new FakeDeviceClientProvider(fakeAdb, fakeDeviceUtils));
    await expect(
      manager.ensureDeviceReady("android", "device-1", { skipCtrlProxyDownload: true })
    ).rejects.toThrow("Accessibility service version mismatch");
  });

  test("should run accessibility setup by default", async () => {
    const accessibilityManager = new FakeCtrlProxyManager();
    accessibilityManager.setInstalled(false);
    accessibilityManager.setEnabled(false);
    AndroidCtrlProxyManager.getInstance = () => accessibilityManager as any;
    CtrlProxyClient.getInstance = () =>
      ({
        isConnected: () => false,
        waitForConnection: () => Promise.resolve(true),
        verifyServiceReady: () => Promise.resolve(true)
      } as any);

    const manager = DeviceSessionManager.createInstance(new FakeDeviceClientProvider(fakeAdb, fakeDeviceUtils));
    await manager.ensureDeviceReady("android", "device-1");

    expect(accessibilityManager.wasMethodCalled("setup")).toBe(true);
  });

  test("should skip setup when accessibility is already enabled and WebSocket connects", async () => {
    const accessibilityManager = new FakeCtrlProxyManager();
    accessibilityManager.setInstalled(true);
    accessibilityManager.setEnabled(true);
    AndroidCtrlProxyManager.getInstance = () => accessibilityManager as any;
    CtrlProxyClient.getInstance = () =>
      ({
        isConnected: () => false,
        waitForConnection: () => Promise.resolve(true)
      } as any);

    const manager = DeviceSessionManager.createInstance(new FakeDeviceClientProvider(fakeAdb, fakeDeviceUtils));
    await manager.ensureDeviceReady("android", "device-1");

    // When installed, enabled, and WebSocket connects - service is working, no need for setup
    expect(accessibilityManager.wasMethodCalled("setup")).toBe(false);
  });

  test("should run setup when accessibility cache is stale (WebSocket fails)", async () => {
    const accessibilityManager = new FakeCtrlProxyManager();
    accessibilityManager.setInstalled(true);
    accessibilityManager.setEnabled(true);
    AndroidCtrlProxyManager.getInstance = () => accessibilityManager as any;
    CtrlProxyClient.getInstance = () =>
      ({
        isConnected: () => false,
        waitForConnection: () => Promise.resolve(false)  // WebSocket fails - cache is stale
      } as any);

    const manager = DeviceSessionManager.createInstance(new FakeDeviceClientProvider(fakeAdb, fakeDeviceUtils));
    await manager.ensureDeviceReady("android", "device-1");

    // Cache was stale (claimed installed but WebSocket failed), so setup should run
    expect(accessibilityManager.wasMethodCalled("resetSetupState")).toBe(true);
    expect(accessibilityManager.wasMethodCalled("setup")).toBe(true);
  });

  test("should skip accessibility checks when websocket is connected and service is responsive", async () => {
    let managerTouched = false;
    AndroidCtrlProxyManager.getInstance = () => {
      managerTouched = true;
      return {
        isInstalled: async () => false,
        isEnabled: async () => false,
        enable: async () => {},
        setup: async () => ({ success: true, message: "ok" })
      } as any;
    };
    CtrlProxyClient.getInstance = () =>
      ({
        isConnected: () => true,
        verifyServiceReady: () => Promise.resolve(true)
      } as any);

    const manager = DeviceSessionManager.createInstance(new FakeDeviceClientProvider(fakeAdb, fakeDeviceUtils));
    await manager.ensureDeviceReady("android", "device-1");

    expect(managerTouched).toBe(false);
  });

  test("should fall through to normal flow when websocket connected but service not responsive", async () => {
    const accessibilityManager = new FakeCtrlProxyManager();
    accessibilityManager.setInstalled(true);
    accessibilityManager.setEnabled(true);
    AndroidCtrlProxyManager.getInstance = () => accessibilityManager as any;
    CtrlProxyClient.getInstance = () =>
      ({
        isConnected: () => true,
        verifyServiceReady: () => Promise.resolve(false),  // Service not responsive
        waitForConnection: () => Promise.resolve(true)
      } as any);

    const manager = DeviceSessionManager.createInstance(new FakeDeviceClientProvider(fakeAdb, fakeDeviceUtils));
    await manager.ensureDeviceReady("android", "device-1");

    // Should have fallen through and checked status since service wasn't responsive
    expect(accessibilityManager.wasMethodCalled("isInstalled")).toBe(true);
  });
});
