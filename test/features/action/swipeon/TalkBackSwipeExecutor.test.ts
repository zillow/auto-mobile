import { beforeEach, describe, expect, test } from "bun:test";
import { TalkBackSwipeExecutor } from "../../../../src/features/action/swipeon/TalkBackSwipeExecutor";
import { FakeAccessibilityDetector } from "../../../fakes/FakeAccessibilityDetector";
import { FakeGestureExecutor } from "../../../fakes/FakeGestureExecutor";
import { FakeTimer } from "../../../fakes/FakeTimer";
import { FakeCtrlProxy } from "../../../fakes/FakeCtrlProxy";
import { SwipeDirection } from "../../../../src/models";
import { NoOpPerformanceTracker } from "../../../../src/utils/PerformanceTracker";
import type { BootedDevice } from "../../../../src/models";

const ANDROID_DEVICE: BootedDevice = {
  name: "test-device",
  platform: "android",
  deviceId: "emulator-5554",
} as unknown as BootedDevice;

const IOS_DEVICE: BootedDevice = {
  name: "test-ios-device",
  platform: "ios",
  deviceId: "test-ios-device",
} as unknown as BootedDevice;

function makeExecutor(
  device: BootedDevice,
  fakeGesture: FakeGestureExecutor,
  fakeProxy: FakeCtrlProxy,
  fakeDetector: FakeAccessibilityDetector,
  fakeTimer: FakeTimer
): TalkBackSwipeExecutor {
  return new TalkBackSwipeExecutor(
    device,
    fakeGesture,
    fakeProxy as any,
    fakeDetector,
    fakeTimer
  );
}

