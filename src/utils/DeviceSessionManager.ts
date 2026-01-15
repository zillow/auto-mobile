import { ActionableError, BootedDevice, Platform, SomePlatform } from "../models";
import { MultiPlatformDeviceManager } from "./deviceUtils";
import { AdbClient } from "./android-cmdline-tools/AdbClient";
import { SimCtlClient } from "./ios-cmdline-tools/SimCtlClient";
import { Window } from "../features/observe/Window";
import { logger } from "./logger";
import { AndroidAccessibilityServiceManager } from "./AccessibilityServiceManager";
import { AndroidEmulatorClient } from "./android-cmdline-tools/AndroidEmulatorClient";
import { AdbExecutor } from "./android-cmdline-tools/interfaces/AdbExecutor";
import { PlatformDeviceManager } from "./interfaces/DeviceUtils";
import { AccessibilityServiceClient } from "../features/observe/AccessibilityServiceClient";
import { createPerformanceTracker } from "./PerformanceTracker";
import { storeSetupTiming } from "../server/ToolExecutionContext";

/**
 * Interface for device session management
 * Handles device detection, verification, and lifecycle for Android and iOS platforms
 */
export interface DeviceSessionManager {
  /**
   * Get the current device ID
   */
  getCurrentDevice(): BootedDevice | undefined;

  /**
   * Get the current platform
   */
  getCurrentPlatform(): Platform | undefined;

  /**
   * Set the current device ID and platform
   */
  setCurrentDevice(device: BootedDevice, platform: Platform): void;

  /**
   * Ensure a device is ready for the specified platform and return its ID
   * Throws an error if both Android and iOS devices are connected when auto-detecting platform
   */
  ensureDeviceReady(platform: SomePlatform, providedDeviceId?: string, options?: DeviceReadyOptions): Promise<BootedDevice>;

  /**
   * Detect the platform of connected devices
   */
  detectConnectedPlatforms(): Promise<BootedDevice[]>;

  /**
   * Verify a specific device is connected and ready for the given platform
   */
  verifyDevice(deviceId: string, platform: Platform, options?: DeviceReadyOptions): Promise<void>;

  /**
   * Verify an Android device is connected and ready
   */
  verifyAndroidDevice(deviceId: string, options?: DeviceReadyOptions): Promise<void>;

  /**
   * Verify an iOS device is connected and ready
   */
  verifyIosDevice(deviceId: string): Promise<void>;

  /**
   * Find an available device or start an emulator for the specified platform
   */
  findOrStartDevice(platform: Platform, options?: DeviceReadyOptions): Promise<BootedDevice>;

  /**
   * Find an available Android device or start an emulator
   */
  findOrStartAndroidDevice(options?: DeviceReadyOptions): Promise<BootedDevice>;

  /**
   * Find an available iOS device or start a simulator
   */
  findOrStartIosDevice(): Promise<BootedDevice>;
}

export interface DeviceReadyOptions {
  skipAccessibilityDownload?: boolean;
  /**
   * @deprecated Use skipAccessibilityDownload instead.
   */
  skipAccessibilitySetup?: boolean;
}

export class DeviceSessionManager implements DeviceSessionManager {
  private currentDevice: BootedDevice | undefined;
  private currentPlatform: Platform | undefined;
  private static instance: DeviceSessionManager;
  private adb: AdbClient;
  private simctl: SimCtlClient | undefined;
  private androidEmulator: AndroidEmulatorClient | undefined;
  private deviceUtils: PlatformDeviceManager;
  private window: Window | undefined;

  private constructor(adb?: AdbExecutor, deviceUtils?: PlatformDeviceManager) {
    // Use injected adb or create default AdbClient
    if (adb) {
      this.adb = adb as AdbClient;
    } else {
      this.adb = new AdbClient(null);
    }

    // Use injected deviceUtils or create default DeviceUtils
    if (deviceUtils) {
      this.deviceUtils = deviceUtils;
    } else {
      this.simctl = new SimCtlClient(null);
      this.androidEmulator = new AndroidEmulatorClient();
      this.deviceUtils = new MultiPlatformDeviceManager(
        this.adb,
        this.simctl,
        this.androidEmulator
      );
    }
  }

