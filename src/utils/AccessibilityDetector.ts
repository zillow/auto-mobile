import { logger } from "./logger";
import { FeatureFlagService } from "../features/featureFlags/FeatureFlagService";
import type { AccessibilityDetector as IAccessibilityDetector, AccessibilityService } from "./interfaces/AccessibilityDetector";
import { SystemTimer, type Timer } from "./SystemTimer";
import type { AdbExecutor } from "./android-cmdline-tools/interfaces/AdbExecutor";
import { TTLCache } from "./cache/Cache";


/**
 * Cached accessibility state value
 */
interface AccessibilityCacheValue {
  enabled: boolean;
  service: AccessibilityService;
}

/**
 * DefaultAccessibilityDetector handles detection of accessibility services (TalkBack)
 * with caching to minimize performance impact.
 *
 * Design: As per docs/design-docs/mcp/talkback-voiceover.md Phase 1
 * - Uses ADB shell command for detection (preferred method)
 * - Caches results with 60-second TTL
 * - Supports feature flag overrides for testing
 * - Accepts Timer dependency for testability
 */
export class DefaultAccessibilityDetector implements IAccessibilityDetector {
  private readonly DEFAULT_TTL_MS = 60000; // 60 seconds as per design doc
  private readonly cache: TTLCache<string, AccessibilityCacheValue>;
  private readonly timer: Timer;

  constructor(timer: Timer = new SystemTimer()) {
    this.timer = timer;
    this.cache = new TTLCache(timer, { ttlMs: this.DEFAULT_TTL_MS });
  }

  /**
   * Check if accessibility services are enabled on the device
   *
   * @param deviceId - The device identifier (for caching)
   * @param adb - ADB executor for executing shell commands
   * @param featureFlags - Feature flag service for override support
   * @returns Promise resolving to true if accessibility is enabled
   */
  async isAccessibilityEnabled(
    deviceId: string,
    adb: AdbExecutor,
    featureFlags?: FeatureFlagService
  ): Promise<boolean> {
    // Check feature flag override first
    const forceEnabled = featureFlags?.isEnabled("force-accessibility-mode");
    if (forceEnabled) {
      logger.debug(`[AccessibilityDetector] Force-enabled via feature flag for device ${deviceId}`);
      return true;
    }

    // Check if auto-detection is disabled
    const autoDetectDisabled = featureFlags && !featureFlags.isEnabled("accessibility-auto-detect");
    if (autoDetectDisabled) {
      logger.debug(`[AccessibilityDetector] Auto-detection disabled via feature flag for device ${deviceId}`);
      return false;
    }

    // Check cache
    const cached = this.cache.get(deviceId);

    if (cached) {
      logger.debug(
        `[AccessibilityDetector] Using cached result for device ${deviceId}: enabled=${cached.enabled}, service=${cached.service}`
      );
      return cached.enabled;
    }

    // Detect current state
    logger.debug(`[AccessibilityDetector] Detecting accessibility state for device ${deviceId}`);
    const startTime = this.timer.now();
    const { enabled, service } = await this.detectAccessibilityState(deviceId, adb);
    const detectionTime = this.timer.now() - startTime;

    if (detectionTime > 50) {
      logger.warn(
        `[AccessibilityDetector] Detection took ${detectionTime}ms (target: <50ms) for device ${deviceId}`
      );
    } else {
      logger.debug(`[AccessibilityDetector] Detection completed in ${detectionTime}ms for device ${deviceId}`);
    }

    // Update cache
    this.cache.set(deviceId, { enabled, service });

    return enabled;
  }

  /**
   * Get the detected accessibility service type
   *
   * @param deviceId - The device identifier (for caching)
   * @param adb - ADB executor for executing shell commands
   * @param featureFlags - Feature flag service for override support
   * @returns Promise resolving to the detected service type
   */
  async detectMethod(
    deviceId: string,
    adb: AdbExecutor,
    featureFlags?: FeatureFlagService
  ): Promise<AccessibilityService> {
    // Check feature flag override
    const forceEnabled = featureFlags?.isEnabled("force-accessibility-mode");
    if (forceEnabled) {
      return "talkback";
    }

    // Check if auto-detection is disabled
    const autoDetectDisabled = featureFlags && !featureFlags.isEnabled("accessibility-auto-detect");
    if (autoDetectDisabled) {
      return "unknown";
    }

    // Check cache
    const cached = this.cache.get(deviceId);

    if (cached) {
      return cached.service;
    }

    // Detect current state
    const { enabled, service } = await this.detectAccessibilityState(deviceId, adb);
    // Update cache
    this.cache.set(deviceId, { enabled, service });
    return service;
  }

  /**
   * Invalidate the cache for a specific device
   * Should be called after programmatically enabling/disabling TalkBack
   *
   * @param deviceId - The device identifier to invalidate cache for
   */
  invalidateCache(deviceId: string): void {
    logger.debug(`[AccessibilityDetector] Invalidating cache for device ${deviceId}`);
    this.cache.delete(deviceId);
  }

  /**
   * Clear all cached entries (primarily for testing)
   */
  clearAllCache(): void {
    logger.debug(`[AccessibilityDetector] Clearing all cached entries`);
    this.cache.clear();
  }

  /**
   * Internal method to detect accessibility state using ADB
   * Method 1 from design doc: Query enabled_accessibility_services setting
   *
   * @param deviceId - The device identifier (for logging)
   * @param adb - ADB executor for executing shell commands
   * @returns Promise resolving to accessibility state
   */
  private async detectAccessibilityState(
    deviceId: string,
    adb: AdbExecutor
  ): Promise<{ enabled: boolean; service: AccessibilityService }> {
    try {
      // Query enabled accessibility services
      const result = await adb.executeCommand("shell settings get secure enabled_accessibility_services");

      const output = result.stdout.trim();

      // Check if TalkBack is in the enabled services
      const isTalkBackEnabled =
        output.includes("com.google.android.marvin.talkback") || output.includes("TalkBackService");

      if (isTalkBackEnabled) {
        logger.debug(`[AccessibilityDetector] TalkBack detected as enabled on device ${deviceId}`);
        return { enabled: true, service: "talkback" };
      }

      // Check if any accessibility service is enabled (but not TalkBack specifically)
      const isAnyServiceEnabled = output !== "null" && output.length > 0 && !output.includes("null");

      if (isAnyServiceEnabled) {
        logger.debug(
          `[AccessibilityDetector] Unknown accessibility service detected on device ${deviceId}: ${output}`
        );
        return { enabled: true, service: "unknown" };
      }

      logger.debug(`[AccessibilityDetector] No accessibility services enabled on device ${deviceId}`);
      return { enabled: false, service: "unknown" };
    } catch (error) {
      logger.error(`[AccessibilityDetector] Failed to detect accessibility state for device ${deviceId}:`, error);
      // Graceful fallback: assume disabled on error
      return { enabled: false, service: "unknown" };
    }
  }
}

/**
 * Singleton instance for accessibility detection
 */
export const accessibilityDetector = new DefaultAccessibilityDetector();
