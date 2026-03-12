import { describe, expect, test, beforeEach } from "bun:test";
import { BaseVisualChange } from "../../../src/features/action/BaseVisualChange";
import { BootedDevice, ObserveResult } from "../../../src/models";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import { FakeAwaitIdle } from "../../fakes/FakeAwaitIdle";
import { FakeObserveScreen } from "../../fakes/FakeObserveScreen";
import { FakeTimer } from "../../fakes/FakeTimer";
import { FakeWindow } from "../../fakes/FakeWindow";

describe("BaseVisualChange UI stability platform guard", () => {
  let fakeAdb: FakeAdbExecutor;
  let fakeAwaitIdle: FakeAwaitIdle;
  let fakeObserveScreen: FakeObserveScreen;
  let fakeTimer: FakeTimer;
  let fakeWindow: FakeWindow;

  const packageName = "com.example.app";

  const createObserveResult = (): ObserveResult => ({
    updatedAt: Date.now(),
    screenSize: { width: 1080, height: 1920 },
    systemInsets: { top: 0, bottom: 0, left: 0, right: 0 },
    viewHierarchy: { node: {} }
  });

  function createVisualChange(platform: "android" | "ios"): BaseVisualChange {
    const device: BootedDevice = { name: "test-device", platform, deviceId: "device-123" };
    const instance = new BaseVisualChange(device, fakeAdb as unknown as any, fakeTimer);
    (instance as any).awaitIdle = fakeAwaitIdle;
    (instance as any).observeScreen = fakeObserveScreen;
    (instance as any).window = fakeWindow;
    return instance;
  }

  beforeEach(() => {
    fakeAdb = new FakeAdbExecutor();
    fakeAwaitIdle = new FakeAwaitIdle();
    fakeObserveScreen = new FakeObserveScreen();
    fakeTimer = new FakeTimer();
    fakeTimer.enableAutoAdvance();
    fakeWindow = new FakeWindow();

    fakeObserveScreen.setObserveResult(createObserveResult());
    fakeWindow.configureCachedActiveWindow({ appId: packageName, activityName: "Main", layoutSeqSum: 1 });
  });

  test("runs gfxinfo UI stability tracking on Android", async () => {
    const instance = createVisualChange("android");

    await instance.observedInteraction(
      async () => ({ success: true }),
      { changeExpected: false }
    );

    expect(fakeAwaitIdle.wasMethodCalled("initializeUiStabilityTracking")).toBe(true);
  });

  test("skips gfxinfo UI stability tracking on iOS", async () => {
    const instance = createVisualChange("ios");

    await instance.observedInteraction(
      async () => ({ success: true }),
      { changeExpected: false }
    );

    expect(fakeAwaitIdle.wasMethodCalled("initializeUiStabilityTracking")).toBe(false);
    expect(fakeAwaitIdle.getWaitForUiStabilityCallCount()).toBe(0);
    expect(fakeAwaitIdle.getWaitForUiStabilityWithStateCallCount()).toBe(0);
  });
});
