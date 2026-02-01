import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { SwipeOn } from "../../../../src/features/action/swipeon";
import { ObserveResult } from "../../../../src/models";
import { AccessibilityServiceClient } from "../../../../src/features/observe/AccessibilityServiceClient";
import { FakeAwaitIdle } from "../../../fakes/FakeAwaitIdle";
import { FakeAccessibilityDetector } from "../../../fakes/FakeAccessibilityDetector";
import { FakeObserveScreen } from "../../../fakes/FakeObserveScreen";
import { FakeGestureExecutor } from "../../../fakes/FakeGestureExecutor";
import { FakeWindow } from "../../../fakes/FakeWindow";
import { FakeTimer } from "../../../fakes/FakeTimer";

describe("SwipeOn boomerang", () => {
  const device = { name: "test-device", platform: "android", deviceId: "device-1" } as const;
  let fakeObserveScreen: FakeObserveScreen;
  let fakeGesture: FakeGestureExecutor;
  let fakeAwaitIdle: FakeAwaitIdle;
  let fakeWindow: FakeWindow;
  let fakeTimer: FakeTimer;
  let fakeAccessibilityDetector: FakeAccessibilityDetector;
  let getInstanceSpy: ReturnType<typeof spyOn> | null = null;

  const createObserveResult = (): ObserveResult => ({
    timestamp: Date.now(),
    screenSize: { width: 1000, height: 2000 },
    systemInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    viewHierarchy: null
  });

  const createSwipeOn = () => {
    const swipeOn = new SwipeOn(device, {} as any, {
      executeGesture: fakeGesture,
      observeScreen: fakeObserveScreen,
      accessibilityDetector: fakeAccessibilityDetector
    });
    (swipeOn as any).awaitIdle = fakeAwaitIdle;
    (swipeOn as any).window = fakeWindow;
    (swipeOn as any).timer = fakeTimer;
    return swipeOn;
  };

  beforeEach(() => {
    fakeAccessibilityDetector = new FakeAccessibilityDetector();
    fakeAccessibilityDetector.setTalkBackEnabled(false);
    getInstanceSpy = spyOn(AccessibilityServiceClient, "getInstance").mockReturnValue({} as AccessibilityServiceClient);
    fakeObserveScreen = new FakeObserveScreen();
    fakeGesture = new FakeGestureExecutor();
    fakeAwaitIdle = new FakeAwaitIdle();
    fakeWindow = new FakeWindow();
    fakeTimer = new FakeTimer();
    fakeTimer.enableAutoAdvance();
    fakeWindow.configureCachedActiveWindow(null);
  });

  afterEach(() => {
    getInstanceSpy?.mockRestore();
  });

  test("performs a round-trip swipe with return speed", async () => {
    fakeObserveScreen.setObserveResult(createObserveResult());

    const swipeOn = createSwipeOn();
    const result = await swipeOn.execute({
      direction: "up",
      autoTarget: false,
      duration: 400,
      boomerang: true,
      apexPause: 0,
      returnSpeed: 2
    });

    expect(result.success).toBe(true);
    expect(result.duration).toBe(600);

    const calls = fakeGesture.getSwipeCalls();
    expect(calls).toHaveLength(2);
    expect(calls[0].options?.duration).toBe(400);
    expect(calls[1].options?.duration).toBe(200);
    expect(calls[1].x1).toBe(calls[0].x2);
    expect(calls[1].y1).toBe(calls[0].y2);
    expect(calls[1].x2).toBe(calls[0].x1);
    expect(calls[1].y2).toBe(calls[0].y1);
  });
});

describe("SwipeOn lookFor validation", () => {
  const device = { name: "test-device", platform: "android", deviceId: "device-1" } as const;
  let fakeObserveScreen: FakeObserveScreen;
  let fakeGesture: FakeGestureExecutor;
  let fakeAwaitIdle: FakeAwaitIdle;
  let fakeWindow: FakeWindow;
  let fakeTimer: FakeTimer;
  let fakeAccessibilityDetector: FakeAccessibilityDetector;
  let getInstanceSpy: ReturnType<typeof spyOn> | null = null;

  const createSwipeOn = () => {
    const swipeOn = new SwipeOn(device, {} as any, {
      executeGesture: fakeGesture,
      observeScreen: fakeObserveScreen,
      accessibilityDetector: fakeAccessibilityDetector
    });
    (swipeOn as any).awaitIdle = fakeAwaitIdle;
    (swipeOn as any).window = fakeWindow;
    (swipeOn as any).timer = fakeTimer;
    return swipeOn;
  };

  beforeEach(() => {
    fakeAccessibilityDetector = new FakeAccessibilityDetector();
    fakeAccessibilityDetector.setTalkBackEnabled(false);
    getInstanceSpy = spyOn(AccessibilityServiceClient, "getInstance").mockReturnValue({} as AccessibilityServiceClient);
    fakeObserveScreen = new FakeObserveScreen();
    fakeGesture = new FakeGestureExecutor();
    fakeAwaitIdle = new FakeAwaitIdle();
    fakeWindow = new FakeWindow();
    fakeTimer = new FakeTimer();
    fakeTimer.enableAutoAdvance();
    fakeWindow.configureCachedActiveWindow(null);
  });

  afterEach(() => {
    getInstanceSpy?.mockRestore();
  });

  test("rejects lookFor without text or elementId", async () => {
    const swipeOn = createSwipeOn();
    const result = await swipeOn.execute({
      direction: "up",
      lookFor: {}
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("lookFor must specify exactly one of elementId or text");
  });

  test("rejects lookFor with both text and elementId", async () => {
    const swipeOn = createSwipeOn();
    const result = await swipeOn.execute({
      direction: "up",
      lookFor: {
        text: "Settings",
        elementId: "com.app:id/settings"
      }
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("lookFor must specify exactly one of elementId or text");
  });
});
