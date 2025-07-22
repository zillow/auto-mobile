import { logger } from "./logger";

export type DevicePlatform = "android" | "ios";

/**
 * Device detection utility to determine platform based on device ID
 */
export class DeviceDetection {
  /**
   * Detect device platform based on device ID patterns
   * @param deviceId - The device identifier
   * @returns The detected platform
   */
  static detectPlatform(deviceId: string): DevicePlatform {
    if (!deviceId) {
      logger.warn("[DeviceDetection] Empty device ID provided, defaulting to Android");
      return "android";
    }

    // iOS device patterns (UUIDs from idb/iOS Simulator)
    // iOS devices typically use UUIDs like: 569C0F94-5D53-40D2-AF8F-F4AA5BAA7D5E
    // iOS simulators also use similar UUID patterns
    const iosPattern = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;

    // Android device patterns
    // Emulators: emulator-5554, emulator-5556, etc.
    // Physical devices: various patterns like serial numbers
    const androidEmulatorPattern = /^emulator-\d+$/;

    // Check for iOS UUID pattern first
    if (iosPattern.test(deviceId)) {
      logger.info(`[DeviceDetection] Detected iOS device: ${deviceId}`);
      return "ios";
    }

    // Check for Android emulator pattern
    if (androidEmulatorPattern.test(deviceId)) {
      logger.info(`[DeviceDetection] Detected Android emulator: ${deviceId}`);
      return "android";
    }

    // For other patterns, we'll need additional logic or default to Android
    // Android physical devices can have various ID formats
    // Most non-UUID device IDs are likely Android
    logger.info(`[DeviceDetection] Device ID pattern suggests Android device: ${deviceId}`);
    return "android";
  }

  /**
   * Check if a device ID represents an iOS device
   * @param deviceId - The device identifier
   * @returns True if iOS device
   */
  static isiOSDevice(deviceId: string): boolean {
    return DeviceDetection.detectPlatform(deviceId) === "ios";
  }

  /**
   * Check if a device ID represents an Android device
   * @param deviceId - The device identifier
   * @returns True if Android device
   */
  static isAndroidDevice(deviceId: string): boolean {
    return DeviceDetection.detectPlatform(deviceId) === "android";
  }
}
