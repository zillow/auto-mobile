import { DeviceSelector } from "../../src/utils/DeviceSelectorService";
import { AvailableDevice, DeviceSelectionOptions } from "../../src/utils/DeviceSelector";

/**
 * Fake implementation of DeviceSelector for testing
 * Allows configuration of return values for different methods
 */
export class FakeDeviceSelector implements DeviceSelector {
  private mockDevices: AvailableDevice[] = [];
  private mockSelectedDevice: AvailableDevice | null = null;
  private mockiOSSimulator: AvailableDevice | null = null;
  private mockAndroidEmulator: AvailableDevice | null = null;
  private mockInteractiveSelected: AvailableDevice | null = null;
  private mockAvailableDeviceId: string | null = null;

  /**
   * Configure the devices that will be returned by getAllAvailableDevices
   */
  setAvailableDevices(devices: AvailableDevice[]): void {
    this.mockDevices = devices;
  }

  /**
   * Configure the device that will be returned by selectDevice
   */
  setSelectedDevice(device: AvailableDevice | null): void {
    this.mockSelectedDevice = device;
  }

  /**
   * Configure the iOS simulator that will be returned by selectiOSSimulator
   */
  setSelectediOSSimulator(device: AvailableDevice | null): void {
    this.mockiOSSimulator = device;
  }

  /**
   * Configure the Android emulator that will be returned by selectAndroidEmulator
   */
  setSelectedAndroidEmulator(device: AvailableDevice | null): void {
    this.mockAndroidEmulator = device;
  }

  /**
   * Configure the device that will be returned by interactiveSelection
   */
  setInteractiveSelection(device: AvailableDevice | null): void {
    this.mockInteractiveSelected = device;
  }

  /**
   * Configure which device ID will be considered available by isDeviceAvailable
   */
  setAvailableDeviceId(deviceId: string | null): void {
    this.mockAvailableDeviceId = deviceId;
  }

  async getAllAvailableDevices(): Promise<AvailableDevice[]> {
    return this.mockDevices;
  }

  async selectDevice(options?: DeviceSelectionOptions): Promise<AvailableDevice | null> {
    return this.mockSelectedDevice;
  }

  async selectiOSSimulator(): Promise<AvailableDevice | null> {
    return this.mockiOSSimulator;
  }

  async selectAndroidEmulator(): Promise<AvailableDevice | null> {
    return this.mockAndroidEmulator;
  }

  async interactiveSelection(availableDevices?: AvailableDevice[]): Promise<AvailableDevice | null> {
    return this.mockInteractiveSelected;
  }

  async isDeviceAvailable(deviceId: string): Promise<AvailableDevice | null> {
    if (this.mockAvailableDeviceId === deviceId) {
      // Return a default device matching the requested ID
      return {
        deviceId,
        platform: "android",
        type: "emulator",
        state: "online"
      };
    }
    return null;
  }
}
