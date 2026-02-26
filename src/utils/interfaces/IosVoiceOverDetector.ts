import type { FeatureFlagService } from "../../features/featureFlags/FeatureFlagService";
import type { CtrlProxyService } from "../../features/observe/ios/CtrlProxyClient";

/**
 * Interface for iOS VoiceOver detection
 * Detects and caches VoiceOver state on iOS devices via CtrlProxy
 */
export interface IosVoiceOverDetector {
  /**
   * Check if VoiceOver is enabled on the device
   *
   * @param deviceId - The device identifier (for caching)
   * @param client - CtrlProxy service for executing the detection command
   * @param featureFlags - Feature flag service for override support (optional)
   * @returns Promise resolving to true if VoiceOver is enabled
   */
  isVoiceOverEnabled(
    deviceId: string,
    client: CtrlProxyService,
    featureFlags?: FeatureFlagService
  ): Promise<boolean>;

  /**
   * Invalidate the cache for a specific device
   * Should be called after programmatically enabling/disabling VoiceOver
   *
   * @param deviceId - The device identifier to invalidate cache for
   */
  invalidateCache(deviceId: string): void;

  /**
   * Clear all cached entries (primarily for testing)
   */
  clearAllCache(): void;
}
