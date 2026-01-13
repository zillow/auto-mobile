import { beforeEach, describe, expect, test } from "bun:test";
import { LaunchApp } from "../../../src/features/action/LaunchApp";
import { BootedDevice, ObserveResult } from "../../../src/models";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import { FakeAwaitIdle } from "../../fakes/FakeAwaitIdle";
import { FakeObserveScreen } from "../../fakes/FakeObserveScreen";
import { FakeTimer } from "../../fakes/FakeTimer";
import { FakeWindow } from "../../fakes/FakeWindow";

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

    launchApp = new LaunchApp(device, fakeAdb as unknown as any, null, null, fakeTimer);
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
    fakeTimer.setManualMode();
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
});
