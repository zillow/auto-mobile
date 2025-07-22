import { ActionableError, BootedDevice, Platform, SomePlatform } from "../models";
import { DeviceUtils } from "./deviceUtils";
import { AdbUtils } from "./android-cmdline-tools/adb";
import { IdbCompanion } from "./ios-cmdline-tools/idbCompanion";
import { Window } from "../features/observe/Window";
import { logger } from "./logger";
import { AccessibilityServiceManager } from "./accessibilityServiceManager";
import { AndroidEmulator } from "./android-cmdline-tools/emulator";

export class DeviceSessionManager {
  private currentDevice: BootedDevice | undefined;
  private currentPlatform: Platform | undefined;
  private static instance: DeviceSessionManager;
  private adb: AdbUtils;
  private idb: IdbCompanion;
  private androidEmulator: AndroidEmulator;
  private deviceUtils: DeviceUtils;
  private window: Window | undefined;

  private constructor() {
    this.adb = new AdbUtils(null);
    this.idb = new IdbCompanion(null);
    this.androidEmulator = new AndroidEmulator();
    this.deviceUtils = new DeviceUtils(
      this.adb,
      this.idb,
      this.androidEmulator
    );
  }

  public static getInstance(): DeviceSessionManager {
    if (!DeviceSessionManager.instance) {
      DeviceSessionManager.instance = new DeviceSessionManager();
    }
    return DeviceSessionManager.instance;
  }

  /**
   * Get the current device ID
   */
  public getCurrentDevice(): BootedDevice | undefined {
    return this.currentDevice;
  }

  /**
   * Get the current platform
   */
  public getCurrentPlatform(): Platform | undefined {
    return this.currentPlatform;
  }

  /**
   * Set the current device ID and platform
   */
  public setCurrentDevice(device: BootedDevice, platform: Platform): void {
    this.currentDevice = device;
    this.currentPlatform = platform;

    if (platform === "android") {
      // Update AdbUtils with new device ID
      this.adb = new AdbUtils(device);
    }

    // Reset window when device changes
    this.window = undefined;
  }

  /**
   * Detect the platform of connected devices
   */
  private async detectConnectedPlatforms(): Promise<BootedDevice[]> {
    const devices: BootedDevice[] = [];

    try {
      // Check for Android devices via ADB
      const androidDevices = await this.adb.getBootedEmulators();
      devices.push(...androidDevices);
    } catch (error) {
      logger.warn(`Failed to detect Android devices: ${error}`);
    }

    try {
      // Check for iOS devices/simulators via xcrun simctl
      const iosDevices = await this.idb.getBootedSimulators();
      devices.push(...iosDevices);
    } catch (error) {
      logger.warn(`Failed to detect iOS devices: ${error}`);
    }

    return devices;
  }

  /**
   * Ensure a device is ready for the specified platform and return its ID
   * Throws an error if both Android and iOS devices are connected
   */
  public async ensureDeviceReady(platform: SomePlatform, providedDeviceId?: string): Promise<BootedDevice> {
    // Detect all connected devices
    const connectedPlatforms = await this.detectConnectedPlatforms();
    logger.info(`Found ${connectedPlatforms.length} connectedPlatform devices`);
    const androidDevices = connectedPlatforms.filter(device => device.platform === "android");
    logger.info(`Found ${androidDevices.length} android devices`);
    const iosDevices = connectedPlatforms.filter(device => device.platform === "ios");
    logger.info(`Found ${iosDevices.length} ios devices`);

    // Check if both platforms have devices - this is not allowed
    if (androidDevices.length > 0 && iosDevices.length > 0) {
      throw new ActionableError(
        "Both Android and iOS devices are connected. Please disconnect devices from one platform to continue."
      );
    }

    // Get devices for the requested platform
    let platformDevices: BootedDevice[] = [];
    let resolvedPlatform: Platform;
    switch (platform) {
      case "android":
        platformDevices = androidDevices;
        resolvedPlatform = "android";
        break;
      case "ios":
        platformDevices = iosDevices;
        resolvedPlatform = "ios";
        break;
      default:
        if (androidDevices.length > 0) {
          platformDevices = androidDevices;
          resolvedPlatform = "android";
        } else if (iosDevices.length > 0) {
          platformDevices = iosDevices;
          resolvedPlatform = "ios";
        } else {
          platformDevices = [];
          resolvedPlatform = "android";
        }
    }

    // If a specific device is provided, verify it exists on the correct platform
    if (providedDeviceId && resolvedPlatform) {
      const providedDevice = platformDevices.find(device => device.deviceId === providedDeviceId);
      if (!providedDevice) {
        throw new ActionableError(
          `Device ${providedDeviceId} not found on ${platform} platform. ` +
          `Available ${platform} devices: ${platformDevices.join(", ") || "none"}`
        );
      }

      await this.verifyDevice(providedDeviceId, resolvedPlatform);
      this.setCurrentDevice(providedDevice, resolvedPlatform);
      return providedDevice;
    }

    // If we have a current device for the requested platform, verify it's still ready
    if (this.currentDevice && this.currentPlatform === platform) {
      try {
        await this.verifyDevice(this.currentDevice.deviceId, platform);
        return this.currentDevice;
      } catch (error) {
        logger.warn(`Current device ${this.currentDevice} is no longer ready: ${error}`);
        this.currentDevice = undefined;
        this.currentPlatform = undefined;
      }
    }

    // No device set - find or start one for the requested platform
    const device = await this.findOrStartDevice(resolvedPlatform);
    this.setCurrentDevice(device, resolvedPlatform);
    return device;
  }

