import { ActionableError } from "../models";
import { EmulatorUtils } from "./emulator";
import { AdbUtils } from "./adb";
import { Window } from "../features/observe/Window";
import { logger } from "./logger";
import { TestAuthoringManager } from "./testAuthoringManager";
import { AccessibilityServiceManager } from "./accessibilityServiceManager";

export type Platform = "android" | "ios";

export class DeviceSessionManager {
  private currentDeviceId: string | undefined;
  private currentPlatform: Platform | undefined;
  private static instance: DeviceSessionManager;
  private adbUtils: AdbUtils;
  private emulatorUtils: EmulatorUtils;
  private window: Window | undefined;
  private testAuthoringManager: TestAuthoringManager;

  private constructor() {
    this.adbUtils = new AdbUtils(null);
    this.emulatorUtils = new EmulatorUtils();
    this.testAuthoringManager = TestAuthoringManager.getInstance();
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
  public getCurrentDeviceId(): string | undefined {
    return this.currentDeviceId;
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
  public setCurrentDevice(deviceId: string, platform: Platform): void {
    this.currentDeviceId = deviceId;
    this.currentPlatform = platform;

    if (platform === "android") {
      // Update AdbUtils with new device ID
      this.adbUtils = new AdbUtils(deviceId);
    }

    // Reset window when device changes
    this.window = undefined;
  }

  /**
   * Detect the platform of connected devices
   */
  private async detectConnectedPlatforms(): Promise<{ android: string[]; ios: string[] }> {
    const platforms = { android: [] as string[], ios: [] as string[] };

    try {
      // Check for Android devices via ADB
      const androidDevices = await this.adbUtils.getDevices();
      platforms.android = androidDevices;
    } catch (error) {
      logger.warn(`Failed to detect Android devices: ${error}`);
    }

    try {
      // TODO: Add iOS device detection using xcrun simctl list devices --json
      // For now, iOS detection is a placeholder
      // const iosDevices = await this.detectIosDevices();
      // platforms.ios = iosDevices;
    } catch (error) {
      logger.warn(`Failed to detect iOS devices: ${error}`);
    }

    return platforms;
  }

  /**
   * Ensure a device is ready for the specified platform and return its ID
   * Throws an error if both Android and iOS devices are connected
   */
  public async ensureDeviceReady(platform: Platform, providedDeviceId?: string, failIfNoDevice: boolean = false): Promise<string> {
    // Detect all connected devices
    const connectedPlatforms = await this.detectConnectedPlatforms();

    // Check if both platforms have devices - this is not allowed
    if (connectedPlatforms.android.length > 0 && connectedPlatforms.ios.length > 0) {
      throw new ActionableError(
        "Both Android and iOS devices are connected. Please disconnect devices from one platform to continue. " +
        `Android devices: ${connectedPlatforms.android.join(", ")}. iOS devices: ${connectedPlatforms.ios.join(", ")}.`
      );
    }

    // Get devices for the requested platform
    const platformDevices = connectedPlatforms[platform];

    // If a specific device is provided, verify it exists on the correct platform
    if (providedDeviceId) {
      if (!platformDevices.includes(providedDeviceId)) {
        throw new ActionableError(
          `Device ${providedDeviceId} not found on ${platform} platform. ` +
          `Available ${platform} devices: ${platformDevices.join(", ") || "none"}`
        );
      }

      await this.verifyDevice(providedDeviceId, platform);
      this.setCurrentDevice(providedDeviceId, platform);
      return providedDeviceId;
    }

    // If we have a current device for the requested platform, verify it's still ready
    if (this.currentDeviceId && this.currentPlatform === platform) {
      try {
        await this.verifyDevice(this.currentDeviceId, platform);
        return this.currentDeviceId;
      } catch (error) {
        logger.warn(`Current device ${this.currentDeviceId} is no longer ready: ${error}`);
        this.currentDeviceId = undefined;
        this.currentPlatform = undefined;
      }
    }

    if (failIfNoDevice) {
      throw new ActionableError(`No device is currently set and none was provided for platform: ${platform}.`);
    }

    // No device set - find or start one for the requested platform
    const deviceId = await this.findOrStartDevice(platform);
    this.setCurrentDevice(deviceId, platform);
    return deviceId;
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
    const allDevices = await this.adbUtils.getDevices();

    if (!allDevices.includes(deviceId)) {
      throw new ActionableError(
        `Android device ${deviceId} is not connected. Available devices: ${allDevices.join(", ") || "none"}`
      );
    }

    // Check if we can get an active window from the device
    try {
      logger.info(`[DeviceSessionManager] Verifying Android device ${deviceId} readiness`);

      if (!this.window || this.window.getDeviceId() !== deviceId) {
        this.window = new Window(deviceId);
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
      await AccessibilityServiceManager.getInstance(deviceId).setup();
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
    // TODO: Implement iOS device verification
    // This would use xcrun simctl or similar iOS tools
    throw new ActionableError("iOS device verification not yet implemented");
  }

  /**
   * Find an available device or start an emulator for the specified platform
   */
  private async findOrStartDevice(platform: Platform): Promise<string> {
    if (platform === "android") {
      return await this.findOrStartAndroidDevice();
    } else {
      return await this.findOrStartIosDevice();
    }
  }

  /**
   * Find an available Android device or start an emulator
   */
  private async findOrStartAndroidDevice(): Promise<string> {
    const allDevices = await this.adbUtils.getDevices();

    if (allDevices.length > 0) {
      // Use the first available device
      const deviceId = allDevices[0];
      await this.verifyAndroidDevice(deviceId);
      return deviceId;
    }

    // No devices - try to start an emulator
    const availableAvds = await this.emulatorUtils.listAvds();

    if (availableAvds.length === 0) {
      throw new ActionableError(
        "No Android devices are connected and no Android Virtual Devices (AVDs) are available. Please connect a physical device or create an AVD first."
      );
    }

    // Start the first available AVD
    const avdName = availableAvds[0];
    logger.info(`Starting Android emulator ${avdName}...`);
    await this.emulatorUtils.startEmulator(avdName, []);

    // Wait for the emulator to fully boot and get its device ID
    const newDeviceId = await this.emulatorUtils.waitForEmulatorReady(avdName);

    if (!newDeviceId) {
      throw new ActionableError(
        `Failed to start Android emulator ${avdName}.`
      );
    }

    await this.verifyAndroidDevice(newDeviceId);
    return newDeviceId;
  }

  /**
   * Find an available iOS device or start a simulator
   */
  private async findOrStartIosDevice(): Promise<string> {
    // TODO: Implement iOS device detection and simulator management
    // This would use xcrun simctl list devices --json and xcrun simctl boot
    throw new ActionableError("iOS device management not yet implemented");
  }
}
