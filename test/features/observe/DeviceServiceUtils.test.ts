import { describe, expect, test } from "bun:test";
import {
  toGestureResult,
  toTextResult,
  toImeActionResult,
  toScreenshotResult,
  createGestureTimeoutResult,
  createTextTimeoutResult,
  createGestureNotConnectedResult,
  createTextNotConnectedResult,
  createScreenshotNotConnectedResult,
  waitWithRetry,
  isCacheValid,
  createCacheEntry,
  parseMessage,
  createMessage,
  DEFAULT_CONNECTION_OPTIONS,
  type PlatformGestureResult,
  type PlatformTextResult,
  type PlatformImeActionResult,
  type PlatformScreenshotResult,
  type CachedHierarchy,
} from "../../../src/features/observe/DeviceServiceUtils";
import { FakeTimer } from "../../fakes/FakeTimer";

describe("DeviceServiceUtils", () => {
  // ===========================================================================
  // Result Type Adapters
  // ===========================================================================

  describe("toGestureResult", () => {
    test("converts successful result with all fields", () => {
      const platformResult: PlatformGestureResult = {
        success: true,
        totalTimeMs: 150,
        gestureTimeMs: 100,
        error: undefined,
        perfTiming: [{ operation: "tap", durationMs: 50 }], // Android-style array
      };

      const result = toGestureResult(platformResult);

      expect(result).toEqual({
        success: true,
        totalTimeMs: 150,
        gestureTimeMs: 100,
        error: undefined,
      });
    });

    test("converts failed result with error", () => {
      const platformResult: PlatformGestureResult = {
        success: false,
        totalTimeMs: 5000,
        error: "Gesture failed: element not found",
        perfTiming: { start: 0, end: 5000 }, // iOS-style object
      };

      const result = toGestureResult(platformResult);

      expect(result).toEqual({
        success: false,
        totalTimeMs: 5000,
        gestureTimeMs: undefined,
        error: "Gesture failed: element not found",
      });
    });

    test("strips platform-specific perfTiming data", () => {
      const platformResult: PlatformGestureResult = {
        success: true,
        totalTimeMs: 200,
        gestureTimeMs: 150,
        perfTiming: { detailed: "platform-specific-data", timestamps: [1, 2, 3] },
      };

      const result = toGestureResult(platformResult);

      // Should not have perfTiming in the result
      expect(result).not.toHaveProperty("perfTiming");
      expect(Object.keys(result)).toEqual(["success", "totalTimeMs", "gestureTimeMs", "error"]);
    });
  });

  describe("toTextResult", () => {
    test("converts successful text result", () => {
      const platformResult: PlatformTextResult = {
        success: true,
        totalTimeMs: 50,
        perfTiming: { inputDelay: 10, render: 40 },
      };

      const result = toTextResult(platformResult);

      expect(result).toEqual({
        success: true,
        totalTimeMs: 50,
        error: undefined,
      });
    });

    test("converts failed text result with error", () => {
      const platformResult: PlatformTextResult = {
        success: false,
        totalTimeMs: 1000,
        error: "No focused text field",
      };

      const result = toTextResult(platformResult);

      expect(result).toEqual({
        success: false,
        totalTimeMs: 1000,
        error: "No focused text field",
      });
    });
  });

  describe("toImeActionResult", () => {
    test("converts successful IME action result", () => {
      const platformResult: PlatformImeActionResult = {
        success: true,
        action: "done",
        totalTimeMs: 30,
        perfTiming: [{ stage: "dispatch", ms: 30 }],
      };

      const result = toImeActionResult(platformResult);

      expect(result).toEqual({
        success: true,
        totalTimeMs: 30,
        action: "done",
        error: undefined,
      });
    });

    test("converts failed IME action result", () => {
      const platformResult: PlatformImeActionResult = {
        success: false,
        action: "search",
        totalTimeMs: 100,
        error: "IME not available",
      };

      const result = toImeActionResult(platformResult);

      expect(result).toEqual({
        success: false,
        totalTimeMs: 100,
        action: "search",
        error: "IME not available",
      });
    });
  });

  describe("toScreenshotResult", () => {
    test("converts successful screenshot result with all fields", () => {
      const platformResult: PlatformScreenshotResult = {
        success: true,
        data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        format: "png",
        timestamp: 1706630400000,
        width: 1080,
        height: 2400,
      };

      const result = toScreenshotResult(platformResult);

      expect(result).toEqual({
        success: true,
        data: platformResult.data,
        format: "png",
        width: 1080,
        height: 2400,
        timestamp: 1706630400000,
        error: undefined,
      });
    });

    test("converts failed screenshot result", () => {
      const platformResult: PlatformScreenshotResult = {
        success: false,
        error: "Screen capture permission denied",
      };

      const result = toScreenshotResult(platformResult);

      expect(result).toEqual({
        success: false,
        data: undefined,
        format: undefined,
        width: undefined,
        height: undefined,
        timestamp: undefined,
        error: "Screen capture permission denied",
      });
    });
  });

  // ===========================================================================
  // Error Result Factories
  // ===========================================================================

  describe("createGestureTimeoutResult", () => {
    test("creates timeout result with operation type and timeout", () => {
      const result = createGestureTimeoutResult("swipe", 5000);

      expect(result).toEqual({
        success: false,
        totalTimeMs: 5000,
        error: "swipe timed out after 5000ms",
      });
    });
  });

  describe("createTextTimeoutResult", () => {
    test("creates timeout result with operation type and timeout", () => {
      const result = createTextTimeoutResult("setText", 3000);

      expect(result).toEqual({
        success: false,
        totalTimeMs: 3000,
        error: "setText timed out after 3000ms",
      });
    });
  });

  describe("createGestureNotConnectedResult", () => {
    test("creates not connected error result", () => {
      const result = createGestureNotConnectedResult();

      expect(result).toEqual({
        success: false,
        totalTimeMs: 0,
        error: "Not connected",
      });
    });
  });

  describe("createTextNotConnectedResult", () => {
    test("creates not connected error result", () => {
      const result = createTextNotConnectedResult();

      expect(result).toEqual({
        success: false,
        totalTimeMs: 0,
        error: "Not connected",
      });
    });
  });

  describe("createScreenshotNotConnectedResult", () => {
    test("creates not connected error result", () => {
      const result = createScreenshotNotConnectedResult();

      expect(result).toEqual({
        success: false,
        error: "Not connected",
      });
    });
  });

  // ===========================================================================
  // Connection Utilities
  // ===========================================================================

  describe("DEFAULT_CONNECTION_OPTIONS", () => {
    test("has reasonable default values", () => {
      expect(DEFAULT_CONNECTION_OPTIONS.maxAttempts).toBe(3);
      expect(DEFAULT_CONNECTION_OPTIONS.delayMs).toBe(1000);
      expect(DEFAULT_CONNECTION_OPTIONS.timeoutMs).toBe(5000);
    });
  });

  describe("waitWithRetry", () => {
    test("returns true immediately if condition is met", async () => {
      const fakeTimer = new FakeTimer();
      let callCount = 0;

      const result = await waitWithRetry(
        () => {
          callCount++;
          return true;
        },
        { maxAttempts: 3, delayMs: 1000 },
        fakeTimer
      );

      expect(result).toBe(true);
      expect(callCount).toBe(1);
    });

    test("retries until condition is met", async () => {
      const fakeTimer = new FakeTimer();
      let callCount = 0;

      const promise = waitWithRetry(
        () => {
          callCount++;
          return callCount >= 3;
        },
        { maxAttempts: 5, delayMs: 100 },
        fakeTimer
      );

      // Advance time for first retry delay
      await fakeTimer.advanceTime(100);
      // Advance time for second retry delay
      await fakeTimer.advanceTime(100);

      const result = await promise;

      expect(result).toBe(true);
      expect(callCount).toBe(3);
    });

    test("returns false if all attempts fail", async () => {
      const fakeTimer = new FakeTimer();
      let callCount = 0;

      const promise = waitWithRetry(
        () => {
          callCount++;
          return false;
        },
        { maxAttempts: 3, delayMs: 100 },
        fakeTimer
      );

      // Advance time for all delays
      await fakeTimer.advanceTime(100);
      await fakeTimer.advanceTime(100);

      const result = await promise;

      expect(result).toBe(false);
      expect(callCount).toBe(3);
    });

    test("supports async condition function", async () => {
      const fakeTimer = new FakeTimer();
      let callCount = 0;

      const result = await waitWithRetry(
        async () => {
          callCount++;
          return callCount >= 2;
        },
        { maxAttempts: 3, delayMs: 100 },
        fakeTimer
      );

      // Advance time for delay between first and second attempt
      await fakeTimer.advanceTime(100);

      expect(result).toBe(true);
    });
  });

  // ===========================================================================
  // Cache Utilities
  // ===========================================================================

  describe("isCacheValid", () => {
    test("returns false for null cache", () => {
      const result = isCacheValid(null, 1000, Date.now());
      expect(result).toBe(false);
    });

    test("returns true for fresh cache within max age", () => {
      const cache: CachedHierarchy<string> = {
        hierarchy: "test",
        receivedAt: 1000,
        fresh: true,
      };

      const result = isCacheValid(cache, 500, 1400);
      expect(result).toBe(true);
    });

    test("returns false for stale cache beyond max age", () => {
      const cache: CachedHierarchy<string> = {
        hierarchy: "test",
        receivedAt: 1000,
        fresh: true,
      };

      const result = isCacheValid(cache, 500, 1600);
      expect(result).toBe(false);
    });

    test("returns true at exact max age boundary", () => {
      const cache: CachedHierarchy<string> = {
        hierarchy: "test",
        receivedAt: 1000,
        fresh: true,
      };

      // currentTime - receivedAt = 500, which is not < 500
      const result = isCacheValid(cache, 500, 1500);
      expect(result).toBe(false);
    });
  });

  describe("createCacheEntry", () => {
    test("creates cache entry with fresh flag", () => {
      const hierarchy = { nodes: [1, 2, 3] };
      const timestamp = 1706630400000;

      const entry = createCacheEntry(hierarchy, timestamp);

      expect(entry).toEqual({
        hierarchy: { nodes: [1, 2, 3] },
        receivedAt: timestamp,
        fresh: true,
      });
    });

    test("preserves hierarchy reference", () => {
      const hierarchy = { nodes: [1, 2, 3] };
      const entry = createCacheEntry(hierarchy, 1000);

      expect(entry.hierarchy).toBe(hierarchy);
    });
  });

  // ===========================================================================
  // Message Parsing Utilities
  // ===========================================================================

  describe("parseMessage", () => {
    test("parses valid JSON string", () => {
      const data = '{"type":"response","success":true}';
      const result = parseMessage<{ type: string; success: boolean }>(data);

      expect(result).toEqual({ type: "response", success: true });
    });

    test("parses Buffer input", () => {
      const data = Buffer.from('{"type":"response","id":123}');
      const result = parseMessage<{ type: string; id: number }>(data);

      expect(result).toEqual({ type: "response", id: 123 });
    });

    test("returns null for invalid JSON", () => {
      const data = "not valid json";
      const result = parseMessage(data);

      expect(result).toBeNull();
    });

    test("returns null for empty string", () => {
      const result = parseMessage("");
      expect(result).toBeNull();
    });
  });

  describe("createMessage", () => {
    test("creates message with type and requestId", () => {
      const message = createMessage("request_swipe", "swipe-123");

      expect(JSON.parse(message)).toEqual({
        type: "request_swipe",
        requestId: "swipe-123",
      });
    });

    test("creates message with additional params", () => {
      const message = createMessage("request_tap", "tap-456", {
        x: 100,
        y: 200,
        duration: 50,
      });

      expect(JSON.parse(message)).toEqual({
        type: "request_tap",
        requestId: "tap-456",
        x: 100,
        y: 200,
        duration: 50,
      });
    });

    test("params override type and requestId if provided", () => {
      // This tests the spread behavior - additional params with same keys would override
      const message = createMessage("original_type", "original-id", {
        type: "overridden_type",
        requestId: "overridden-id",
      });

      const parsed = JSON.parse(message);
      // Due to spread order, params should override
      expect(parsed.type).toBe("overridden_type");
      expect(parsed.requestId).toBe("overridden-id");
    });
  });
});
