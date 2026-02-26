import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DefaultIosVoiceOverDetector } from "../../src/utils/IosVoiceOverDetector";
import { FakeTimer } from "../fakes/FakeTimer";
import type { CtrlProxyService } from "../../src/features/observe/ios/CtrlProxyClient";
import type { CtrlProxyVoiceOverResult } from "../../src/features/observe/ios/types";
import type { FeatureFlagService } from "../../src/features/featureFlags/FeatureFlagService";

/**
 * Minimal fake CtrlProxyService for VoiceOver detection tests
 */
class FakeCtrlProxyService {
  voiceOverEnabled = false;
  shouldFail = false;
  callCount = 0;

  async requestVoiceOverState(): Promise<CtrlProxyVoiceOverResult> {
    this.callCount++;
    if (this.shouldFail) {
      return { success: false, enabled: false, error: "Fake service error" };
    }
    return { success: true, enabled: this.voiceOverEnabled };
  }

  reset(): void {
    this.voiceOverEnabled = false;
    this.shouldFail = false;
    this.callCount = 0;
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

describe("IosVoiceOverDetector - Unit Tests", () => {
  let detector: DefaultIosVoiceOverDetector;
  let fakeClient: FakeCtrlProxyService;
  let fakeFeatureFlags: FakeFeatureFlagService;
  let fakeTimer: FakeTimer;

  beforeEach(() => {
    fakeTimer = new FakeTimer();
    detector = new DefaultIosVoiceOverDetector(fakeTimer);
    fakeClient = new FakeCtrlProxyService();
    fakeFeatureFlags = new FakeFeatureFlagService();
    detector.clearAllCache();
  });

  afterEach(() => {
    detector.clearAllCache();
    fakeClient.reset();
    fakeFeatureFlags.reset();
  });

  describe("VoiceOver Detection", () => {
    test("returns true when VoiceOver is enabled", async () => {
      fakeClient.voiceOverEnabled = true;

      const enabled = await detector.isVoiceOverEnabled(
        "device123",
        fakeClient as unknown as CtrlProxyService
      );

      expect(enabled).toBe(true);
      expect(fakeClient.callCount).toBe(1);
    });

    test("returns false when VoiceOver is disabled", async () => {
      fakeClient.voiceOverEnabled = false;

      const enabled = await detector.isVoiceOverEnabled(
        "device123",
        fakeClient as unknown as CtrlProxyService
      );

      expect(enabled).toBe(false);
      expect(fakeClient.callCount).toBe(1);
    });

    test("returns false when CtrlProxy reports failure", async () => {
      fakeClient.shouldFail = true;

      const enabled = await detector.isVoiceOverEnabled(
        "device123",
        fakeClient as unknown as CtrlProxyService
      );

      expect(enabled).toBe(false);
    });

    test("returns false when CtrlProxy throws", async () => {
      const throwingClient = {
        async requestVoiceOverState(): Promise<CtrlProxyVoiceOverResult> {
          throw new Error("Connection refused");
        },
      };

      const enabled = await detector.isVoiceOverEnabled(
        "device123",
        throwingClient as unknown as CtrlProxyService
      );

      expect(enabled).toBe(false);
    });
  });

  describe("Caching Behavior", () => {
    test("caches detection result and avoids duplicate calls", async () => {
      fakeClient.voiceOverEnabled = true;

      // First call — hits CtrlProxy
      const first = await detector.isVoiceOverEnabled(
        "device123",
        fakeClient as unknown as CtrlProxyService
      );
      expect(first).toBe(true);
      expect(fakeClient.callCount).toBe(1);

      // Second call — uses cache
      const second = await detector.isVoiceOverEnabled(
        "device123",
        fakeClient as unknown as CtrlProxyService
      );
      expect(second).toBe(true);
      expect(fakeClient.callCount).toBe(1); // still 1
    });

    test("cache expires after TTL", async () => {
      fakeClient.voiceOverEnabled = true;

      await detector.isVoiceOverEnabled("device123", fakeClient as unknown as CtrlProxyService);
      expect(fakeClient.callCount).toBe(1);

      // Advance time past 60-second TTL
      fakeTimer.advanceTime(61000);

      await detector.isVoiceOverEnabled("device123", fakeClient as unknown as CtrlProxyService);
      expect(fakeClient.callCount).toBe(2);
    });

    test("cache does not expire before TTL", async () => {
      fakeClient.voiceOverEnabled = true;

      await detector.isVoiceOverEnabled("device123", fakeClient as unknown as CtrlProxyService);
      expect(fakeClient.callCount).toBe(1);

      // Advance time but stay within TTL
      fakeTimer.advanceTime(59000);

      await detector.isVoiceOverEnabled("device123", fakeClient as unknown as CtrlProxyService);
      expect(fakeClient.callCount).toBe(1); // still cached
    });

    test("invalidateCache forces a fresh detection", async () => {
      fakeClient.voiceOverEnabled = false;

      await detector.isVoiceOverEnabled("device123", fakeClient as unknown as CtrlProxyService);
      expect(fakeClient.callCount).toBe(1);

      detector.invalidateCache("device123");

      await detector.isVoiceOverEnabled("device123", fakeClient as unknown as CtrlProxyService);
      expect(fakeClient.callCount).toBe(2);
    });

    test("does not cache result when CtrlProxy reports failure", async () => {
      fakeClient.shouldFail = true;

      // First call — fails, should not cache
      await detector.isVoiceOverEnabled("device123", fakeClient as unknown as CtrlProxyService);
      expect(fakeClient.callCount).toBe(1);

      // Second call — should retry, not use a cached false
      await detector.isVoiceOverEnabled("device123", fakeClient as unknown as CtrlProxyService);
      expect(fakeClient.callCount).toBe(2);
    });

    test("does not cache result when CtrlProxy throws", async () => {
      let callCount = 0;
      const throwingClient = {
        async requestVoiceOverState(): Promise<CtrlProxyVoiceOverResult> {
          callCount++;
          throw new Error("Connection refused");
        },
      };

      // First call — throws, should not cache
      await detector.isVoiceOverEnabled("device123", throwingClient as unknown as CtrlProxyService);
      expect(callCount).toBe(1);

      // Second call — should retry, not use a cached false
      await detector.isVoiceOverEnabled("device123", throwingClient as unknown as CtrlProxyService);
      expect(callCount).toBe(2);
    });

    test("clearAllCache clears entries for all devices", async () => {
      const client2 = new FakeCtrlProxyService();

      await detector.isVoiceOverEnabled("device1", fakeClient as unknown as CtrlProxyService);
      await detector.isVoiceOverEnabled("device2", client2 as unknown as CtrlProxyService);
      expect(fakeClient.callCount).toBe(1);
      expect(client2.callCount).toBe(1);

      detector.clearAllCache();

      await detector.isVoiceOverEnabled("device1", fakeClient as unknown as CtrlProxyService);
      await detector.isVoiceOverEnabled("device2", client2 as unknown as CtrlProxyService);
      expect(fakeClient.callCount).toBe(2);
      expect(client2.callCount).toBe(2);
    });

    test("maintains separate cache per device", async () => {
      const client2 = new FakeCtrlProxyService();
      fakeClient.voiceOverEnabled = true;
      client2.voiceOverEnabled = false;

      const enabled1 = await detector.isVoiceOverEnabled("device1", fakeClient as unknown as CtrlProxyService);
      const enabled2 = await detector.isVoiceOverEnabled("device2", client2 as unknown as CtrlProxyService);

      expect(enabled1).toBe(true);
      expect(enabled2).toBe(false);

      // Second calls use cache
      await detector.isVoiceOverEnabled("device1", fakeClient as unknown as CtrlProxyService);
      await detector.isVoiceOverEnabled("device2", client2 as unknown as CtrlProxyService);
      expect(fakeClient.callCount).toBe(1);
      expect(client2.callCount).toBe(1);
    });
  });

  describe("Feature Flag Overrides", () => {
    test("force-accessibility-mode returns true without calling CtrlProxy", async () => {
      fakeFeatureFlags.setFlag("force-accessibility-mode", true);
      fakeClient.voiceOverEnabled = false;

      const enabled = await detector.isVoiceOverEnabled(
        "device123",
        fakeClient as unknown as CtrlProxyService,
        fakeFeatureFlags as unknown as FeatureFlagService
      );

      expect(enabled).toBe(true);
      expect(fakeClient.callCount).toBe(0);
    });

    test("accessibility-auto-detect disabled returns false without calling CtrlProxy", async () => {
      fakeFeatureFlags.setFlag("force-accessibility-mode", false);
      fakeFeatureFlags.setFlag("accessibility-auto-detect", false);
      fakeClient.voiceOverEnabled = true;

      const enabled = await detector.isVoiceOverEnabled(
        "device123",
        fakeClient as unknown as CtrlProxyService,
        fakeFeatureFlags as unknown as FeatureFlagService
      );

      expect(enabled).toBe(false);
      expect(fakeClient.callCount).toBe(0);
    });

    test("force-accessibility-mode takes precedence over cached false value", async () => {
      fakeFeatureFlags.setFlag("force-accessibility-mode", false);
      fakeFeatureFlags.setFlag("accessibility-auto-detect", true);
      fakeClient.voiceOverEnabled = false;

      // Populate cache with false
      const first = await detector.isVoiceOverEnabled(
        "device123",
        fakeClient as unknown as CtrlProxyService,
        fakeFeatureFlags as unknown as FeatureFlagService
      );
      expect(first).toBe(false);
      expect(fakeClient.callCount).toBe(1);

      // Enable force flag — should override cache
      fakeFeatureFlags.setFlag("force-accessibility-mode", true);
      const second = await detector.isVoiceOverEnabled(
        "device123",
        fakeClient as unknown as CtrlProxyService,
        fakeFeatureFlags as unknown as FeatureFlagService
      );
      expect(second).toBe(true);
      expect(fakeClient.callCount).toBe(1); // no additional CtrlProxy call
    });
  });
});
