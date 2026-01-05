import { DeviceReadyOptions, DeviceSessionManager } from "../../src/utils/DeviceSessionManager";
import { BootedDevice, Platform, SomePlatform, ActionableError } from "../../src/models";

/**
 * Fake implementation of DeviceSessionManager for testing
 * Allows configuring connected devices, verification behavior, and asserting method calls
 */
export class FakeDeviceSessionManager implements DeviceSessionManager {
  private currentDevice: BootedDevice | undefined;
  private currentPlatform: Platform | undefined;
  private connectedDevices: BootedDevice[] = [];
  private connectedPlatforms: BootedDevice[] = [];
  private preferredPlatform: Platform | undefined;

  // Configuration state
  private deviceVerificationFailure: boolean = false;
  private verificationFailureMessage: string = "Device verification failed";
  private deviceNotFound: boolean = false;
  private accessibilityServiceFailure: boolean = false;
  private windowVerificationFailure: boolean = false;
  private simulateDisconnection: boolean = false;

  // Call tracking for assertions
  private setCurrentDeviceCalls: BootedDevice[] = [];
  private ensureDeviceReadyCalls: number = 0;
  private verificationAttempts: Map<string, number> = new Map();
  private deviceVerificationCalls: Map<string, Platform> = new Map();
  private lastOptions: DeviceReadyOptions | undefined;

  /**
   * Configure the list of connected devices
   * @param devices - Array of booted devices to report as connected
   */
  setConnectedDevices(devices: BootedDevice[]): void {
    this.connectedDevices = devices;
    // Store as both for interface compatibility
    this.connectedPlatforms = devices;
  }

  /**
   * Configure device verification to fail
   * @param shouldFail - Whether verification should fail
   * @param message - Optional custom error message
   */
  setDeviceVerificationFailure(shouldFail: boolean, message?: string): void {
    this.deviceVerificationFailure = shouldFail;
    if (message) {
      this.verificationFailureMessage = message;
    }
  }

  /**
   * Configure both Android and iOS devices as connected
   * @param androidDevice - Android device to connect
   * @param iosDevice - iOS device to connect
   */
  setBothPlatformsConnected(androidDevice: BootedDevice, iosDevice: BootedDevice): void {
    this.setConnectedDevices([androidDevice, iosDevice]);
  }

  /**
   * Set the preferred platform for auto-selection
   * @param platform - The platform to prefer
   */
  setPreferredPlatform(platform: Platform): void {
    this.preferredPlatform = platform;
  }

  /**
   * Configure that no device is found
   * @param shouldNotFind - Whether to report no device found
   */
  setDeviceNotFound(shouldNotFind: boolean): void {
    this.deviceNotFound = shouldNotFind;
  }

  /**
   * Configure accessibility service setup to fail (Android)
   * @param shouldFail - Whether accessibility service setup should fail
   */
  setAccessibilityServiceSetupFailure(shouldFail: boolean): void {
    this.accessibilityServiceFailure = shouldFail;
  }

  /**
   * Configure window verification to fail
   * @param shouldFail - Whether window verification should fail
   */
  setWindowVerificationFailure(shouldFail: boolean): void {
    this.windowVerificationFailure = shouldFail;
  }

  /**
   * Simulate a device disconnection
   * @param shouldDisconnect - Whether to simulate disconnection
   */
  simulateDeviceDisconnection(shouldDisconnect: boolean): void {
    this.simulateDisconnection = shouldDisconnect;
  }

  /**
   * Get all calls made to setCurrentDevice (for test assertions)
   * @returns Array of devices that were set as current
   */
  getSetCurrentDeviceCalls(): BootedDevice[] {
    return [...this.setCurrentDeviceCalls];
  }

  /**
   * Get the number of times ensureDeviceReady was called (for test assertions)
   * @returns Count of ensureDeviceReady calls
   */
  getEnsureDeviceReadyCalls(): number {
    return this.ensureDeviceReadyCalls;
  }

