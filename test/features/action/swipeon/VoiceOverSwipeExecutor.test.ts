import { beforeEach, describe, expect, test } from "bun:test";
import { VoiceOverSwipeExecutor } from "../../../../src/features/action/swipeon/VoiceOverSwipeExecutor";
import { FakeIosVoiceOverDetector } from "../../../fakes/FakeIosVoiceOverDetector";
import { FakeIOSCtrlProxy } from "../../../fakes/FakeIOSCtrlProxy";
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

function makeFakeGestureExecutor(): { executor: GestureExecutor; calls: Array<{ x1: number; y1: number; x2: number; y2: number }> } {
  const calls: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  const executor: GestureExecutor = {
    swipe: async (x1, y1, x2, y2, options, perf) => {
      calls.push({ x1, y1, x2, y2 });
      return makeSwipeResult({ x1, y1, x2, y2, duration: options?.duration ?? 300 });
    },
  };
  return { executor, calls };
}

describe("VoiceOverSwipeExecutor", () => {
  let fakeVoiceOverDetector: FakeIosVoiceOverDetector;
  let fakeIosClient: FakeIOSCtrlProxy;
  let perf: NoOpPerformanceTracker;

  beforeEach(() => {
    fakeVoiceOverDetector = new FakeIosVoiceOverDetector();
    fakeIosClient = new FakeIOSCtrlProxy();
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
        fakeVoiceOverDetector
      );

      const result = await voiceOverExecutor.executeSwipeGesture(100, 500, 100, 200, { duration: 300 }, perf);

      expect(result.success).toBe(true);
      expect(calls).toHaveLength(1);
      expect(fakeIosClient.getMultiFingerSwipeHistory()).toHaveLength(0);
      // VoiceOver detector should not be queried for non-iOS
      expect(fakeVoiceOverDetector.getCallCount()).toBe(0);
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
        fakeVoiceOverDetector
      );

      const result = await voiceOverExecutor.executeSwipeGesture(100, 500, 100, 200, { duration: 300 }, perf);

      expect(result.success).toBe(true);
      expect(calls).toHaveLength(1);
      expect(fakeIosClient.getMultiFingerSwipeHistory()).toHaveLength(0);
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
        fakeVoiceOverDetector
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
        fakeVoiceOverDetector
      );

      const result = await voiceOverExecutor.executeSwipeGesture(100, 500, 100, 200, { duration: 300 }, perf);

      expect(result.success).toBe(true);
      // Should fall back to standard swipe
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({ x1: 100, y1: 500, x2: 100, y2: 200 });
    });

    test("falls back to standard swipe when requestMultiFingerSwipe throws", async () => {
      const { executor, calls } = makeFakeGestureExecutor();
      fakeVoiceOverDetector.setVoiceOverEnabled(true);
      fakeIosClient.setFailureMode("multiFingerSwipe", new Error("Connection lost"));

      const voiceOverExecutor = new VoiceOverSwipeExecutor(
        { platform: "ios", id: "00001234-ABCD" } as any,
        executor,
        fakeIosClient as any,
        fakeVoiceOverDetector
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
        fakeVoiceOverDetector
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
        fakeVoiceOverDetector
      );

      await voiceOverExecutor.executeSwipeGesture(100, 500, 100, 200, undefined, perf);

      const swipeHistory = fakeIosClient.getMultiFingerSwipeHistory();
      expect(swipeHistory[0].duration).toBe(300);
    });
  });
});
