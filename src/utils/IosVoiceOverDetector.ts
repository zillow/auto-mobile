import { logger } from "./logger";
import type { IosVoiceOverDetector as IIosVoiceOverDetector } from "./interfaces/IosVoiceOverDetector";
import { SystemTimer, type Timer } from "./SystemTimer";
import type { CtrlProxyService } from "../features/observe/ios/CtrlProxyClient";
import type { FeatureFlagService } from "../features/featureFlags/FeatureFlagService";
import { TTLCache } from "./cache/Cache";

/**
 * DefaultIosVoiceOverDetector handles detection of VoiceOver on iOS devices
 * via CtrlProxy WebSocket, with caching to minimize performance impact.
 *
 * Design: As per docs/design-docs/mcp/a11y/talkback-voiceover.md Phase 1
 * - Queries UIAccessibility.isVoiceOverRunning via CtrlProxy WebSocket
 * - Caches results with 60-second TTL
 * - Supports feature flag overrides for testing
 * - Accepts Timer dependency for testability
 */
export class DefaultIosVoiceOverDetector implements IIosVoiceOverDetector {
  private readonly DEFAULT_TTL_MS = 60000; // 60 seconds as per design doc
  private readonly cache: TTLCache<string, boolean>;
  private readonly timer: Timer;

  constructor(timer: Timer = new SystemTimer()) {
    this.timer = timer;
    this.cache = new TTLCache(timer, { ttlMs: this.DEFAULT_TTL_MS });
  }

  /**
   * Check if VoiceOver is enabled on the device
   *
   * @param deviceId - The device identifier (for caching)
   * @param client - CtrlProxy service for executing the detection command
   * @param featureFlags - Feature flag service for override support
   * @returns Promise resolving to true if VoiceOver is enabled
   */
  async isVoiceOverEnabled(
    deviceId: string,
    client: CtrlProxyService,
    featureFlags?: FeatureFlagService
  ): Promise<boolean> {
    // Check feature flag override first
    if (featureFlags?.isEnabled("force-accessibility-mode")) {
      logger.debug(`[IosVoiceOverDetector] Force-enabled via feature flag for device ${deviceId}`);
      return true;
    }

    // Check if auto-detection is disabled
    if (featureFlags && !featureFlags.isEnabled("accessibility-auto-detect")) {
      logger.debug(`[IosVoiceOverDetector] Auto-detection disabled via feature flag for device ${deviceId}`);
      return false;
    }

    // Check cache
    const cached = this.cache.get(deviceId);
    if (cached !== undefined) {
      logger.debug(`[IosVoiceOverDetector] Using cached result for device ${deviceId}: enabled=${cached}`);
      return cached;
    }

    // Detect current state
    logger.debug(`[IosVoiceOverDetector] Detecting VoiceOver state for device ${deviceId}`);
    const startTime = this.timer.now();
    const detected = await this.detectVoiceOverState(deviceId, client);
    const detectionTime = this.timer.now() - startTime;

    if (detectionTime > 50) {
      logger.warn(
        `[IosVoiceOverDetector] Detection took ${detectionTime}ms (target: <50ms) for device ${deviceId}`
      );
    } else {
      logger.debug(`[IosVoiceOverDetector] Detection completed in ${detectionTime}ms for device ${deviceId}`);
    }

    // Only cache on successful detection — don't persist transient connection failures
    if (detected !== null) {
      this.cache.set(deviceId, detected);
    }
    return detected ?? false;
  }

  /**
   * Invalidate the cache for a specific device
   * Should be called after programmatically enabling/disabling VoiceOver
   *
   * @param deviceId - The device identifier to invalidate cache for
   */
  invalidateCache(deviceId: string): void {
    logger.debug(`[IosVoiceOverDetector] Invalidating cache for device ${deviceId}`);
    this.cache.delete(deviceId);
  }

  /**
   * Clear all cached entries (primarily for testing)
   */
  clearAllCache(): void {
    logger.debug(`[IosVoiceOverDetector] Clearing all cached entries`);
    this.cache.clear();
  }

  /**
   * Returns the detected VoiceOver state, or null if detection could not be
   * completed (connection failure, timeout, or error response from CtrlProxy).
   * Null results are not cached so the next call will retry.
   */
  private async detectVoiceOverState(deviceId: string, client: CtrlProxyService): Promise<boolean | null> {
    try {
      const result = await client.requestVoiceOverState();
      if (!result.success) {
        logger.warn(`[IosVoiceOverDetector] VoiceOver detection failed for ${deviceId}: ${result.error}`);
        return null;
      }
      logger.debug(`[IosVoiceOverDetector] VoiceOver state for device ${deviceId}: enabled=${result.enabled}`);
      return result.enabled;
    } catch (error) {
      logger.error(`[IosVoiceOverDetector] Failed to detect VoiceOver state for device ${deviceId}:`, error);
      return null;
    }
  }
}

/**
 * Singleton instance for iOS VoiceOver detection
 */
export const iosVoiceOverDetector = new DefaultIosVoiceOverDetector();
