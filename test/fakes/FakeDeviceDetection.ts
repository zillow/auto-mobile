/**
 * Fake device detection implementation for testing
 * Allows full control over platform detection results
 */
import { DeviceDetection, DevicePlatform } from "../../src/utils/DeviceDetection";

export class FakeDeviceDetection implements DeviceDetection {
  private platformMap: Map<string, DevicePlatform> = new Map();
  private defaultPlatform: DevicePlatform = "android";
  private detectionHistory: Array<{ deviceId: string; platform: DevicePlatform }> = [];

  /**
   * Detect device platform based on device ID patterns
   * @param deviceId - The device identifier
   * @returns The detected platform
   */
  detectPlatform(deviceId: string): DevicePlatform {
    const platform = this.platformMap.get(deviceId) ?? this.defaultPlatform;
    this.detectionHistory.push({ deviceId, platform });
    return platform;
  }

  /**
   * Check if a device ID represents an iOS device
   * @param deviceId - The device identifier
   * @returns True if iOS device
   */
  isiOSDevice(deviceId: string): boolean {
    return this.detectPlatform(deviceId) === "ios";
  }

  /**
   * Check if a device ID represents an Android device
   * @param deviceId - The device identifier
   * @returns True if Android device
   */
  isAndroidDevice(deviceId: string): boolean {
    return this.detectPlatform(deviceId) === "android";
  }

  // Configuration methods

  /**
   * Set the platform to return for a specific device ID
   */
  setPlatform(deviceId: string, platform: DevicePlatform): void {
    this.platformMap.set(deviceId, platform);
  }

  /**
   * Set the default platform to return for unknown device IDs
   */
  setDefaultPlatform(platform: DevicePlatform): void {
    this.defaultPlatform = platform;
  }

  /**
   * Mark a device ID as iOS
   */
  setAsIOSDevice(deviceId: string): void {
    this.setPlatform(deviceId, "ios");
  }

  /**
   * Mark a device ID as Android
   */
  setAsAndroidDevice(deviceId: string): void {
    this.setPlatform(deviceId, "android");
  }

  /**
   * Clear all configured platforms
   */
  clearPlatforms(): void {
    this.platformMap.clear();
  }

  /**
   * Reset default platform to Android
   */
  resetDefaultPlatform(): void {
    this.defaultPlatform = "android";
  }

  /**
   * Clear detection history
   */
  clearHistory(): void {
    this.detectionHistory = [];
  }

  /**
   * Get the detection history
   */
  getHistory(): Array<{ deviceId: string; platform: DevicePlatform }> {
    return [...this.detectionHistory];
  }

  /**
   * Get count of detections
   */
  getDetectionCount(): number {
    return this.detectionHistory.length;
  }

  /**
   * Get count of iOS detections
   */
  getIOSDetectionCount(): number {
    return this.detectionHistory.filter(h => h.platform === "ios").length;
  }

  /**
   * Get count of Android detections
   */
  getAndroidDetectionCount(): number {
    return this.detectionHistory.filter(h => h.platform === "android").length;
  }

  /**
   * Resets the fake to initial state
   */
  reset(): void {
    this.platformMap.clear();
    this.defaultPlatform = "android";
    this.detectionHistory = [];
  }
}
