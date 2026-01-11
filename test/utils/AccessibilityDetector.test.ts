import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DefaultAccessibilityDetector } from "../../src/utils/AccessibilityDetector";
import { FeatureFlagService } from "../../src/features/featureFlags/FeatureFlagService";
import { FakeTimer } from "../fakes/FakeTimer";
import type { ExecResult, BootedDevice, AndroidUser } from "../../src/models";
import type { AdbExecutor } from "../../src/utils/android-cmdline-tools/interfaces/AdbExecutor";

/**
 * Fake ADB executor for testing
 */
class FakeAdbExecutor implements AdbExecutor {
  private responses: Map<string, string> = new Map();
  private callCount = 0;
  private shouldError = false;

  setResponse(output: string): void {
    this.responses.set("default", output);
  }

  setError(): void {
    this.shouldError = true;
  }

  async executeCommand(_command: string): Promise<ExecResult> {
    this.callCount++;

    if (this.shouldError) {
      throw new Error("ADB error");
    }

    const output = this.responses.get("default") || "null";
    return {
      stdout: output,
      stderr: "",
      exitCode: 0,
    };
  }

  async getBootedAndroidDevices(): Promise<BootedDevice[]> {
    return [];
  }

  async isScreenOn(): Promise<boolean> {
    return true;
  }

  async getWakefulness(): Promise<"Awake" | "Asleep" | "Dozing" | null> {
    return "Awake";
  }

  async listUsers(): Promise<AndroidUser[]> {
    return [];
  }

  async getForegroundApp(): Promise<{ packageName: string; userId: number } | null> {
    return null;
  }

  getCallCount(): number {
    return this.callCount;
  }

  reset(): void {
    this.responses.clear();
    this.callCount = 0;
    this.shouldError = false;
  }
}

/**
 * Fake feature flag service for testing
 */
class FakeFeatureFlagService {
  private flags: Map<string, boolean> = new Map();

  setFlag(key: string, value: boolean): void {
    this.flags.set(key, value);
  }

  isEnabled(key: string): boolean {
    return this.flags.get(key) ?? true;
  }

  reset(): void {
    this.flags.clear();
  }
}