  /**
   * Get count of ensureDeviceReady calls (alias for getEnsureDeviceReadyCalls)
   * @returns Count of ensureDeviceReady calls
   */
  getEnsureDeviceReadyCallCount(): number {
    return this.ensureDeviceReadyCalls;
  }

  /**
   * Check if ensureDeviceReady was called at least once
   * @returns true if ensureDeviceReady was called
   */
  wasEnsureDeviceReadyCalled(): boolean {
    return this.ensureDeviceReadyCalls > 0;
  }

  /**
   * Check if a specific device was verified
   * @param device - The device to check
   * @returns true if the device was verified
   */
  wasDeviceVerified(device: BootedDevice): boolean {
    return this.deviceVerificationCalls.has(device.deviceId);
  }

  /**
   * Get the number of verification attempts made
   * @returns Total number of verification attempts
   */
  getVerificationAttempts(): number {
    return this.verificationAttempts.size;
  }

  /**
   * Get the last options passed to device methods.
   */
  getLastOptions(): DeviceReadyOptions | undefined {
    return this.lastOptions;
  }

  /**
   * Clear all call history (for test cleanup)
   */
  clearHistory(): void {
    this.setCurrentDeviceCalls = [];
    this.ensureDeviceReadyCalls = 0;
    this.verificationAttempts.clear();
    this.deviceVerificationCalls.clear();
    this.lastOptions = undefined;
  }

  // Implementation of DeviceSessionManager interface

  getCurrentDevice(): BootedDevice | undefined {
    return this.currentDevice;
  }

  getCurrentPlatform(): Platform | undefined {
    return this.currentPlatform;
  }

  setCurrentDevice(device: BootedDevice, platform: Platform): void {
    this.currentDevice = device;
    this.currentPlatform = platform;
    this.setCurrentDeviceCalls.push(device);
  }

  async ensureDeviceReady(
    platform: SomePlatform,
    providedDeviceId?: string,
    options?: DeviceReadyOptions
  ): Promise<BootedDevice> {
    this.ensureDeviceReadyCalls++;
    this.lastOptions = options;

    if (this.simulateDisconnection) {
      throw new ActionableError("Device disconnected during verification");
    }

    let selectedDevice: BootedDevice | undefined = undefined;

    // Use provided device ID if given
    if (providedDeviceId) {
      selectedDevice = this.connectedDevices.find(d => d.deviceId === providedDeviceId);
      if (!selectedDevice) {
        throw new ActionableError(`Device ${providedDeviceId} not found`);
      }
    } else {
      // Find device for the specified platform
      if (platform === "either") {
        selectedDevice = this.connectedDevices[0];
      } else {
        selectedDevice = this.connectedDevices.find(d => d.platform === platform);
      }

      if (!selectedDevice) {
        throw new ActionableError(`No ${platform} device found`);
      }
    }

    if (this.deviceVerificationFailure) {
      throw new ActionableError(this.verificationFailureMessage);
    }

    if (selectedDevice.platform === "android" && this.accessibilityServiceFailure) {
      throw new ActionableError("Accessibility service setup failed");
    }

    if (this.windowVerificationFailure) {
      throw new ActionableError("Window verification failed");
    }

    // Set as current device
    this.currentDevice = selectedDevice;
    this.currentPlatform = selectedDevice.platform;

    return selectedDevice;
  }

  async detectConnectedPlatforms(): Promise<BootedDevice[]> {
    if (this.simulateDisconnection) {
      return [];
    }

    return [...this.connectedPlatforms];
  }

