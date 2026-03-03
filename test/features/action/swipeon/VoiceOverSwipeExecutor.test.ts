import { beforeEach, describe, expect, test } from "bun:test";
import { VoiceOverSwipeExecutor } from "../../../../src/features/action/swipeon/VoiceOverSwipeExecutor";
import { FakeIosVoiceOverDetector } from "../../../fakes/FakeIosVoiceOverDetector";
import { FakeIOSCtrlProxy } from "../../../fakes/FakeIOSCtrlProxy";
import { FakeTimer } from "../../../fakes/FakeTimer";
import { NoOpPerformanceTracker } from "../../../../src/utils/PerformanceTracker";
import type { GestureExecutor } from "../../../../src/features/action/swipeon/types";
import type { SwipeResult } from "../../../../src/models/SwipeResult";

function makeSwipeResult(overrides: Partial<SwipeResult> = {}): SwipeResult {
  return {
    success: true,
    x1: 100,
    y1: 500,
    x2: 100,
    y2: 200,
    duration: 300,
    ...overrides,
  };
}

function makeFakeGestureExecutor(): { executor: GestureExecutor; calls: Array<{ x1: number; y1: number; x2: number; y2: number; options?: { duration?: number } }> } {
  const calls: Array<{ x1: number; y1: number; x2: number; y2: number; options?: { duration?: number } }> = [];
  const executor: GestureExecutor = {
    swipe: async (x1, y1, x2, y2, options, perf) => {
      calls.push({ x1, y1, x2, y2, options });
      return makeSwipeResult({ x1, y1, x2, y2, duration: options?.duration ?? 300 });
    },
  };
  return { executor, calls };
}

