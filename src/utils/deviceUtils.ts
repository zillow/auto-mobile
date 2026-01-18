import { ChildProcess } from "child_process";
import { DeviceInfo, ActionableError, SomePlatform, BootedDevice } from "../models";
import { AdbClient } from "./android-cmdline-tools/AdbClient";
import { SimCtlClient } from "./ios-cmdline-tools/SimCtlClient";
import { AndroidEmulatorClient } from "./android-cmdline-tools/AndroidEmulatorClient";

/**
 * Interface for device utility operations
 * Provides platform-agnostic device management for Android emulators and iOS simulators
 */
export interface PlatformDeviceManager {
  /**
   * List all available device images for a specific platform
   * @param platform - Target platform ("android", "ios", or "either" for both)
   * @returns Promise with array of available device information
   */
  listDeviceImages(platform: SomePlatform): Promise<DeviceInfo[]>;

  /**
   * Check if a specific device image is currently running
   * @param device - The device info to check
   * @returns Promise with boolean indicating if the device image is running
   */
  isDeviceImageRunning(device: DeviceInfo): Promise<boolean>;

  /**
   * Get all currently booted/running devices for a specific platform
   * @param platform - Target platform ("android", "ios", or "either" for both)
   * @returns Promise with array of booted device information
   */
  getBootedDevices(platform: SomePlatform): Promise<BootedDevice[]>;

  /**
   * Start a device (emulator or simulator)
   * @param device - The device to start
   * @returns Promise with the spawned child process for the running device
   */
  startDevice(device: DeviceInfo): Promise<ChildProcess>;

  /**
   * Kill/terminate a running device
   * @param device - The booted device to kill
   * @returns Promise that resolves when the device has been stopped
   */
  killDevice(device: BootedDevice): Promise<void>;

  /**
   * Wait for a device to be ready for use after starting
   * @param device - The device to wait for
   * @param timeoutMs - Maximum time to wait in milliseconds (default: 120000 = 2 minutes)
   * @returns Promise that resolves with the booted device information when device is ready
   */
  waitForDeviceReady(device: DeviceInfo, timeoutMs?: number): Promise<BootedDevice>;
}

export class MultiPlatformDeviceManager implements PlatformDeviceManager {
  private adb: AdbClient;
  private emulator: AndroidEmulatorClient;
  private simctl: SimCtlClient;

  /**
   * Create a PlatformDeviceManager instance
   * @param adb - An instance of AdbClient for interacting with Android Debug Bridge
   * @param idb - An instance of SimCtlClient for interacting with iOS simulator controls
   * @param emulator - An instance of AndroidEmulatorClient for managing Android emulators
   */
  constructor(
    adb: AdbClient | null = null,
    idb: SimCtlClient | null = null,
    emulator: AndroidEmulatorClient | null = null,
  ) {
    this.adb = adb || new AdbClient();
    this.simctl = idb || new SimCtlClient();
    this.emulator = emulator || new AndroidEmulatorClient();
  }

  /**
   * List all available device images
   * @returns Promise with array of device image names
   */
  async listDeviceImages(platform: SomePlatform): Promise<DeviceInfo[]> {
    switch (platform) {
      case "android":
        return this.emulator.listAvds();
      case "ios":
        return this.simctl.listSimulatorImages();
      case "either":
        const emulators = await this.emulator.listAvds();
        const simulators = await this.simctl.listSimulatorImages();
        return [...emulators, ...simulators];
    }
  }

  /**
   * Check if a specific device image is running
   * @param device - The device info to check
   * @returns Promise with boolean indicating if the device image is running
   */
  async isDeviceImageRunning(device: DeviceInfo): Promise<boolean> {
    switch (device.platform) {
      case "android":
        return this.emulator.isAvdRunning(device.name);
      case "ios":
        if (device.deviceId) {
          const booted = await this.simctl.getBootedSimulators();
          return booted.some(simulator => simulator.deviceId === device.deviceId);
        }
        return this.simctl.isSimulatorRunning(device.name);
    }
  }

  /**
   * Check if any device is currently running
   * @returns Promise with array of running device info
   */
  async getBootedDevices(platform: SomePlatform): Promise<BootedDevice[]> {
    switch (platform) {
      case "android":
        return this.emulator.getBootedDevices();
      case "ios":
        return this.simctl.getBootedSimulators();
      case "either":
        const emulators = await this.emulator.getBootedDevices();
        const simulators = await this.simctl.getBootedSimulators();
        return [...emulators, ...simulators];
    }
  }

  /**
   * Start a device
   * @param device - The device to start
   * @returns Promise with the spawned child process
   */
  async startDevice(
    device: DeviceInfo
  ): Promise<ChildProcess> {
    const isRunning = await this.isDeviceImageRunning(device);
    if (isRunning) {
      throw new ActionableError(
        `${device.platform} device '${device.name}' is already running`
      );
    }

    switch (device.platform) {
      case "android":
        return this.emulator.startEmulator(device.name);
      case "ios":
        return this.simctl.startSimulator(device.deviceId ?? device.name);
      default:
        throw new ActionableError("Unknown platform");
    }
  }

  /**
   * Kill a running device
   * @param device - The device to kill
   * @returns Promise that resolves when device is stopped
   */
  async killDevice(
    device: BootedDevice
  ): Promise<void> {
    switch (device.platform) {
      case "android":
        return this.emulator.killDevice(device);
      case "ios":
        return this.simctl.killSimulator(device);
    }
  }

  /**
   * Wait for the device to be ready for use
   * @param device - The device to wait for
   * @param timeoutMs - Maximum time to wait in milliseconds (default: 120000 = 2 minutes)
   * @returns Promise that resolves with device ID when device is ready
   */
  async waitForDeviceReady(
    device: DeviceInfo,
    timeoutMs: number = 120000,
  ): Promise<BootedDevice> {
    switch (device.platform) {
      case "android":
        return this.emulator.waitForEmulatorReady(device.name, timeoutMs);
      case "ios":
        return this.simctl.waitForSimulatorReady(device.deviceId ?? device.name);
      default:
        throw new ActionableError("Unknown platform");
    }
  }
}
