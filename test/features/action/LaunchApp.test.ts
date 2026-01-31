import { beforeEach, describe, expect, test, spyOn } from "bun:test";
import { LaunchApp } from "../../../src/features/action/LaunchApp";
import { BootedDevice, ObserveResult } from "../../../src/models";
import { DefaultPerformanceTracker } from "../../../src/utils/PerformanceTracker";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import { FakeAwaitIdle } from "../../fakes/FakeAwaitIdle";
import { FakeInstalledAppsProvider } from "../../fakes/FakeInstalledAppsProvider";
import { FakeObserveScreen } from "../../fakes/FakeObserveScreen";
import { FakeTargetUserDetector } from "../../fakes/FakeTargetUserDetector";
import { FakeTimer } from "../../fakes/FakeTimer";
import { FakeWindow } from "../../fakes/FakeWindow";
import { FakeXCTestService } from "../../fakes/FakeXCTestService";
import { XCTestServiceClient } from "../../../src/features/observe/XCTestServiceClient";

describe("LaunchApp", () => {
  let device: BootedDevice;
  let fakeAdb: FakeAdbExecutor;
  let fakeAwaitIdle: FakeAwaitIdle;
  let fakeObserveScreen: FakeObserveScreen;
  let fakeTimer: FakeTimer;
  let fakeWindow: FakeWindow;
  let launchApp: LaunchApp;

  const packageName = "com.example.app";

  const createObserveResult = (): ObserveResult => ({
    updatedAt: Date.now(),
    screenSize: { width: 1080, height: 1920 },
    systemInsets: { top: 0, bottom: 0, left: 0, right: 0 },
    viewHierarchy: { node: {} }
  });

  const configureInstalledApp = () => {
    fakeAdb.setCommandResponse("shell pm list packages --user 0", {
      stdout: `package:${packageName}\n`,
      stderr: ""
    });
    fakeAdb.setCommandResponse("shell pm list packages -s --user 0", { stdout: "", stderr: "" });
  };

  beforeEach(() => {
    device = { name: "test-device", platform: "android", deviceId: "device-123" };
    fakeAdb = new FakeAdbExecutor();
    fakeAwaitIdle = new FakeAwaitIdle();
    fakeObserveScreen = new FakeObserveScreen();
    fakeTimer = new FakeTimer();
    fakeWindow = new FakeWindow();

    fakeObserveScreen.setObserveResult(createObserveResult());
    fakeWindow.setCachedActiveWindow(null);
    fakeWindow.setActiveWindow({ appId: packageName, activityName: "MainActivity", layoutSeqSum: 1 });

    launchApp = new LaunchApp(device, fakeAdb as unknown as any, null, fakeTimer);
    (launchApp as any).awaitIdle = fakeAwaitIdle;
    (launchApp as any).observeScreen = fakeObserveScreen;
    (launchApp as any).window = fakeWindow;

    configureInstalledApp();
  });

  test("returns observation when app is already in foreground", async () => {
    fakeAdb.setForegroundApp({ packageName, userId: 0 });
    fakeAdb.setCommandResponse(`shell ps | grep ${packageName}`, { stdout: "1\n", stderr: "" });

    const result = await launchApp.execute(packageName, false, false);

    expect(result.success).toBe(true);
    expect(result.error).toBe("App is already in foreground");
    expect(result.observation).toBeDefined();
    expect(fakeObserveScreen.getExecuteCallCount()).toBeGreaterThan(0);
    expect(fakeAwaitIdle.wasMethodCalled("initializeUiStabilityTracking")).toBe(true);
  });

  test("waits for foreground before returning observation", async () => {
    fakeAdb.setForegroundApp(null);
    fakeAdb.setCommandResponse(`shell ps | grep ${packageName}`, { stdout: "0\n", stderr: "" });

    const resultPromise = launchApp.execute(packageName, false, false);

    for (let i = 0; i < 50 && fakeTimer.getPendingSleepCount() === 0; i += 1) {
      await Promise.resolve();
    }

    expect(fakeTimer.getPendingSleepCount()).toBeGreaterThan(0);

    fakeAdb.setForegroundApp({ packageName, userId: 0 });
    fakeTimer.advanceTime(500);

    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.observation).toBeDefined();
    expect(fakeTimer.getSleepCallCount()).toBeGreaterThan(0);
  });

  test("runs target user detection and install check in parallel", async () => {

    const targetUserDetector = new FakeTargetUserDetector(fakeTimer, {
      delayMs: 50,
      resolvedUserId: 10
    });
    const installedAppsProvider = new FakeInstalledAppsProvider(fakeTimer, {
      delayMs: 50,
      installedApps: []
    });

    const parallelLaunchApp = new LaunchApp(device, fakeAdb as unknown as any, null, fakeTimer, {
      targetUserDetector,
      installedAppsProvider
    });

    const resultPromise = parallelLaunchApp.execute(packageName, false, false);

    for (let i = 0; i < 50 && fakeTimer.getPendingSleepCount() < 2; i += 1) {
      await Promise.resolve();
    }

    expect(targetUserDetector.getCallCount()).toBe(1);
    expect(installedAppsProvider.getCallCount()).toBe(1);
    expect(fakeTimer.getPendingSleepCount()).toBe(2);

    fakeTimer.advanceTime(50);

    const result = await resultPromise;

    expect(targetUserDetector.getCompletedCount()).toBe(1);
    expect(installedAppsProvider.getCompletedCount()).toBe(1);
    expect(result.success).toBe(false);
    expect(result.error).toBe("App is not installed");
    expect(result.userId).toBe(10);
  });

  test("waits for both preflight tasks to settle when one fails", async () => {

    const targetUserDetector = new FakeTargetUserDetector(fakeTimer, {
      delayMs: 50,
      resolvedUserId: 10
    });
    const installedAppsProvider = new FakeInstalledAppsProvider(fakeTimer, {
      delayMs: 50,
      shouldThrow: true,
      error: new Error("check installed failed")
    });

    const parallelLaunchApp = new LaunchApp(device, fakeAdb as unknown as any, null, fakeTimer, {
      targetUserDetector,
      installedAppsProvider
    });

    const resultPromise = parallelLaunchApp.execute(packageName, false, false);

    for (let i = 0; i < 50 && fakeTimer.getPendingSleepCount() < 2; i += 1) {
      await Promise.resolve();
    }

    expect(fakeTimer.getPendingSleepCount()).toBe(2);

    fakeTimer.advanceTime(50);

    await expect(resultPromise).rejects.toThrow("check installed failed");
    expect(targetUserDetector.getCompletedCount()).toBe(1);
    expect(installedAppsProvider.getCompletedCount()).toBe(1);
  });

  test("records perf timing for both preflight tasks when one fails", async () => {

    const perfTracker = new DefaultPerformanceTracker(fakeTimer);
    const targetUserDetector = new FakeTargetUserDetector(fakeTimer, {
      delayMs: 50,
      resolvedUserId: 10
    });
    const installedAppsProvider = new FakeInstalledAppsProvider(fakeTimer, {
      delayMs: 50,
      shouldThrow: true,
      error: new Error("check installed failed")
    });

    const perfLaunchApp = new LaunchApp(device, fakeAdb as unknown as any, null, fakeTimer, {
      targetUserDetector,
      installedAppsProvider,
      performanceTrackerFactory: () => perfTracker
    });

    const resultPromise = perfLaunchApp.execute(packageName, false, false);

    for (let i = 0; i < 50 && fakeTimer.getPendingSleepCount() < 2; i += 1) {
      await Promise.resolve();
    }

    fakeTimer.advanceTime(50);

    await expect(resultPromise).rejects.toThrow("check installed failed");

    const timings = perfTracker.getTimings();
    expect(Array.isArray(timings)).toBe(true);

    const launchEntry = (timings as any[]).find(entry => entry.name === "launchApp");
    expect(launchEntry).toBeDefined();
    const childNames = (launchEntry.children as any[]).map(entry => entry.name);
    expect(childNames).toContain("detectTargetUser");
    expect(childNames).toContain("checkInstalled");
  });

  test("launches iOS system apps even when installed list is empty", async () => {
    fakeTimer.enableAutoAdvance();
    const iosDevice: BootedDevice = { name: "test-ios-device", platform: "ios", deviceId: "ios-123" };
    const systemBundleId = "com.apple.Preferences";
    const fakeXCTestService = new FakeXCTestService();
    const getInstanceSpy = spyOn(XCTestServiceClient, "getInstance").mockReturnValue(
      fakeXCTestService as unknown as XCTestServiceClient
    );

    const iosObserveResult: ObserveResult = {
      updatedAt: Date.now(),
      screenSize: { width: 1080, height: 1920 },
      systemInsets: { top: 0, bottom: 0, left: 0, right: 0 },
      viewHierarchy: { hierarchy: { node: {} }, packageName: systemBundleId } as any
    };

    const iosFakeObserveScreen = new FakeObserveScreen();
    iosFakeObserveScreen.setObserveResult(iosObserveResult);
    const iosFakeAwaitIdle = new FakeAwaitIdle();
    const iosFakeWindow = new FakeWindow();
    iosFakeWindow.setCachedActiveWindow({ appId: systemBundleId, activityName: "Main", layoutSeqSum: 1 });

    const installedAppsProvider = new FakeInstalledAppsProvider(fakeTimer, {
      installedApps: []
    });

    const iosLaunchApp = new LaunchApp(
      iosDevice,
      fakeAdb as unknown as any,
      null,
      fakeTimer,
      { installedAppsProvider }
    );
    (iosLaunchApp as any).awaitIdle = iosFakeAwaitIdle;
    (iosLaunchApp as any).observeScreen = iosFakeObserveScreen;
    (iosLaunchApp as any).window = iosFakeWindow;
    (iosLaunchApp as any).waitForIosHierarchyReady = async () => {};

    try {
      const result = await iosLaunchApp.execute(systemBundleId, false, false);
      expect(result.success).toBe(true);
      expect(fakeXCTestService.getLaunchAppHistory()).toEqual([systemBundleId]);
      expect(installedAppsProvider.getCallCount()).toBe(1);
    } finally {
      getInstanceSpy.mockRestore();
    }
  });
});