  async verifyDevice(deviceId: string, platform: Platform, options?: DeviceReadyOptions): Promise<void> {
    this.lastOptions = options;
    const attempts = (this.verificationAttempts.get(deviceId) || 0) + 1;
    this.verificationAttempts.set(deviceId, attempts);
    this.deviceVerificationCalls.set(deviceId, platform);

    if (this.simulateDisconnection) {
      throw new ActionableError(`Device ${deviceId} disconnected`);
    }

    if (this.deviceVerificationFailure) {
      throw new ActionableError(this.verificationFailureMessage);
    }

    // Verify device exists in connected devices
    const device = this.connectedDevices.find(d => d.deviceId === deviceId);
    if (!device) {
      throw new ActionableError(`Device ${deviceId} not found`);
    }

    if (device.platform !== platform) {
      throw new ActionableError(
        `Device ${deviceId} is ${device.platform}, not ${platform}`
      );
    }
  }

  async verifyAndroidDevice(deviceId: string, options?: DeviceReadyOptions): Promise<void> {
    this.lastOptions = options;
    const attempts = (this.verificationAttempts.get(deviceId) || 0) + 1;
    this.verificationAttempts.set(deviceId, attempts);
    this.deviceVerificationCalls.set(deviceId, "android");

    if (this.simulateDisconnection) {
      throw new ActionableError(`Android device ${deviceId} disconnected`);
    }

    const device = this.connectedDevices.find(d => d.deviceId === deviceId);
    if (!device) {
      throw new ActionableError(`Android device ${deviceId} not found`);
    }

    if (device.platform !== "android") {
      throw new ActionableError("Device is not an Android device");
    }

    if (this.deviceVerificationFailure) {
      throw new ActionableError(this.verificationFailureMessage);
    }

    if (this.accessibilityServiceFailure) {
      throw new ActionableError("Accessibility service is not setup");
    }

    if (this.windowVerificationFailure) {
      throw new ActionableError("Window verification failed");
    }
  }

  async verifyIosDevice(deviceId: string): Promise<void> {
    const attempts = (this.verificationAttempts.get(deviceId) || 0) + 1;
    this.verificationAttempts.set(deviceId, attempts);
    this.deviceVerificationCalls.set(deviceId, "ios");

    if (this.simulateDisconnection) {
      throw new ActionableError(`iOS device ${deviceId} disconnected`);
    }

    const device = this.connectedDevices.find(d => d.deviceId === deviceId);
    if (!device) {
      throw new ActionableError(`iOS device ${deviceId} not found`);
    }

    if (device.platform !== "ios") {
      throw new ActionableError("Device is not an iOS device");
    }

    if (this.deviceVerificationFailure) {
      throw new ActionableError(this.verificationFailureMessage);
    }
  }

  async findOrStartDevice(platform: Platform, options?: DeviceReadyOptions): Promise<BootedDevice> {
    this.lastOptions = options;
    if (this.deviceNotFound) {
      throw new ActionableError(`No device found for platform: ${platform}`);
    }

    if (this.simulateDisconnection) {
      throw new ActionableError("No devices available");
    }

    // Filter devices based on platform
    const availableDevices = this.connectedDevices.filter(d => d.platform === platform);

    if (availableDevices.length === 0) {
      throw new ActionableError(`No ${platform} device found`);
    }

    return availableDevices[0];
  }

  async findOrStartAndroidDevice(options?: DeviceReadyOptions): Promise<BootedDevice> {
    this.lastOptions = options;
    if (this.deviceNotFound) {
      throw new ActionableError("No Android device found");
    }

    if (this.simulateDisconnection) {
      throw new ActionableError("No Android devices available");
    }

    const androidDevice = this.connectedDevices.find(d => d.platform === "android");

    if (!androidDevice) {
      throw new ActionableError("No Android device found");
    }

    return androidDevice;
  }

  async findOrStartIosDevice(): Promise<BootedDevice> {
    if (this.deviceNotFound) {
      throw new ActionableError("No iOS device found");
    }

    if (this.simulateDisconnection) {
      throw new ActionableError("No iOS devices available");
    }

    const iosDevice = this.connectedDevices.find(d => d.platform === "ios");

    if (!iosDevice) {
      throw new ActionableError("No iOS device found");
    }

    return iosDevice;
  }
}