describe("TalkBackSwipeExecutor", () => {
  let fakeAccessibilityDetector: FakeAccessibilityDetector;
  let fakeGestureExecutor: FakeGestureExecutor;
  let fakeTimer: FakeTimer;
  let fakeCtrlProxy: FakeCtrlProxy;
  let executor: TalkBackSwipeExecutor;
  const perf = new NoOpPerformanceTracker();

  beforeEach(() => {
    fakeAccessibilityDetector = new FakeAccessibilityDetector();
    fakeGestureExecutor = new FakeGestureExecutor();
    fakeTimer = new FakeTimer();
    fakeTimer.enableAutoAdvance();
    fakeCtrlProxy = new FakeCtrlProxy();
    executor = makeExecutor(
      ANDROID_DEVICE,
      fakeGestureExecutor,
      fakeCtrlProxy,
      fakeAccessibilityDetector,
      fakeTimer
    );
  });

  describe("platform detection", () => {
    test("uses standard swipe for iOS regardless of TalkBack state", async () => {
      fakeAccessibilityDetector.setTalkBackEnabled(true);

      const iosExecutor = makeExecutor(
        IOS_DEVICE,
        fakeGestureExecutor,
        fakeCtrlProxy,
        fakeAccessibilityDetector,
        fakeTimer
      );

      await iosExecutor.executeSwipeGesture(
        100, 500, 100, 200,
        "up" as SwipeDirection,
        null,
        { duration: 300 },
        perf
      );

      expect(fakeGestureExecutor.getSwipeCalls()).toHaveLength(1);
      expect(fakeCtrlProxy.getActionHistory()).toHaveLength(0);
      expect(fakeCtrlProxy.getTwoFingerSwipeHistory()).toHaveLength(0);
    });
  });

  describe("when TalkBack is disabled (android)", () => {
    beforeEach(() => {
      fakeAccessibilityDetector.setTalkBackEnabled(false);
    });

    test("dispatches to standard swipe method", async () => {
      await executor.executeSwipeGesture(
        100, 500, 100, 200,
        "up" as SwipeDirection,
        null,
        { duration: 300 },
        perf
      );

      expect(fakeGestureExecutor.getSwipeCalls()).toHaveLength(1);
      expect(fakeCtrlProxy.getActionHistory()).toHaveLength(0);
      expect(fakeCtrlProxy.getTwoFingerSwipeHistory()).toHaveLength(0);
    });

    test("uses standard swipe for all directions", async () => {
      const directions: SwipeDirection[] = ["up", "down", "left", "right"];

      for (const direction of directions) {
        fakeGestureExecutor.getSwipeCalls().length = 0;

        const fresh = makeExecutor(
          ANDROID_DEVICE,
          fakeGestureExecutor,
          fakeCtrlProxy,
          fakeAccessibilityDetector,
          fakeTimer
        );

        await fresh.executeSwipeGesture(
          100, 500, 100, 200,
          direction,
          null,
          { duration: 300 },
          perf
        );

        expect(fakeCtrlProxy.getActionHistory()).toHaveLength(0);
        expect(fakeCtrlProxy.getTwoFingerSwipeHistory()).toHaveLength(0);
      }
    });
  });

  describe("when TalkBack is enabled (android)", () => {
    beforeEach(() => {
      fakeAccessibilityDetector.setTalkBackEnabled(true);
    });

    test("dispatches to accessibility-aware swipe method when container has resource-id", async () => {
      const containerElement = {
        "bounds": { left: 0, top: 100, right: 400, bottom: 800 },
        "resource-id": "test:id/scrollView",
        "scrollable": true
      } as any;

      await executor.executeSwipeGesture(
        100, 500, 100, 200,
        "up" as SwipeDirection,
        containerElement,
        { duration: 300 },
        perf
      );

      // Should use accessibility action (not standard gesture swipe)
      expect(fakeGestureExecutor.getSwipeCalls()).toHaveLength(0);
      // Should have called requestAction for scroll
      expect(fakeCtrlProxy.getActionHistory()).toHaveLength(1);
    });

    test("does not use standard gesture swipe when TalkBack is enabled", async () => {
      await executor.executeSwipeGesture(
        100, 500, 100, 200,
        "up" as SwipeDirection,
        null,
        { duration: 300 },
        perf
      );

      expect(fakeGestureExecutor.getSwipeCalls()).toHaveLength(0);
    });

    test("uses two-finger swipe when no container provided", async () => {
      await executor.executeSwipeGesture(
        100, 500, 100, 200,
        "up" as SwipeDirection,
        null,
        { duration: 300 },
        perf
      );

      expect(fakeCtrlProxy.getActionHistory()).toHaveLength(0);
      expect(fakeCtrlProxy.getTwoFingerSwipeHistory()).toHaveLength(1);
    });

    test("uses accessibility method for all swipe directions", async () => {
      const directions: SwipeDirection[] = ["up", "down", "left", "right"];

      for (const direction of directions) {
        fakeCtrlProxy.clearHistory();
        const fresh = makeExecutor(
          ANDROID_DEVICE,
          fakeGestureExecutor,
          fakeCtrlProxy,
          fakeAccessibilityDetector,
          fakeTimer
        );

        await fresh.executeSwipeGesture(
          100, 500, 100, 200,
          direction,
          null,
          { duration: 300 },
          perf
        );

        expect(fakeGestureExecutor.getSwipeCalls()).toHaveLength(0);
      }
    });

    test("boomerang mode announces swipeable element instead of swiping", async () => {
      const containerElement = {
        "resource-id": "test:id/scrollView"
      } as any;

      await executor.executeSwipeGesture(
        100, 500, 100, 200,
        "up" as SwipeDirection,
        containerElement,
        { duration: 300 },
        perf,
        { apexPauseMs: 100, returnSpeed: 1 }
      );

      expect(fakeCtrlProxy.getActionHistory()).toHaveLength(1);
      expect(fakeCtrlProxy.getActionHistory()[0]).toMatchObject({
        action: "focus",
        resourceId: "test:id/scrollView",
        timeoutMs: 5000
      });
      expect(fakeGestureExecutor.getSwipeCalls()).toHaveLength(0);
      expect(fakeCtrlProxy.getTwoFingerSwipeHistory()).toHaveLength(0);
    });
  });

  describe("TalkBack state cache invalidation", () => {
    test("re-checks TalkBack state on subsequent swipes", async () => {
      // First swipe with TalkBack disabled
      fakeAccessibilityDetector.setTalkBackEnabled(false);
      await executor.executeSwipeGesture(
        100, 500, 100, 200,
        "up" as SwipeDirection,
        null,
        { duration: 300 },
        perf
      );
      expect(fakeGestureExecutor.getSwipeCalls()).toHaveLength(1);

      fakeCtrlProxy.clearHistory();

      // Enable TalkBack and invalidate cache
      fakeAccessibilityDetector.setTalkBackEnabled(true);
      fakeAccessibilityDetector.invalidateCache("emulator-5554");

      // Second swipe should use accessibility method (two-finger swipe since no container)
      await executor.executeSwipeGesture(
        100, 500, 100, 200,
        "up" as SwipeDirection,
        null,
        { duration: 300 },
        perf
      );

      expect(fakeCtrlProxy.getTwoFingerSwipeHistory()).toHaveLength(1);
      // Standard gesture swipe still only called once (from the first swipe above)
      expect(fakeGestureExecutor.getSwipeCalls()).toHaveLength(1);
    });
  });

  describe("executeAndroidSwipeWithAccessibility", () => {
    beforeEach(() => {
      fakeAccessibilityDetector.setTalkBackEnabled(true);
    });

    test("tries ACTION_SCROLL (scroll_forward) when container has resource-id and direction is down", async () => {
      const containerElement = {
        "bounds": { left: 0, top: 100, right: 400, bottom: 800 },
        "resource-id": "test:id/scrollView",
        "scrollable": true
      } as any;

      await executor.executeAndroidSwipeWithAccessibility(
        100, 500, 100, 200,
        "down" as SwipeDirection,
        containerElement,
        { duration: 300 },
        perf
      );

      expect(fakeCtrlProxy.getActionHistory()).toHaveLength(1);
      expect(fakeCtrlProxy.getActionHistory()[0]).toMatchObject({
        action: "scroll_forward",
        resourceId: "test:id/scrollView",
        timeoutMs: 5000
      });
      expect(fakeCtrlProxy.getTwoFingerSwipeHistory()).toHaveLength(0);
    });

    test("maps up direction to scroll_backward", async () => {
      const containerElement = {
        "resource-id": "test:id/scrollView"
      } as any;

      await executor.executeAndroidSwipeWithAccessibility(
        100, 500, 100, 700,
        "up" as SwipeDirection,
        containerElement,
        { duration: 300 },
        perf
      );

      expect(fakeCtrlProxy.getActionHistory()).toHaveLength(1);
      expect(fakeCtrlProxy.getActionHistory()[0]).toMatchObject({
        action: "scroll_backward",
        resourceId: "test:id/scrollView"
      });
    });

    test("maps right direction to scroll_forward", async () => {
      const containerElement = {
        "resource-id": "test:id/scrollView"
      } as any;

      await executor.executeAndroidSwipeWithAccessibility(
        100, 200, 300, 200,
        "right" as SwipeDirection,
        containerElement,
        { duration: 300 },
        perf
      );

      expect(fakeCtrlProxy.getActionHistory()[0]).toMatchObject({
        action: "scroll_forward"
      });
    });

    test("maps left direction to scroll_backward", async () => {
      const containerElement = {
        "resource-id": "test:id/scrollView"
      } as any;

      await executor.executeAndroidSwipeWithAccessibility(
        300, 200, 100, 200,
        "left" as SwipeDirection,
        containerElement,
        { duration: 300 },
        perf
      );

      expect(fakeCtrlProxy.getActionHistory()[0]).toMatchObject({
        action: "scroll_backward"
      });
    });

    test("falls back to two-finger swipe when ACTION_SCROLL fails", async () => {
      fakeCtrlProxy.setActionResult({
        success: false,
        action: "scroll_backward",
        totalTimeMs: 100,
        error: "Scroll not supported"
      });

      const containerElement = {
        "resource-id": "test:id/scrollView"
      } as any;

      await executor.executeAndroidSwipeWithAccessibility(
        100, 500, 100, 200,
        "up" as SwipeDirection,
        containerElement,
        { duration: 300 },
        perf
      );

      expect(fakeCtrlProxy.getTwoFingerSwipeHistory()).toHaveLength(1);
      expect(fakeCtrlProxy.getTwoFingerSwipeHistory()[0]).toMatchObject({
        x1: 100,
        y1: 500,
        x2: 100,
        y2: 200,
        duration: 300,
        offset: 100,
        timeoutMs: 5000
      });
    });

    test("uses two-finger swipe when container has no resource-id", async () => {
      const containerElement = {
        "bounds": { left: 0, top: 100, right: 400, bottom: 800 },
        "scrollable": true
        // No resource-id
      } as any;

      await executor.executeAndroidSwipeWithAccessibility(
        100, 500, 100, 200,
        "up" as SwipeDirection,
        containerElement,
        { duration: 300 },
        perf
      );

      // Should not try ACTION_SCROLL
      expect(fakeCtrlProxy.getActionHistory()).toHaveLength(0);
      // Should use two-finger swipe
      expect(fakeCtrlProxy.getTwoFingerSwipeHistory()).toHaveLength(1);
    });

    test("uses two-finger swipe when no container provided", async () => {
      await executor.executeAndroidSwipeWithAccessibility(
        100, 500, 100, 200,
        "up" as SwipeDirection,
        null,
        { duration: 300 },
        perf
      );

      expect(fakeCtrlProxy.getActionHistory()).toHaveLength(0);
      expect(fakeCtrlProxy.getTwoFingerSwipeHistory()).toHaveLength(1);
    });
  });

  describe("executeBoomerangGesture", () => {
    test("calls swipe twice: forward then return", async () => {
      await executor.executeBoomerangGesture(
        100, 500, 100, 200,
        { duration: 300 },
        { apexPauseMs: 50, returnSpeed: 1 },
        perf
      );

      const calls = fakeGestureExecutor.getSwipeCalls();
      expect(calls).toHaveLength(2);
      // Forward swipe
      expect(calls[0]).toMatchObject({ x1: 100, y1: 500, x2: 100, y2: 200 });
      // Return swipe (reversed coordinates)
      expect(calls[1]).toMatchObject({ x1: 100, y1: 200, x2: 100, y2: 500 });
    });

    test("sleeps for apexPauseMs between forward and return swipe", async () => {
      await executor.executeBoomerangGesture(
        100, 500, 100, 200,
        { duration: 300 },
        { apexPauseMs: 150, returnSpeed: 1 },
        perf
      );

      expect(fakeTimer.wasSleepCalled(150)).toBe(true);
    });

    test("does not sleep when apexPauseMs is 0", async () => {
      await executor.executeBoomerangGesture(
        100, 500, 100, 200,
        { duration: 300 },
        { apexPauseMs: 0, returnSpeed: 1 },
        perf
      );

      expect(fakeTimer.getSleepCallCount()).toBe(0);
    });

    test("adjusts return duration based on returnSpeed", async () => {
      await executor.executeBoomerangGesture(
        100, 500, 100, 200,
        { duration: 300 },
        { apexPauseMs: 0, returnSpeed: 2 },
        perf
      );

      const calls = fakeGestureExecutor.getSwipeCalls();
      expect(calls).toHaveLength(2);
      // Return swipe duration = 300 / 2 = 150
      expect(calls[1].options?.duration).toBe(150);
    });
  });

  describe("resolveBoomerangConfig", () => {
    test("returns undefined when boomerang is false", () => {
      const result = executor.resolveBoomerangConfig({ boomerang: false });
      expect(result).toBeUndefined();
    });

    test("returns undefined when boomerang is not set", () => {
      const result = executor.resolveBoomerangConfig({});
      expect(result).toBeUndefined();
    });

    test("returns config with default apexPauseMs and returnSpeed when boomerang is true", () => {
      const result = executor.resolveBoomerangConfig({ boomerang: true });
      expect(result).toBeDefined();
      expect(result!.apexPauseMs).toBe(100);
      expect(result!.returnSpeed).toBe(1);
    });

    test("returns config with custom apexPause when provided", () => {
      const result = executor.resolveBoomerangConfig({ boomerang: true, apexPause: 250 });
      expect(result).toBeDefined();
      expect(result!.apexPauseMs).toBe(250);
    });

    test("returns config with custom returnSpeed when provided", () => {
      const result = executor.resolveBoomerangConfig({ boomerang: true, returnSpeed: 3 });
      expect(result).toBeDefined();
      expect(result!.returnSpeed).toBe(3);
    });
  });
});