  /**
   * Verify a specific device is connected and ready for the given platform
   */
  private async verifyDevice(deviceId: string, platform: Platform): Promise<void> {
    if (platform === "android") {
      await this.verifyAndroidDevice(deviceId);
    } else {
      await this.verifyIosDevice(deviceId);
    }
  }

  /**
   * Verify an Android device is connected and ready
   */
  private async verifyAndroidDevice(deviceId: string): Promise<void> {
    const allDevices = await this.adb.getBootedEmulators();
    const device = allDevices.find(device => device.name === deviceId);

    if (!device) {
      throw new ActionableError(
        `Android device ${deviceId} is not connected. Available devices: ${allDevices.join(", ") || "none"}`
      );
    }

    // Check if we can get an active window from the device
    try {
      logger.info(`[DeviceSessionManager] Verifying Android device ${deviceId} readiness`);

      if (!this.window || this.window.getDeviceId() !== deviceId) {
        this.window = new Window(device);
      }

      let activeWindow = await this.window.getActive();
      if (!activeWindow || !activeWindow.appId || !activeWindow.activityName) {
        activeWindow = await this.window.getActive(true);
        if (!activeWindow || !activeWindow.appId || !activeWindow.activityName) {
          logger.warn(`[DeviceSessionManager] Android device ${deviceId} is not fully ready`);
          if (activeWindow) {
            logger.warn(`[DeviceSessionManager] activeWindow.appId: ${activeWindow.appId} | activeWindow.activityName: ${activeWindow.activityName}`);
          } else {
            logger.warn(`[DeviceSessionManager] activeWindow: ${activeWindow}`);
          }
          throw new ActionableError(
            `Cannot get active window information from Android device ${deviceId}. The device may not be fully booted or is in an unusual state.`
          );
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new ActionableError(
        `Failed to verify Android device ${deviceId} readiness: ${errorMessage}`
      );
    }

    try {
      await AccessibilityServiceManager.getInstance(device).setup();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[DeviceSessionManager] Failed to setup accessibility service: ${errorMessage}`);
      // Rethrow ActionableErrors to preserve their specific error messages
      if (error instanceof ActionableError) {
        throw error;
      }
    }
  }

  /**
   * Verify an iOS device is connected and ready
   */
  private async verifyIosDevice(deviceId: string): Promise<void> {
    const deviceInfo = await this.idb.getDeviceInfo(deviceId);

    if (!deviceInfo) {
      throw new ActionableError(
        `iOS simulator ${deviceId} is not available. Please check if it exists and is available.`
      );
    }

    if (!deviceInfo.isAvailable) {
      throw new ActionableError(
        `iOS simulator ${deviceId} is not available (state: ${deviceInfo.state}). Please check simulator availability.`
      );
    }

    // If simulator is not booted, we could boot it, but for now we'll just check
    if (deviceInfo.state !== "Booted") {
      logger.info(`iOS simulator ${deviceId} is not booted (state: ${deviceInfo.state})`);
      // Note: We could auto-boot here if desired, but keeping consistent with current behavior
    }
  }

  /**
   * Find an available device or start an emulator for the specified platform
   */
  private async findOrStartDevice(platform: Platform): Promise<BootedDevice> {
    if (platform === "android") {
      return await this.findOrStartAndroidDevice();
    } else {
      return await this.findOrStartIosDevice();
    }
  }

  /**
   * Find an available Android device or start an emulator
   */
  private async findOrStartAndroidDevice(): Promise<BootedDevice> {
    const allDevices = await this.deviceUtils.getBootedDevices("android");

    if (allDevices.length > 0) {
      // Use the first available device
      const device = allDevices[0];
      const deviceId = device.deviceId!;
      await this.verifyAndroidDevice(deviceId);
      return device;
    }

    // No devices - try to start a device from an image
    const availableImages = await this.deviceUtils.listDeviceImages("android");

    if (availableImages.length === 0) {
      throw new ActionableError(
        "No devices are connected and no device images are available. Please connect a physical device or create a device image first."
      );
    }

    // Start the first available AVD
    const deviceImage = availableImages[0];
    logger.info(`Starting Android emulator ${deviceImage}...`);
    await this.deviceUtils.startDevice(deviceImage);

    // Wait for the emulator to fully boot and get its device ID
    const newDevice = await this.deviceUtils.waitForDeviceReady(deviceImage);

    if (!newDevice) {
      throw new ActionableError(
        `Failed to start Android emulator ${deviceImage}.`
      );
    }

    await this.verifyAndroidDevice(newDevice.deviceId!);
    return newDevice;
  }

  /**
   * Find an available iOS device or start a simulator
   */
  private async findOrStartIosDevice(): Promise<BootedDevice> {
    const allDevices = await this.idb.listSimulatorImages();

    if (allDevices.length === 0) {
      throw new ActionableError(
        "No iOS simulators are available. Please create an iOS simulator using Xcode or the Simulator app."
      );
    }

    // Check for already booted simulators first
    const bootedDevices = await this.idb.getBootedSimulators();

    if (bootedDevices.length > 0) {
      // Use the first booted device
      const device = bootedDevices[0];
      await this.verifyIosDevice(device.deviceId!);
      return device;
    }

    // No booted devices - boot the first available simulator
    const device = allDevices[0];
    const deviceId = device.deviceId!;
    logger.info(`Booting iOS simulator ${device}...`);

    const bootedDevice = await this.idb.bootSimulator(deviceId);
    await this.verifyIosDevice(deviceId);
    return bootedDevice;
  }
}