  public static getInstance(): DeviceSessionManager {
    if (!DeviceSessionManager.instance) {
      DeviceSessionManager.instance = new DeviceSessionManager();
    }
    return DeviceSessionManager.instance;
  }

  public static createInstance(adb?: AdbExecutor, deviceUtils?: PlatformDeviceManager): DeviceSessionManager {
    return new DeviceSessionManager(adb, deviceUtils);
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
      // Update AdbClient with new device ID
      this.adb = new AdbClient(device);
    }

    // Reset window when device changes
    this.window = undefined;
  }

  /**
   * Detect the platform of connected devices
   */
  public async detectConnectedPlatforms(): Promise<BootedDevice[]> {
    const devices: BootedDevice[] = [];

    try {
      // Check for Android devices via ADB
      const androidDevices = await this.adb.getBootedAndroidDevices();
      devices.push(...androidDevices);
    } catch (error) {
      logger.warn(`Failed to detect Android devices: ${error}`);
    }

    try {
      // Check for iOS devices/simulators via xcrun simctl
      if (this.simctl) {
        const iosDevices = await this.simctl.getBootedSimulators();
        devices.push(...iosDevices);
      }
    } catch (error) {
      logger.warn(`Failed to detect iOS devices: ${error}`);
    }

    return devices;
  }

  /**
   * Ensure a device is ready for the specified platform and return its ID
   * Throws an error if both Android and iOS devices are connected when auto-detecting platform
   */
  public async ensureDeviceReady(
    platform: SomePlatform,
    providedDeviceId?: string,
    options?: DeviceReadyOptions
  ): Promise<BootedDevice> {
    logger.info(`[DeviceSessionManager] ensureDeviceReady called with platform=${platform}, providedDeviceId=${providedDeviceId}`);

    // Detect all connected devices
    const connectedPlatforms = await this.detectConnectedPlatforms();
    logger.info(`Found ${connectedPlatforms.length} connectedPlatform devices`);
    const androidDevices = connectedPlatforms.filter(device => device.platform === "android");
    logger.info(`Found ${androidDevices.length} android devices`);
    const iosDevices = connectedPlatforms.filter(device => device.platform === "ios");
    logger.info(`Found ${iosDevices.length} ios devices`);

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
        // Only check for mixed platforms when auto-detecting (not explicitly specified)
        if (androidDevices.length > 0 && iosDevices.length > 0) {
          throw new ActionableError(
            "Both Android and iOS devices are connected. Please disconnect devices from one platform to continue."
          );
        }

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

    let selectedDevice: BootedDevice | undefined;
    let deviceVerified = false;
    let deviceSource: "provided" | "current" | "auto" = "auto";

    // If a specific device is provided, verify it exists on the correct platform
    if (providedDeviceId) {
      const providedDevice = platformDevices.find(device => device.deviceId === providedDeviceId);
      if (!providedDevice) {
        throw new ActionableError(
          `Device ${providedDeviceId} not found on ${platform} platform. ` +
          `Available ${platform} devices: ${platformDevices.join(", ") || "none"}`
        );
      }
      selectedDevice = providedDevice;
      deviceSource = "provided";
    }

    // If we have a current device for the requested platform, verify it's still ready
    if (!selectedDevice && this.currentDevice && this.currentPlatform === platform) {
      logger.info(`[DeviceSessionManager] Found current device: ${this.currentDevice.deviceId}, verifying readiness`);
      try {
        await this.verifyDevice(this.currentDevice.deviceId, platform, options);
        selectedDevice = this.currentDevice;
        deviceVerified = true;
        deviceSource = "current";
      } catch (error) {
        logger.warn(`Current device ${this.currentDevice} is no longer ready: ${error}`);
        this.currentDevice = undefined;
        this.currentPlatform = undefined;
      }
    }

    // No device set - find or start one for the requested platform
    if (!selectedDevice) {
      logger.info(`[DeviceSessionManager] No current device, finding or starting device for platform ${resolvedPlatform}`);
      selectedDevice = await this.findOrStartDevice(resolvedPlatform, options);
      deviceVerified = true;
      deviceSource = "auto";
    }

    if (!deviceVerified) {
      await this.verifyDevice(selectedDevice.deviceId, resolvedPlatform, options);
    }

    this.setCurrentDevice(selectedDevice, resolvedPlatform);
    logger.info(`[DeviceSessionManager] Using ${deviceSource} device: ${selectedDevice.deviceId}`);
    return selectedDevice;
  }

  /**
   * Verify a specific device is connected and ready for the given platform
   */
  public async verifyDevice(deviceId: string, platform: Platform, options?: DeviceReadyOptions): Promise<void> {
    if (platform === "android") {
      await this.verifyAndroidDevice(deviceId, options);
    } else {
      await this.verifyIosDevice(deviceId);
    }
  }

  /**
   * Verify an Android device is connected and ready
   */
  public async verifyAndroidDevice(deviceId: string, options?: DeviceReadyOptions): Promise<void> {
    const allDevices = await this.adb.getBootedAndroidDevices();
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

    // Always track setup timing (one-time per session, valuable for debugging)
    const perf = createPerformanceTracker(true);
    perf.serial("ensureAccessibilityService");
    let didSetup = false;

    try {
      const skipAccessibilityDownload = options?.skipAccessibilityDownload ?? options?.skipAccessibilitySetup;
      if (options?.skipAccessibilitySetup !== undefined) {
        logger.warn("[DeviceSessionManager] skipAccessibilitySetup is deprecated; use skipAccessibilityDownload instead.");
      }

      const accessibilityClient = AccessibilityServiceClient.getInstance(device);
      if (accessibilityClient.isConnected()) {
        logger.info(`[DeviceSessionManager] Accessibility service websocket connected for ${deviceId}, skipping accessibility checks`);
        return;
      }

      const manager = AndroidAccessibilityServiceManager.getInstance(device);
      const verifyCompatibilityWhenSkipping = async (): Promise<void> => {
        const isCompatible = await manager.isVersionCompatible();
        if (isCompatible) {
          logger.info(`[DeviceSessionManager] Accessibility service version compatible for ${deviceId}`);
          return;
        }
        const errorMessage = "Accessibility service version mismatch detected. Run without skipAccessibilityDownload to install a compatible version.";
        logger.warn(`[DeviceSessionManager] ${errorMessage} Device: ${deviceId}`);
        throw new ActionableError(errorMessage);
      };

      const [isInstalled, isEnabled] = await perf.track("checkStatus", () => Promise.all([
        manager.isInstalled(),
        manager.isEnabled()
      ]));

      let needsSetup = false;

      if (isInstalled && isEnabled) {
        logger.info(`[DeviceSessionManager] Accessibility service already enabled for ${deviceId}, verifying WebSocket connection`);
        // Verify the service is actually working by checking WebSocket connection
        const connected = await perf.track("verifyConnection", () => accessibilityClient.waitForConnection(3, 200));
        if (connected) {
          if (skipAccessibilityDownload) {
            await verifyCompatibilityWhenSkipping();
            return;
          }
          logger.info(`[DeviceSessionManager] Accessibility service enabled and connected for ${deviceId}, verifying version compatibility`);
        } else {
          // Service claims to be installed but WebSocket won't connect - cache is stale
          logger.warn(`[DeviceSessionManager] Accessibility service cache stale for ${deviceId} - marked as installed/enabled but WebSocket failed. Resetting setup state and forcing reinstall.`);
          manager.resetSetupState();
          needsSetup = true;
        }
      }

      if (!isInstalled && skipAccessibilityDownload) {
        logger.info(`[DeviceSessionManager] Accessibility service not installed for ${deviceId}, skipping download/install`);
        return;
      }

      if (isInstalled && !isEnabled && !needsSetup) {
        logger.info(`[DeviceSessionManager] Accessibility service installed but not enabled for ${deviceId}, enabling now`);
        try {
          await perf.track("enableService", () => manager.enable());
          didSetup = true;
          // Wait for WebSocket to be ready after enabling
          logger.info(`[DeviceSessionManager] Waiting for accessibility WebSocket connection for ${deviceId}`);
          const enableConnected = await perf.track("waitForConnection", () => accessibilityClient.waitForConnection());
          if (!enableConnected) {
            logger.warn(`[DeviceSessionManager] WebSocket connection failed after enabling for ${deviceId}, will attempt full setup`);
            manager.resetSetupState();
            needsSetup = true;
          } else {
            if (skipAccessibilityDownload) {
              await verifyCompatibilityWhenSkipping();
              return;
            }
            logger.info(`[DeviceSessionManager] Accessibility service enabled for ${deviceId}, verifying version compatibility`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.warn(`[DeviceSessionManager] Failed to enable accessibility service: ${errorMessage}`);
          if (skipAccessibilityDownload) {
            return;
          }
          needsSetup = true;
        }
      }

      if (skipAccessibilityDownload && !needsSetup) {
        logger.info(`[DeviceSessionManager] Skipping accessibility service download/install for ${deviceId}`);
        return;
      }

      if (needsSetup || !isInstalled) {
        await manager.setup(false, perf);
        didSetup = true;
        // Wait for WebSocket to be ready after setup (install + enable)
        logger.info(`[DeviceSessionManager] Waiting for accessibility WebSocket connection after setup for ${deviceId}`);
        const connected = await perf.track("waitForConnection", () => accessibilityClient.waitForConnection());
        if (connected) {
          // Verify service is actually ready to respond (not just WebSocket connected)
          logger.info(`[DeviceSessionManager] Verifying accessibility service is responsive for ${deviceId}`);
          const ready = await perf.track("verifyServiceReady", () => accessibilityClient.verifyServiceReady(5, 500, 3000));
          if (!ready) {
            logger.warn(`[DeviceSessionManager] Accessibility service not responsive after setup for ${deviceId}, observe may fall back to UIAutomator`);
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[DeviceSessionManager] Failed to setup accessibility service: ${errorMessage}`);
      // Rethrow ActionableErrors to preserve their specific error messages
      if (error instanceof ActionableError) {
        throw error;
      }
    } finally {
      perf.end();
      // Store timing if we actually did setup work
      if (didSetup) {
        const timings = perf.getTimings();
        if (timings) {
          storeSetupTiming(deviceId, timings);
        }
      }
    }
  }

  /**
   * Verify an iOS device is connected and ready
   */
  public async verifyIosDevice(deviceId: string): Promise<void> {
    if (!this.simctl) {
      throw new ActionableError("iOS simulator tools not available");
    }
    const deviceInfo = await this.simctl.getDeviceInfo(deviceId);

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
  public async findOrStartDevice(platform: Platform, options?: DeviceReadyOptions): Promise<BootedDevice> {
    if (platform === "android") {
      return await this.findOrStartAndroidDevice(options);
    } else {
      return await this.findOrStartIosDevice();
    }
  }

  /**
   * Find an available Android device or start an emulator
   */
  public async findOrStartAndroidDevice(options?: DeviceReadyOptions): Promise<BootedDevice> {
    const allDevices = await this.deviceUtils.getBootedDevices("android");

    if (allDevices.length > 0) {
      // Use the first available device
      const device = allDevices[0];
      const deviceId = device.deviceId!;
      await this.verifyAndroidDevice(deviceId, options);
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

    await this.verifyAndroidDevice(newDevice.deviceId!, options);
    return newDevice;
  }

  /**
   * Find an available iOS device or start a simulator
   */
  public async findOrStartIosDevice(): Promise<BootedDevice> {
    if (!this.simctl) {
      throw new ActionableError("iOS simulator tools not available");
    }
    const allDevices = await this.simctl.listSimulatorImages();

    if (allDevices.length === 0) {
      throw new ActionableError(
        "No iOS simulators are available. Please create an iOS simulator using Xcode or the Simulator app."
      );
    }

    // Check for already booted simulators first
    const bootedDevices = await this.simctl.getBootedSimulators();

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

    const bootedDevice = await this.simctl!.bootSimulator(deviceId);
    await this.verifyIosDevice(deviceId);
    return bootedDevice;
  }
}