describe("VoiceOverSwipeExecutor", () => {
  let fakeVoiceOverDetector: FakeIosVoiceOverDetector;
  let fakeIosClient: FakeIOSCtrlProxy;
  let fakeTimer: FakeTimer;
  let perf: NoOpPerformanceTracker;

  beforeEach(() => {
    fakeVoiceOverDetector = new FakeIosVoiceOverDetector();
    fakeIosClient = new FakeIOSCtrlProxy();
    fakeTimer = new FakeTimer();
    fakeTimer.enableAutoAdvance();
    perf = new NoOpPerformanceTracker();
  });

  describe("non-iOS platforms", () => {
    test("uses standard swipe on Android regardless of VoiceOver state", async () => {
      const { executor, calls } = makeFakeGestureExecutor();
      fakeVoiceOverDetector.setVoiceOverEnabled(true);

      const voiceOverExecutor = new VoiceOverSwipeExecutor(
        { platform: "android", id: "emulator-5554" } as any,
        executor,
        fakeIosClient as any,
        fakeVoiceOverDetector,
        fakeTimer
      );

      const result = await voiceOverExecutor.executeSwipeGesture(100, 500, 100, 200, { duration: 300 }, perf);

      expect(result.success).toBe(true);
      expect(calls).toHaveLength(1);
      expect(fakeIosClient.getMultiFingerSwipeHistory()).toHaveLength(0);
      // VoiceOver detector should not be queried for non-iOS
      expect(fakeVoiceOverDetector.getCallCount()).toBe(0);
    });

    test("uses boomerang swipe on Android (standard swipe × 2)", async () => {
      const { executor, calls } = makeFakeGestureExecutor();
      fakeVoiceOverDetector.setVoiceOverEnabled(true);

      const voiceOverExecutor = new VoiceOverSwipeExecutor(
        { platform: "android", id: "emulator-5554" } as any,
        executor,
        fakeIosClient as any,
        fakeVoiceOverDetector,
        fakeTimer
      );

      const result = await voiceOverExecutor.executeSwipeGesture(
        100, 500, 100, 200,
        { duration: 300 },
        perf,
        { apexPauseMs: 50, returnSpeed: 1 }
      );

      expect(result.success).toBe(true);
      expect(calls).toHaveLength(2);
      expect(calls[0]).toMatchObject({ x1: 100, y1: 500, x2: 100, y2: 200 });
      expect(calls[1]).toMatchObject({ x1: 100, y1: 200, x2: 100, y2: 500 });
      expect(fakeIosClient.getMultiFingerSwipeHistory()).toHaveLength(0);
    });
  });

  describe("iOS platform with VoiceOver disabled", () => {
    test("uses standard single-finger swipe", async () => {
      const { executor, calls } = makeFakeGestureExecutor();
      fakeVoiceOverDetector.setVoiceOverEnabled(false);

      const voiceOverExecutor = new VoiceOverSwipeExecutor(
        { platform: "ios", id: "00001234-ABCD" } as any,
        executor,
        fakeIosClient as any,
        fakeVoiceOverDetector,
        fakeTimer
      );

      const result = await voiceOverExecutor.executeSwipeGesture(100, 500, 100, 200, { duration: 300 }, perf);

      expect(result.success).toBe(true);
      expect(calls).toHaveLength(1);
      expect(fakeIosClient.getMultiFingerSwipeHistory()).toHaveLength(0);
    });

    test("uses boomerang with standard swipes when VoiceOver disabled", async () => {
      const { executor, calls } = makeFakeGestureExecutor();
      fakeVoiceOverDetector.setVoiceOverEnabled(false);

      const voiceOverExecutor = new VoiceOverSwipeExecutor(
        { platform: "ios", id: "00001234-ABCD" } as any,
        executor,
        fakeIosClient as any,
        fakeVoiceOverDetector,
        fakeTimer
      );

      const result = await voiceOverExecutor.executeSwipeGesture(
        100, 500, 100, 200,
        { duration: 300 },
        perf,
        { apexPauseMs: 100, returnSpeed: 1 }
      );

      expect(result.success).toBe(true);
      expect(calls).toHaveLength(2);
      expect(calls[0]).toMatchObject({ x1: 100, y1: 500, x2: 100, y2: 200 });
      expect(calls[1]).toMatchObject({ x1: 100, y1: 200, x2: 100, y2: 500 });
      expect(fakeIosClient.getMultiFingerSwipeHistory()).toHaveLength(0);
    });

    test("sleeps for apexPauseMs between forward and return swipe (VoiceOver disabled)", async () => {
      const { executor } = makeFakeGestureExecutor();
      fakeVoiceOverDetector.setVoiceOverEnabled(false);
      // Use non-auto-advance to verify sleep
      const controlledTimer = new FakeTimer();
      controlledTimer.enableAutoAdvance();

      const voiceOverExecutor = new VoiceOverSwipeExecutor(
        { platform: "ios", id: "00001234-ABCD" } as any,
        executor,
        fakeIosClient as any,
        fakeVoiceOverDetector,
        controlledTimer
      );

      await voiceOverExecutor.executeSwipeGesture(
        100, 500, 100, 200,
        { duration: 300 },
        perf,
        { apexPauseMs: 150, returnSpeed: 1 }
      );

      expect(controlledTimer.wasSleepCalled(150)).toBe(true);
    });

    test("does not sleep when apexPauseMs is 0 (VoiceOver disabled)", async () => {
      const { executor } = makeFakeGestureExecutor();
      fakeVoiceOverDetector.setVoiceOverEnabled(false);

      const voiceOverExecutor = new VoiceOverSwipeExecutor(
        { platform: "ios", id: "00001234-ABCD" } as any,
        executor,
        fakeIosClient as any,
        fakeVoiceOverDetector,
        fakeTimer
      );

      await voiceOverExecutor.executeSwipeGesture(
        100, 500, 100, 200,
        { duration: 300 },
        perf,
        { apexPauseMs: 0, returnSpeed: 1 }
      );

      expect(fakeTimer.getSleepCallCount()).toBe(0);
    });

    test("adjusts return duration by returnSpeed (VoiceOver disabled)", async () => {
      const { executor, calls } = makeFakeGestureExecutor();
      fakeVoiceOverDetector.setVoiceOverEnabled(false);

      const voiceOverExecutor = new VoiceOverSwipeExecutor(
        { platform: "ios", id: "00001234-ABCD" } as any,
        executor,
        fakeIosClient as any,
        fakeVoiceOverDetector,
        fakeTimer
      );

      await voiceOverExecutor.executeSwipeGesture(
        100, 500, 100, 200,
        { duration: 300 },
        perf,
        { apexPauseMs: 0, returnSpeed: 2 }
      );

      expect(calls).toHaveLength(2);
      // Return duration = 300 / 2 = 150
      expect(calls[1].options?.duration).toBe(150);
    });
  });

  describe("iOS platform with VoiceOver enabled", () => {
    test("uses 3-finger swipe via iosClient", async () => {
      const { executor, calls } = makeFakeGestureExecutor();
      fakeVoiceOverDetector.setVoiceOverEnabled(true);

      const voiceOverExecutor = new VoiceOverSwipeExecutor(
        { platform: "ios", id: "00001234-ABCD" } as any,
        executor,
        fakeIosClient as any,
        fakeVoiceOverDetector,
        fakeTimer
      );

      const result = await voiceOverExecutor.executeSwipeGesture(100, 500, 100, 200, { duration: 300 }, perf);

      expect(result.success).toBe(true);
      // Standard swipe should NOT be called
      expect(calls).toHaveLength(0);
      // Multi-finger swipe should be called
      const swipeHistory = fakeIosClient.getMultiFingerSwipeHistory();
      expect(swipeHistory).toHaveLength(1);
      expect(swipeHistory[0].fingerCount).toBe(3);
      expect(swipeHistory[0].x1).toBe(100);
      expect(swipeHistory[0].y1).toBe(500);
      expect(swipeHistory[0].x2).toBe(100);
      expect(swipeHistory[0].y2).toBe(200);
      expect(swipeHistory[0].duration).toBe(300);
    });

    test("falls back to standard swipe when requestMultiFingerSwipe fails", async () => {
      const { executor, calls } = makeFakeGestureExecutor();
      fakeVoiceOverDetector.setVoiceOverEnabled(true);
      fakeIosClient.setMultiFingerSwipeResult({ success: false, error: "Multi-finger swipe not supported", totalTimeMs: 0 });

      const voiceOverExecutor = new VoiceOverSwipeExecutor(
        { platform: "ios", id: "00001234-ABCD" } as any,
        executor,
        fakeIosClient as any,
        fakeVoiceOverDetector,
        fakeTimer
      );

      const result = await voiceOverExecutor.executeSwipeGesture(100, 500, 100, 200, { duration: 300 }, perf);

      expect(result.success).toBe(true);
      // Should fall back to standard swipe
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({ x1: 100, y1: 500, x2: 100, y2: 200, options: { duration: 300 } });
    });

    test("falls back to standard swipe when requestMultiFingerSwipe throws", async () => {
      const { executor, calls } = makeFakeGestureExecutor();
      fakeVoiceOverDetector.setVoiceOverEnabled(true);
      fakeIosClient.setFailureMode("multiFingerSwipe", new Error("Connection lost"));

      const voiceOverExecutor = new VoiceOverSwipeExecutor(
        { platform: "ios", id: "00001234-ABCD" } as any,
        executor,
        fakeIosClient as any,
        fakeVoiceOverDetector,
        fakeTimer
      );

      const result = await voiceOverExecutor.executeSwipeGesture(100, 500, 100, 200, { duration: 300 }, perf);

      expect(result.success).toBe(true);
      // Should fall back to standard swipe
      expect(calls).toHaveLength(1);
    });

    test("passes gesture duration from options to multi-finger swipe", async () => {
      const { executor } = makeFakeGestureExecutor();
      fakeVoiceOverDetector.setVoiceOverEnabled(true);

      const voiceOverExecutor = new VoiceOverSwipeExecutor(
        { platform: "ios", id: "00001234-ABCD" } as any,
        executor,
        fakeIosClient as any,
        fakeVoiceOverDetector,
        fakeTimer
      );

      await voiceOverExecutor.executeSwipeGesture(100, 500, 100, 200, { duration: 600 }, perf);

      const swipeHistory = fakeIosClient.getMultiFingerSwipeHistory();
      expect(swipeHistory[0].duration).toBe(600);
    });

    test("uses default 300ms duration when gestureOptions has no duration", async () => {
      const { executor } = makeFakeGestureExecutor();
      fakeVoiceOverDetector.setVoiceOverEnabled(true);

      const voiceOverExecutor = new VoiceOverSwipeExecutor(
        { platform: "ios", id: "00001234-ABCD" } as any,
        executor,
        fakeIosClient as any,
        fakeVoiceOverDetector,
        fakeTimer
      );

      await voiceOverExecutor.executeSwipeGesture(100, 500, 100, 200, undefined, perf);

      const swipeHistory = fakeIosClient.getMultiFingerSwipeHistory();
      expect(swipeHistory[0].duration).toBe(300);
    });

    test("boomerang: uses two 3-finger swipes (forward then return)", async () => {
      const { executor, calls } = makeFakeGestureExecutor();
      fakeVoiceOverDetector.setVoiceOverEnabled(true);

      const voiceOverExecutor = new VoiceOverSwipeExecutor(
        { platform: "ios", id: "00001234-ABCD" } as any,
        executor,
        fakeIosClient as any,
        fakeVoiceOverDetector,
        fakeTimer
      );

      const result = await voiceOverExecutor.executeSwipeGesture(
        100, 500, 100, 200,
        { duration: 300 },
        perf,
        { apexPauseMs: 0, returnSpeed: 1 }
      );

      expect(result.success).toBe(true);
      // Standard swipe must NOT be called
      expect(calls).toHaveLength(0);
      // Should have two 3-finger swipes
      const swipeHistory = fakeIosClient.getMultiFingerSwipeHistory();
      expect(swipeHistory).toHaveLength(2);
      expect(swipeHistory[0]).toMatchObject({ x1: 100, y1: 500, x2: 100, y2: 200, fingerCount: 3 });
      expect(swipeHistory[1]).toMatchObject({ x1: 100, y1: 200, x2: 100, y2: 500, fingerCount: 3 });
    });

    test("boomerang: sleeps for apexPauseMs between forward and return swipe", async () => {
      const { executor } = makeFakeGestureExecutor();
      fakeVoiceOverDetector.setVoiceOverEnabled(true);
      const controlledTimer = new FakeTimer();
      controlledTimer.enableAutoAdvance();

      const voiceOverExecutor = new VoiceOverSwipeExecutor(
        { platform: "ios", id: "00001234-ABCD" } as any,
        executor,
        fakeIosClient as any,
        fakeVoiceOverDetector,
        controlledTimer
      );

      await voiceOverExecutor.executeSwipeGesture(
        100, 500, 100, 200,
        { duration: 300 },
        perf,
        { apexPauseMs: 150, returnSpeed: 1 }
      );

      expect(controlledTimer.wasSleepCalled(150)).toBe(true);
    });

    test("boomerang: does not sleep when apexPauseMs is 0", async () => {
      const { executor } = makeFakeGestureExecutor();
      fakeVoiceOverDetector.setVoiceOverEnabled(true);

      const voiceOverExecutor = new VoiceOverSwipeExecutor(
        { platform: "ios", id: "00001234-ABCD" } as any,
        executor,
        fakeIosClient as any,
        fakeVoiceOverDetector,
        fakeTimer
      );

      await voiceOverExecutor.executeSwipeGesture(
        100, 500, 100, 200,
        { duration: 300 },
        perf,
        { apexPauseMs: 0, returnSpeed: 1 }
      );

      expect(fakeTimer.getSleepCallCount()).toBe(0);
    });

    test("boomerang: adjusts return duration by returnSpeed", async () => {
      const { executor } = makeFakeGestureExecutor();
      fakeVoiceOverDetector.setVoiceOverEnabled(true);

      const voiceOverExecutor = new VoiceOverSwipeExecutor(
        { platform: "ios", id: "00001234-ABCD" } as any,
        executor,
        fakeIosClient as any,
        fakeVoiceOverDetector,
        fakeTimer
      );

      await voiceOverExecutor.executeSwipeGesture(
        100, 500, 100, 200,
        { duration: 300 },
        perf,
        { apexPauseMs: 0, returnSpeed: 2 }
      );

      const swipeHistory = fakeIosClient.getMultiFingerSwipeHistory();
      expect(swipeHistory).toHaveLength(2);
      // Forward: 300ms, Return: 300 / 2 = 150ms
      expect(swipeHistory[0].duration).toBe(300);
      expect(swipeHistory[1].duration).toBe(150);
    });

    test("boomerang: falls back to standard boomerang when forward 3-finger swipe returns failure", async () => {
      const { executor, calls } = makeFakeGestureExecutor();
      fakeVoiceOverDetector.setVoiceOverEnabled(true);
      fakeIosClient.setMultiFingerSwipeResult({ success: false, error: "Gesture failed", totalTimeMs: 0 });

      const voiceOverExecutor = new VoiceOverSwipeExecutor(
        { platform: "ios", id: "00001234-ABCD" } as any,
        executor,
        fakeIosClient as any,
        fakeVoiceOverDetector,
        fakeTimer
      );

      const result = await voiceOverExecutor.executeSwipeGesture(
        100, 500, 100, 200,
        { duration: 300 },
        perf,
        { apexPauseMs: 0, returnSpeed: 1 }
      );

      // Falls back to standard boomerang (2 standard swipe calls)
      expect(result.success).toBe(true);
      expect(calls).toHaveLength(2);
      expect(calls[0]).toMatchObject({ x1: 100, y1: 500, x2: 100, y2: 200 });
      expect(calls[1]).toMatchObject({ x1: 100, y1: 200, x2: 100, y2: 500 });
      // Only one 3-finger attempt before fallback
      expect(fakeIosClient.getMultiFingerSwipeHistory()).toHaveLength(1);
    });

    test("boomerang: falls back to standard boomerang when forward 3-finger swipe throws", async () => {
      const { executor, calls } = makeFakeGestureExecutor();
      fakeVoiceOverDetector.setVoiceOverEnabled(true);
      fakeIosClient.setFailureMode("multiFingerSwipe", new Error("Transport error"));

      const voiceOverExecutor = new VoiceOverSwipeExecutor(
        { platform: "ios", id: "00001234-ABCD" } as any,
        executor,
        fakeIosClient as any,
        fakeVoiceOverDetector,
        fakeTimer
      );

      const result = await voiceOverExecutor.executeSwipeGesture(
        100, 500, 100, 200,
        { duration: 300 },
        perf,
        { apexPauseMs: 0, returnSpeed: 1 }
      );

      // Falls back to standard boomerang
      expect(result.success).toBe(true);
      expect(calls).toHaveLength(2);
    });

    test("boomerang: returns failure when return 3-finger swipe throws (forward already completed)", async () => {
      const { executor } = makeFakeGestureExecutor();
      fakeVoiceOverDetector.setVoiceOverEnabled(true);

      // Forward succeeds, then throw on the return stroke
      let callCount = 0;
      const originalMethod = fakeIosClient.requestMultiFingerSwipe.bind(fakeIosClient);
      fakeIosClient.requestMultiFingerSwipe = async (...args: Parameters<typeof originalMethod>) => {
        callCount++;
        if (callCount === 2) {
          throw new Error("Return stroke transport error");
        }
        return originalMethod(...args);
      };

      const voiceOverExecutor = new VoiceOverSwipeExecutor(
        { platform: "ios", id: "00001234-ABCD" } as any,
        executor,
        fakeIosClient as any,
        fakeVoiceOverDetector,
        fakeTimer
      );

      const result = await voiceOverExecutor.executeSwipeGesture(
        100, 500, 100, 200,
        { duration: 300 },
        perf,
        { apexPauseMs: 0, returnSpeed: 1 }
      );

      expect(result.success).toBe(false);
      expect(callCount).toBe(2);
    });

    test("boomerang: total duration includes forward + apex + return", async () => {
      const { executor } = makeFakeGestureExecutor();
      fakeVoiceOverDetector.setVoiceOverEnabled(true);

      const voiceOverExecutor = new VoiceOverSwipeExecutor(
        { platform: "ios", id: "00001234-ABCD" } as any,
        executor,
        fakeIosClient as any,
        fakeVoiceOverDetector,
        fakeTimer
      );

      const result = await voiceOverExecutor.executeSwipeGesture(
        100, 500, 100, 200,
        { duration: 300 },
        perf,
        { apexPauseMs: 100, returnSpeed: 2 }
      );

      // forward=300, apex=100, return=150 → total=550
      expect(result.duration).toBe(550);
    });
  });
});
