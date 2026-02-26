import { AdbExecutor } from "../android-cmdline-tools/interfaces/AdbExecutor";
import { FeatureFlagService } from "../../features/featureFlags/FeatureFlagService";

/**
 * Type representing the detected accessibility service
 */
export type AccessibilityService = "talkback" | "voiceover" | "unknown";

/**
 * Interface for Android accessibility detection
 * Detects and caches TalkBack state on Android devices via ADB
 */
export interface AccessibilityDetector {
  /**
   * Check if accessibility services are enabled on the device
   *
   * @param deviceId - The device identifier (for caching)
   * @param adb - ADB executor for executing shell commands
   * @param featureFlags - Feature flag service for override support (optional)
   * @returns Promise resolving to true if accessibility is enabled
   */
  isAccessibilityEnabled(
    deviceId: string,
    adb: AdbExecutor,
    featureFlags?: FeatureFlagService
  ): Promise<boolean>;

  /**
   * Get the detected accessibility service type
   *
   * @param deviceId - The device identifier (for caching)
   * @param adb - ADB executor for executing shell commands
   * @param featureFlags - Feature flag service for override support (optional)
   * @returns Promise resolving to the detected service type
   */
  detectMethod(
    deviceId: string,
    adb: AdbExecutor,
    featureFlags?: FeatureFlagService
  ): Promise<AccessibilityService>;

  /**
   * Invalidate the cache for a specific device
   * Should be called after programmatically enabling/disabling TalkBack
   *
   * @param deviceId - The device identifier to invalidate cache for
   */
  invalidateCache(deviceId: string): void;

  /**
   * Clear all cached entries (primarily for testing)
   */
  clearAllCache(): void;
}
