import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import type { BootedDevice, ObserveResult, ViewHierarchyResult } from "../../../src/models";
import { PinchOn } from "../../../src/features/action/PinchOn";
import { AccessibilityServiceClient } from "../../../src/features/observe/android";
import { AndroidAccessibilityServiceManager } from "../../../src/utils/AccessibilityServiceManager";
import { FakeAccessibilityService } from "../../fakes/FakeAccessibilityService";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import { FakeAwaitIdle } from "../../fakes/FakeAwaitIdle";
import { FakeObserveScreen } from "../../fakes/FakeObserveScreen";
import { FakeTimer } from "../../fakes/FakeTimer";
import { FakeWindow } from "../../fakes/FakeWindow";

describe("PinchOn", () => {
  const device: BootedDevice = {
    deviceId: "test-device",
    platform: "android",
    name: "Test Device"
  };

  let pinchOn: PinchOn;
  let fakeObserveScreen: FakeObserveScreen;
  let fakeAwaitIdle: FakeAwaitIdle;
  let fakeWindow: FakeWindow;
  let fakeTimer: FakeTimer;
  let fakeA11yService: FakeAccessibilityService;
  let fakeAdb: FakeAdbExecutor;
  let getInstanceSpy: ReturnType<typeof spyOn> | null = null;
  let managerSpy: ReturnType<typeof spyOn> | null = null;

  const createHierarchy = (): ViewHierarchyResult => ({
    hierarchy: {
      node: [
        {
          $: {
            "resource-id": "container-id",
            "text": "Container",
            "bounds": "[0,0][200,200]",
            "class": "android.widget.FrameLayout"
          }
        }
      ]
    },
    packageName: "com.test.app",
    updatedAt: Date.now()
  });

  const createObserveResult = (): ObserveResult => ({
    updatedAt: Date.now(),
    screenSize: { width: 1080, height: 1920 },
    systemInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    viewHierarchy: createHierarchy()
  });

  beforeEach(() => {
    fakeObserveScreen = new FakeObserveScreen();
    fakeAwaitIdle = new FakeAwaitIdle();
    fakeWindow = new FakeWindow();
    fakeTimer = new FakeTimer();
    fakeTimer.enableAutoAdvance();
    fakeA11yService = new FakeAccessibilityService();
    fakeAdb = new FakeAdbExecutor();

    fakeObserveScreen.setObserveResult(() => createObserveResult());
    fakeWindow.configureCachedActiveWindow(null);
    fakeWindow.configureActiveWindow({ appId: "com.test.app", activityName: "MainActivity", layoutSeqSum: 123 });

    managerSpy = spyOn(AndroidAccessibilityServiceManager, "getInstance").mockReturnValue({
      isAvailable: async () => true
    } as any);
    getInstanceSpy = spyOn(AccessibilityServiceClient, "getInstance").mockReturnValue(fakeA11yService as any);

    pinchOn = new PinchOn(device);
    (pinchOn as any).observeScreen = fakeObserveScreen;
    (pinchOn as any).awaitIdle = fakeAwaitIdle;
    (pinchOn as any).window = fakeWindow;
    (pinchOn as any).adb = fakeAdb;
    (pinchOn as any).timer = fakeTimer;
  });

  afterEach(() => {
    getInstanceSpy?.mockRestore();
    managerSpy?.mockRestore();
  });

  test("returns error when container specifies both elementId and text", async () => {
    const result = await pinchOn.execute({
      direction: "in",
      container: { elementId: "container-id", text: "Container" }
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("pinchOn container must specify exactly one of elementId or text");
    expect(fakeA11yService.getPinchHistory()).toHaveLength(0);
  });

  test("returns error when container specifies neither selector", async () => {
    const result = await pinchOn.execute({
      direction: "in",
      container: {}
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("pinchOn container must specify exactly one of elementId or text");
    expect(fakeA11yService.getPinchHistory()).toHaveLength(0);
  });

  test("requests pinch when container elementId is valid", async () => {
    const result = await pinchOn.execute({
      direction: "out",
      container: { elementId: "container-id" }
    });

    expect(result.success).toBe(true);
    expect(result.targetType).toBe("container");

    const [pinchCall] = fakeA11yService.getPinchHistory();
    expect(pinchCall).toBeDefined();
    expect(pinchCall.centerX).toBe(100);
    expect(pinchCall.centerY).toBe(100);
  });
});
