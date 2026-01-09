import type { AccessibilityDetector, AccessibilityService } from "../../src/utils/interfaces/AccessibilityDetector";
import type { AdbExecutor } from "../../src/utils/android-cmdline-tools/interfaces/AdbExecutor";
import type { FeatureFlagService } from "../../src/features/featureFlags/FeatureFlagService";

/**
 * Fake implementation of AccessibilityDetector for testing
 * Allows configuring detection results without real device interaction
 */
export class FakeAccessibilityDetector implements AccessibilityDetector {
  private detectionResults: Map<string, { enabled: boolean; service: AccessibilityService }> = new Map();
  private defaultResult: { enabled: boolean; service: AccessibilityService } = {
    enabled: false,
    service: "unknown",
  };
  private detectionCallCount = 0;
  private invalidatedDevices: string[] = [];

  /**
   * Configure the detection result for a specific device
   */
  setDetectionResult(deviceId: string, enabled: boolean, service: AccessibilityService = "talkback"): void {
    this.detectionResults.set(deviceId, { enabled, service });
  }

  /**
   * Configure the default detection result for all devices
   */
  setDefaultResult(enabled: boolean, service: AccessibilityService = "unknown"): void {
    this.defaultResult = { enabled, service };
  }

  /**
   * Get the number of times detection was called
   */
  getDetectionCallCount(): number {
    return this.detectionCallCount;
  }

  /**
   * Get the list of devices that had their cache invalidated
   */
  getInvalidatedDevices(): string[] {
    return [...this.invalidatedDevices];
  }

  /**
   * Reset fake state
   */
  reset(): void {
    this.detectionResults.clear();
    this.defaultResult = { enabled: false, service: "unknown" };
    this.detectionCallCount = 0;
    this.invalidatedDevices = [];
  }

  async isAccessibilityEnabled(
    deviceId: string,
    _adb: AdbExecutor,
    _featureFlags?: FeatureFlagService
  ): Promise<boolean> {
    this.detectionCallCount++;
    const result = this.detectionResults.get(deviceId) || this.defaultResult;
    return result.enabled;
  }

  async detectMethod(
    deviceId: string,
    _adb: AdbExecutor,
    _featureFlags?: FeatureFlagService
  ): Promise<AccessibilityService> {
    const result = this.detectionResults.get(deviceId) || this.defaultResult;
    return result.service;
  }

  invalidateCache(deviceId: string): void {
    this.invalidatedDevices.push(deviceId);
  }

  clearAllCache(): void {
    this.detectionResults.clear();
  }
}
