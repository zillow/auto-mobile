import { logger } from "./logger";
import { DeviceDetection, DevicePlatform } from "./deviceDetection";

export interface AvailableDevice {
  deviceId: string;
  platform: DevicePlatform;
  type: "emulator" | "simulator" | "physical";
  name?: string;
  state: "online" | "offline" | "booted" | "shutdown";
}

export interface DeviceSelectionOptions {
  preferredPlatform?: DevicePlatform;
  preferredType?: "emulator" | "simulator" | "physical";
  autoSelect?: boolean;
}

/**
 * Device selection utility to help choose between multiple available devices
 * Terminology:
 * - Simulator: iOS Simulator (simulates iOS on macOS)
 * - Emulator: Android Emulator (emulates Android hardware/software)
 */
export class DeviceSelector {
  /**
   * Get all available devices across both platforms
   * @returns Promise with list of available devices
   */
  static async getAllAvailableDevices(): Promise<AvailableDevice[]> {
    const devices: AvailableDevice[] = [];
    
    try {
      // Get Android emulators
      const androidEmulators = await this.getAndroidEmulators();
      devices.push(...androidEmulators);
      
      // Get iOS simulators  
      const iOSSimulators = await this.getiOSSimulators();
      devices.push(...iOSSimulators);
      
    } catch (error) {
      logger.error(`[DeviceSelector] Error getting devices: ${error}`);
    }
    
    return devices;
  }
  
  /**
   * Select the best device based on options
   * @param options - Selection preferences
   * @returns Selected device or null if none available
   */
  static async selectDevice(options: DeviceSelectionOptions = {}): Promise<AvailableDevice | null> {
    const availableDevices = await this.getAllAvailableDevices();
    
    if (availableDevices.length === 0) {
      logger.warn("[DeviceSelector] No devices available");
      return null;
    }
    
    // Filter by preferred platform if specified
    let candidates = options.preferredPlatform
      ? availableDevices.filter(d => d.platform === options.preferredPlatform)
      : availableDevices;
    
    // Filter by preferred type if specified
    if (options.preferredType) {
      candidates = candidates.filter(d => d.type === options.preferredType);
    }
    
    // Filter to only running/booted devices
    candidates = candidates.filter(d => d.state === "online" || d.state === "booted");
    
    if (candidates.length === 0) {
      logger.warn("[DeviceSelector] No suitable devices found with given criteria");
      return null;
    }
    
    // Selection priority:
    // 1. Physical devices (more realistic testing)
    // 2. Simulators/Emulators
    // 3. If multiple of same type, prefer the first one
    
    const physicalDevices = candidates.filter(d => d.type === "physical");
    if (physicalDevices.length > 0) {
      logger.info(`[DeviceSelector] Selected physical device: ${physicalDevices[0].deviceId}`);
      return physicalDevices[0];
    }
    
    // No physical devices, use first available simulator/emulator
    const virtualDevice = candidates[0];
    const deviceType = virtualDevice.type === "simulator" ? "iOS Simulator" : "Android Emulator";
    logger.info(`[DeviceSelector] Selected ${deviceType}: ${virtualDevice.deviceId} (${virtualDevice.platform})`);
    return virtualDevice;
  }
  
  /**
   * Select iOS Simulator specifically
   * @returns Selected iOS simulator or null if none available
   */
  static async selectiOSSimulator(): Promise<AvailableDevice | null> {
    return await this.selectDevice({ 
      preferredPlatform: "ios", 
      preferredType: "simulator" 
    });
  }
  
  /**
   * Select Android Emulator specifically  
   * @returns Selected Android emulator or null if none available
   */
  static async selectAndroidEmulator(): Promise<AvailableDevice | null> {
    return await this.selectDevice({ 
      preferredPlatform: "android", 
      preferredType: "emulator" 
    });
  }
  
  /**
   * Interactive device selection - let user choose
   * @param availableDevices - List of available devices
   * @returns Selected device
   */
  static async interactiveSelection(availableDevices?: AvailableDevice[]): Promise<AvailableDevice | null> {
    const devices = availableDevices || await this.getAllAvailableDevices();
    
    if (devices.length === 0) {
      logger.warn("[DeviceSelector] No devices available for selection");
      return null;
    }
    
    if (devices.length === 1) {
      const device = devices[0];
      const deviceType = device.type === "simulator" ? "iOS Simulator" : 
                        device.type === "emulator" ? "Android Emulator" : "Physical Device";
      logger.info(`[DeviceSelector] Only one device available, auto-selecting: ${deviceType} ${device.deviceId}`);
      return device;
    }
    
    // In a real implementation, this could show a UI prompt
    // For now, we'll log the options and select the first suitable one
    logger.info("[DeviceSelector] Multiple devices available:");
    devices.forEach((device, index) => {
      const deviceType = device.type === "simulator" ? "iOS Simulator" : 
                        device.type === "emulator" ? "Android Emulator" : "Physical Device";
      logger.info(`  ${index + 1}. ${deviceType} - ${device.deviceId} (${device.state})`);
    });
    
    // Auto-select the first running device for now
    const runningDevice = devices.find(d => d.state === "online" || d.state === "booted");
    if (runningDevice) {
      const deviceType = runningDevice.type === "simulator" ? "iOS Simulator" : "Android Emulator";
      logger.info(`[DeviceSelector] Auto-selected first running device: ${deviceType} ${runningDevice.deviceId}`);
      return runningDevice;
    }
    
    return devices[0];
  }
  
  /**
   * Get Android emulators (using correct terminology)
   */
  private static async getAndroidEmulators(): Promise<AvailableDevice[]> {
    // This would integrate with mcp_AutoMobile_listDevices
    // For now, returning mock data based on known device
    return [
      {
        deviceId: "emulator-5554",
        platform: "android",
        type: "emulator", // Android uses emulators
        name: "Medium_Phone_API_35",
        state: "online"
      }
    ];
  }
  
  /**
   * Get iOS simulators (using correct terminology)
   */
  private static async getiOSSimulators(): Promise<AvailableDevice[]> {
    // This would integrate with idb commands
    // For now, returning mock data based on known device
    return [
      {
        deviceId: "71884779-ADC8-4256-B1D3-E9AD5FC94F84", 
        platform: "ios",
        type: "simulator", // iOS uses simulators
        name: "iPhone 16 Pro Max",
        state: "booted"
      }
    ];
  }
  
  /**
   * Check if a specific device is available and running
   * @param deviceId - Device identifier to check
   * @returns Device info if available, null otherwise
   */
  static async isDeviceAvailable(deviceId: string): Promise<AvailableDevice | null> {
    const devices = await this.getAllAvailableDevices();
    return devices.find(d => d.deviceId === deviceId) || null;
  }
} 