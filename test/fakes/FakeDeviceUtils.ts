import { ChildProcess } from "child_process";
import {
  BootedDevice,
  DeviceInfo,
  SomePlatform,
  Platform,
} from "../../src/models";
import { PlatformDeviceManager } from "../../src/utils/deviceUtils";

/**
 * Fake implementation of PlatformDeviceManager for testing
 * Allows configuring device states and asserting operations
 */
export class FakeDeviceUtils implements PlatformDeviceManager {
  private deviceImages: Map<Platform, DeviceInfo[]> = new Map();
  private bootedDevices: Map<Platform, BootedDevice[]> = new Map();
  private runningDeviceNames: Set<string> = new Set();
  private executedOperations: string[] = [];
  private mockChildProcesses: Map<string, ChildProcess> = new Map();

  /**
   * Configure available device images for a platform
   * @param platform - The platform to configure
   * @param devices - Array of device images to make available
   */
  setDeviceImages(platform: Platform, devices: DeviceInfo[]): void {
    this.deviceImages.set(platform, devices);
  }

  /**
   * Configure booted devices for a platform
   * @param platform - The platform to configure
   * @param devices - Array of booted devices
   */
  setBootedDevices(platform: Platform, devices: BootedDevice[]): void {
    this.bootedDevices.set(platform, devices);
    // Track running device names
    devices.forEach(device => {
      this.runningDeviceNames.add(device.name);
      this.runningDeviceNames.add(device.deviceId);
    });
  }

  /**
   * Add a single booted device to the platform
   * @param device - The booted device to add
   */
  addBootedDevice(device: BootedDevice): void {
    const platform = device.platform;
    const existing = this.bootedDevices.get(platform) || [];
    this.bootedDevices.set(platform, [...existing, device]);
    this.runningDeviceNames.add(device.name);
    this.runningDeviceNames.add(device.deviceId);
  }

  /**
   * Mark a device as running
   * @param deviceName - The name of the device
   */
  markDeviceAsRunning(deviceName: string): void {
    this.runningDeviceNames.add(deviceName);
  }

  /**
   * Mark a device as not running
   * @param deviceName - The name of the device
   */
  markDeviceAsStopped(deviceName: string): void {
    this.runningDeviceNames.delete(deviceName);
  }

  /**
   * Set a mock ChildProcess to be returned for a specific device
   * @param deviceName - The device name
   * @param childProcess - The mock child process to return
   */
  setMockChildProcess(deviceName: string, childProcess: ChildProcess): void {
    this.mockChildProcesses.set(deviceName, childProcess);
  }

  /**
   * Get history of executed operations (for test assertions)
   * @returns Array of operation strings that were executed
   */
  getExecutedOperations(): string[] {
    return [...this.executedOperations];
  }

  /**
   * Check if a specific method was called
   * @param operationName - Name of the operation to check (e.g., "listDeviceImages", "startDevice")
   * @returns true if the operation was called at least once
   */
  wasMethodCalled(operationName: string): boolean {
    return this.executedOperations.some(op => op.includes(operationName));
  }

  /**
   * Get count of times a specific method was called
   * @param operationName - Name of the operation to count
   * @returns Number of times the operation was called
   */
  getCallCount(operationName: string): number {
    return this.executedOperations.filter(op => op.includes(operationName))
      .length;
  }

  /**
   * Clear operation history
   */
  clearHistory(): void {
    this.executedOperations = [];
  }

  // Implementation of DeviceUtils interface

  async listDeviceImages(platform: SomePlatform): Promise<DeviceInfo[]> {
    this.executedOperations.push(`listDeviceImages:${platform}`);

    if (platform === "either") {
      const androidDevices = this.deviceImages.get("android") || [];
      const iosDevices = this.deviceImages.get("ios") || [];
      return [...androidDevices, ...iosDevices];
    }

    return this.deviceImages.get(platform) || [];
  }

  async isDeviceImageRunning(device: DeviceInfo): Promise<boolean> {
    const identifier = device.deviceId ?? device.name;
    this.executedOperations.push(`isDeviceImageRunning:${identifier}`);
    return this.runningDeviceNames.has(identifier) || this.runningDeviceNames.has(device.name);
  }

  async getBootedDevices(platform: SomePlatform): Promise<BootedDevice[]> {
    this.executedOperations.push(`getBootedDevices:${platform}`);

    if (platform === "either") {
      const androidDevices = this.bootedDevices.get("android") || [];
      const iosDevices = this.bootedDevices.get("ios") || [];
      return [...androidDevices, ...iosDevices];
    }

    return this.bootedDevices.get(platform) || [];
  }

  async startDevice(device: DeviceInfo): Promise<ChildProcess> {
    this.executedOperations.push(`startDevice:${device.name}`);
    this.runningDeviceNames.add(device.name);
    if (device.deviceId) {
      this.runningDeviceNames.add(device.deviceId);
    }

    // Return mock process if configured, otherwise return a default mock
    if (this.mockChildProcesses.has(device.name)) {
      return this.mockChildProcesses.get(device.name)!;
    }

    // Return a minimal mock ChildProcess
    return {
      on: () => null,
      once: () => null,
      off: () => null,
      kill: () => false,
      stdout: null,
      stderr: null,
      stdin: null,
      pid: 12345,
    } as any as ChildProcess;
  }

  async killDevice(device: BootedDevice): Promise<void> {
    this.executedOperations.push(`killDevice:${device.name}`);
    this.runningDeviceNames.delete(device.name);
  }

  async waitForDeviceReady(
    device: DeviceInfo,
    timeoutMs: number = 120000,
  ): Promise<BootedDevice> {
    this.executedOperations.push(
      `waitForDeviceReady:${device.name}:${timeoutMs}`,
    );

    // Return a booted device with the same name and platform
    return {
      name: device.name,
      platform: device.platform,
      deviceId: device.deviceId || `mock-${device.name}`,
      source: device.source,
    };
  }
}
