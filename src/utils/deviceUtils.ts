import { ChildProcess } from "child_process";
import { DeviceInfo, ActionableError, SomePlatform, BootedDevice } from "../models";
import { AdbUtils } from "./android-cmdline-tools/adb";
import { Simctl } from "./ios-cmdline-tools/simctl";
import { AndroidEmulator } from "./android-cmdline-tools/emulator";

export class DeviceUtils {
  private adb: AdbUtils;
  private emulator: AndroidEmulator;
  private simctl: Simctl;

  /**
   * Create an EmulatorUtils instance
   * @param adb - An instance of AdbUtils for interacting with Android Debug Bridge
   * @param idb - An instance of IdbCompanion for interacting with iOS simulator controls
   * @param emulator - An instance of AndroidEmulator for interacting with iOS simulator controls
   */
  constructor(
    adb: AdbUtils | null = null,
    idb: Simctl | null = null,
    emulator: AndroidEmulator | null = null,
  ) {
    this.adb = adb || new AdbUtils();
    this.simctl = idb || new Simctl();
    this.emulator = emulator || new AndroidEmulator();
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
        return this.emulator.getBootedEmulators();
      case "ios":
        return this.simctl.getBootedSimulators();
      case "either":
        const emulators = await this.emulator.getBootedEmulators();
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
    switch (device.platform) {
      case "android":
        return this.emulator.startEmulator(device.name);
      case "ios":
        return this.simctl.startSimulator(device.name);
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
        return this.simctl.waitForSimulatorReady(device.name);
      default:
        throw new ActionableError("Unknown platform");
    }
  }
}