describe("AccessibilityDetector - Unit Tests", () => {
  let detector: DefaultAccessibilityDetector;
  let fakeAdb: FakeAdbExecutor;
  let fakeFeatureFlags: FakeFeatureFlagService;
  let fakeTimer: FakeTimer;

  beforeEach(() => {
    fakeTimer = new FakeTimer();
    fakeTimer.setManualMode();
    detector = new DefaultAccessibilityDetector(fakeTimer);
    fakeAdb = new FakeAdbExecutor();
    fakeFeatureFlags = new FakeFeatureFlagService();

    // Clear cache before each test
    detector.clearAllCache();
  });

  afterEach(() => {
    detector.clearAllCache();
    fakeAdb.reset();
    fakeFeatureFlags.reset();
  });

  describe("TalkBack Detection", () => {
    test("detects TalkBack when com.google.android.marvin.talkback is present", async () => {
      fakeAdb.setResponse("com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService");

      const enabled = await detector.isAccessibilityEnabled("device123", fakeAdb);
      expect(enabled).toBe(true);

      const service = await detector.detectMethod("device123", fakeAdb);
      expect(service).toBe("talkback");
    });

    test("detects TalkBack when TalkBackService is present", async () => {
      fakeAdb.setResponse("com.android.talkback/TalkBackService");

      const enabled = await detector.isAccessibilityEnabled("device123", fakeAdb);
      expect(enabled).toBe(true);

      const service = await detector.detectMethod("device123", fakeAdb);
      expect(service).toBe("talkback");
    });

    test("returns false when no accessibility services are enabled", async () => {
      fakeAdb.setResponse("null");

      const enabled = await detector.isAccessibilityEnabled("device123", fakeAdb);
      expect(enabled).toBe(false);

      const service = await detector.detectMethod("device123", fakeAdb);
      expect(service).toBe("unknown");
    });

    test("detects unknown accessibility service", async () => {
      fakeAdb.setResponse("com.example.customservice/CustomAccessibilityService");

      const enabled = await detector.isAccessibilityEnabled("device123", fakeAdb);
      expect(enabled).toBe(true);

      const service = await detector.detectMethod("device123", fakeAdb);
      expect(service).toBe("unknown");
    });
  });

  describe("Caching Behavior", () => {
    test("caches detection result for 60 seconds", async () => {
      fakeAdb.setResponse("com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService");

      // First call
      await detector.isAccessibilityEnabled("device123", fakeAdb);
      expect(fakeAdb.getCallCount()).toBe(1);

      // Second call within TTL (should use cache)
      await detector.isAccessibilityEnabled("device123", fakeAdb);
      expect(fakeAdb.getCallCount()).toBe(1); // Still 1, not called again

      // Third call (should still use cache)
      const service = await detector.detectMethod("device123", fakeAdb);
      expect(service).toBe("talkback");
      expect(fakeAdb.getCallCount()).toBe(1); // Still 1
    });

    test("cache expires after TTL using FakeTimer", async () => {
      // Create detector with manual mode timer for time-based testing
      const manualTimer = new FakeTimer();
      manualTimer.setManualMode();
      const timedDetector = new DefaultAccessibilityDetector(manualTimer);

      fakeAdb.setResponse("com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService");

      // First call
      await timedDetector.isAccessibilityEnabled("device123", fakeAdb);
      expect(fakeAdb.getCallCount()).toBe(1);

      // Advance time by 61 seconds (past TTL)
      manualTimer.advanceTime(61000);

      // Second call after TTL (should call ADB again)
      await timedDetector.isAccessibilityEnabled("device123", fakeAdb);
      expect(fakeAdb.getCallCount()).toBe(2);
    });

    test("cache does not expire within TTL using FakeTimer", async () => {
      // Create detector with manual mode timer for time-based testing
      const manualTimer = new FakeTimer();
      manualTimer.setManualMode();
      const timedDetector = new DefaultAccessibilityDetector(manualTimer);

      fakeAdb.setResponse("com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService");

      // First call
      await timedDetector.isAccessibilityEnabled("device123", fakeAdb);
      expect(fakeAdb.getCallCount()).toBe(1);

      // Advance time by 59 seconds (within TTL)
      manualTimer.advanceTime(59000);

      // Second call within TTL (should use cache)
      await timedDetector.isAccessibilityEnabled("device123", fakeAdb);
      expect(fakeAdb.getCallCount()).toBe(1); // Still cached
    });

    test("invalidateCache clears cache for specific device", async () => {
      fakeAdb.setResponse("com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService");

      // First call
      await detector.isAccessibilityEnabled("device123", fakeAdb);
      expect(fakeAdb.getCallCount()).toBe(1);

      // Invalidate cache
      detector.invalidateCache("device123");

      // Second call after invalidation (should call ADB again)
      await detector.isAccessibilityEnabled("device123", fakeAdb);
      expect(fakeAdb.getCallCount()).toBe(2);
    });

    test("maintains separate cache per device", async () => {
      // Create two separate ADB executors for two devices
      const fakeAdb1 = new FakeAdbExecutor();
      const fakeAdb2 = new FakeAdbExecutor();

      fakeAdb1.setResponse("com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService");
      fakeAdb2.setResponse("null");

      // Device 1: TalkBack enabled
      const enabled1 = await detector.isAccessibilityEnabled("device1", fakeAdb1);
      expect(enabled1).toBe(true);
      expect(fakeAdb1.getCallCount()).toBe(1);

      // Device 2: TalkBack disabled
      const enabled2 = await detector.isAccessibilityEnabled("device2", fakeAdb2);
      expect(enabled2).toBe(false);
      expect(fakeAdb2.getCallCount()).toBe(1);

      // Second calls should use cache (no additional ADB calls)
      await detector.isAccessibilityEnabled("device1", fakeAdb1);
      await detector.isAccessibilityEnabled("device2", fakeAdb2);
      expect(fakeAdb1.getCallCount()).toBe(1); // Still 1
      expect(fakeAdb2.getCallCount()).toBe(1); // Still 1
    });
  });

  describe("Feature Flag Overrides", () => {
    test("force-accessibility-mode override returns true", async () => {
      fakeFeatureFlags.setFlag("force-accessibility-mode", true);
      fakeFeatureFlags.setFlag("accessibility-auto-detect", true);

      // Should return true without calling ADB
      const enabled = await detector.isAccessibilityEnabled(
        "device123",
        fakeAdb as unknown as AdbClient,
        fakeFeatureFlags as unknown as FeatureFlagService
      );
      expect(enabled).toBe(true);
      expect(fakeAdb.getCallCount()).toBe(0);

      const service = await detector.detectMethod(
        "device123",
        fakeAdb as unknown as AdbClient,
        fakeFeatureFlags as unknown as FeatureFlagService
      );
      expect(service).toBe("talkback");
    });

    test("accessibility-auto-detect disabled returns false", async () => {
      fakeFeatureFlags.setFlag("force-accessibility-mode", false);
      fakeFeatureFlags.setFlag("accessibility-auto-detect", false);

      // Should return false without calling ADB
      const enabled = await detector.isAccessibilityEnabled(
        "device123",
        fakeAdb as unknown as AdbClient,
        fakeFeatureFlags as unknown as FeatureFlagService
      );
      expect(enabled).toBe(false);
      expect(fakeAdb.getCallCount()).toBe(0);

      const service = await detector.detectMethod(
        "device123",
        fakeAdb as unknown as AdbClient,
        fakeFeatureFlags as unknown as FeatureFlagService
      );
      expect(service).toBe("unknown");
    });

    test("force flag takes precedence over cache", async () => {
      // First call without force flag - cache TalkBack disabled
      fakeAdb.setResponse("null");
      fakeFeatureFlags.setFlag("force-accessibility-mode", false);
      fakeFeatureFlags.setFlag("accessibility-auto-detect", true);

      const enabled1 = await detector.isAccessibilityEnabled(
        "device123",
        fakeAdb as unknown as AdbClient,
        fakeFeatureFlags as unknown as FeatureFlagService
      );
      expect(enabled1).toBe(false);
      expect(fakeAdb.getCallCount()).toBe(1);

      // Second call with force-enabled - should override cache and return true without ADB call
      fakeFeatureFlags.setFlag("force-accessibility-mode", true);

      const enabled2 = await detector.isAccessibilityEnabled(
        "device123",
        fakeAdb as unknown as AdbClient,
        fakeFeatureFlags as unknown as FeatureFlagService
      );
      expect(enabled2).toBe(true);
      // Should not call ADB again because force flag overrides
      expect(fakeAdb.getCallCount()).toBe(1);
    });
  });

  describe("Error Handling", () => {
    test("gracefully handles ADB errors", async () => {
      fakeAdb.setError();

      // Should return false on error, not throw
      const enabled = await detector.isAccessibilityEnabled("error", fakeAdb);
      expect(enabled).toBe(false);

      const service = await detector.detectMethod("error", fakeAdb);
      expect(service).toBe("unknown");
    });

    test("handles empty ADB output", async () => {
      fakeAdb.setResponse("");

      const enabled = await detector.isAccessibilityEnabled("device123", fakeAdb);
      expect(enabled).toBe(false);

      const service = await detector.detectMethod("device123", fakeAdb);
      expect(service).toBe("unknown");
    });
  });

  describe("Performance with FakeTimer", () => {
    test("detection timing is tracked correctly", async () => {
      fakeAdb.setResponse("com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService");

      const startTime = fakeTimer.now();
      await detector.isAccessibilityEnabled("device123", fakeAdb);
      const endTime = fakeTimer.now();

      // FakeTimer tracks time correctly
      expect(endTime).toBeGreaterThanOrEqual(startTime);
    });

    test("cached detection uses no additional time", async () => {
      fakeAdb.setResponse("com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService");

      // First call to populate cache
      await detector.isAccessibilityEnabled("device123", fakeAdb);

      // Second call should use cache (no time advancement needed)
      const startTime = fakeTimer.now();
      await detector.isAccessibilityEnabled("device123", fakeAdb);
      const endTime = fakeTimer.now();

      // Time should not advance for cached result
      expect(endTime).toBe(startTime);
    });
  });
});
