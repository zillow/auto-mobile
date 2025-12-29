import { DeviceSelector as DeviceSelectorImpl, AvailableDevice, DeviceSelectionOptions } from "./DeviceSelector";

/**
 * Interface for device selection operations
 */
export interface DeviceSelector {
  /**
   * Get all available devices across both platforms
   * @returns Promise with list of available devices
   */
  getAllAvailableDevices(): Promise<AvailableDevice[]>;

  /**
   * Select the best device based on options
   * @param options - Selection preferences
   * @returns Selected device or null if none available
   */
  selectDevice(options?: DeviceSelectionOptions): Promise<AvailableDevice | null>;

  /**
   * Select iOS Simulator specifically
   * @returns Selected iOS simulator or null if none available
   */
  selectiOSSimulator(): Promise<AvailableDevice | null>;

  /**
   * Select Android Emulator specifically
   * @returns Selected Android emulator or null if none available
   */
  selectAndroidEmulator(): Promise<AvailableDevice | null>;

  /**
   * Interactive device selection - let user choose
   * @param availableDevices - List of available devices
   * @returns Selected device
   */
  interactiveSelection(availableDevices?: AvailableDevice[]): Promise<AvailableDevice | null>;

  /**
   * Check if a specific device is available and running
   * @param deviceId - Device identifier to check
   * @returns Device info if available, null otherwise
   */
  isDeviceAvailable(deviceId: string): Promise<AvailableDevice | null>;
}

/**
 * Wrapper class that implements DeviceSelector interface
 * Delegates to the static DeviceSelector class
 */
export class DeviceSelectorService implements DeviceSelector {
  async getAllAvailableDevices(): Promise<AvailableDevice[]> {
    return await DeviceSelectorImpl.getAllAvailableDevices();
  }

  async selectDevice(options?: DeviceSelectionOptions): Promise<AvailableDevice | null> {
    return await DeviceSelectorImpl.selectDevice(options);
  }

  async selectiOSSimulator(): Promise<AvailableDevice | null> {
    return await DeviceSelectorImpl.selectiOSSimulator();
  }

  async selectAndroidEmulator(): Promise<AvailableDevice | null> {
    return await DeviceSelectorImpl.selectAndroidEmulator();
  }

  async interactiveSelection(availableDevices?: AvailableDevice[]): Promise<AvailableDevice | null> {
    return await DeviceSelectorImpl.interactiveSelection(availableDevices);
  }

  async isDeviceAvailable(deviceId: string): Promise<AvailableDevice | null> {
    return await DeviceSelectorImpl.isDeviceAvailable(deviceId);
  }
}
