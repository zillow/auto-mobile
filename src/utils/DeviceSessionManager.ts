import { ActionableError, BootedDevice, Platform, SomePlatform } from "../models";
import { MultiPlatformDeviceManager } from "./deviceUtils";
import { AdbClientFactory, defaultAdbClientFactory } from "./android-cmdline-tools/AdbClientFactory";
import { SimCtlClient } from "./ios-cmdline-tools/SimCtlClient";
import { Window } from "../features/observe/Window";
import { logger } from "./logger";
import { AndroidCtrlProxyManager } from "./CtrlProxyManager";
import { IOSCtrlProxyManager } from "./IOSCtrlProxyManager";
import { AndroidEmulatorClient } from "./android-cmdline-tools/AndroidEmulatorClient";
import type { AdbExecutor } from "./android-cmdline-tools/interfaces/AdbExecutor";
import { PlatformDeviceManager } from "./interfaces/DeviceUtils";
import { CtrlProxyClient as AndroidCtrlProxyClient } from "../features/observe/android";
import { CtrlProxyClient as IOSCtrlProxyClient } from "../features/observe/ios";
import { RealObserveScreen } from "../features/observe/ObserveScreen";
import { createPerformanceTracker } from "./PerformanceTracker";
import { storeSetupTiming } from "../server/ToolExecutionContext";
import { applyAppearanceOnConnect } from "./appearance/applyAppearanceOnConnect";

/**
 * Provider interface for device clients - enables dependency injection for testing
 */
export interface DeviceClientProvider {
  getAdb(): AdbExecutor;
  getSimctl(): SimCtlClient | undefined;
  getAndroidEmulator(): AndroidEmulatorClient | undefined;
  getDeviceUtils(): PlatformDeviceManager;
}

/**
 * Default provider that lazily creates real clients
 */
export class DefaultDeviceClientProvider implements DeviceClientProvider {
  private _adb: AdbExecutor | undefined;
  private _adbFactory: AdbClientFactory;
  private _simctl: SimCtlClient | undefined;
  private _androidEmulator: AndroidEmulatorClient | undefined;
  private _deviceUtils: PlatformDeviceManager | undefined;

  constructor(adbFactory: AdbClientFactory = defaultAdbClientFactory) {
    this._adbFactory = adbFactory;
  }

  getAdb(): AdbExecutor {
    if (!this._adb) {
      this._adb = this._adbFactory.create(null);
    }
    return this._adb;
  }

  getSimctl(): SimCtlClient | undefined {
    if (!this._simctl) {
      this._simctl = new SimCtlClient(null);
    }
    return this._simctl;
  }

  getAndroidEmulator(): AndroidEmulatorClient | undefined {
    if (!this._androidEmulator) {
      this._androidEmulator = new AndroidEmulatorClient();
    }
    return this._androidEmulator;
  }

  getDeviceUtils(): PlatformDeviceManager {
    if (!this._deviceUtils) {
      this._deviceUtils = new MultiPlatformDeviceManager(
        this.getAdb() as AdbClient,
        this.getSimctl()!,
        this.getAndroidEmulator()!
      );
    }
    return this._deviceUtils;
  }
}

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
  verifyIosDevice(deviceId: string, options?: DeviceReadyOptions): Promise<void>;

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
  findOrStartIosDevice(options?: DeviceReadyOptions): Promise<BootedDevice>;
}

export interface DeviceReadyOptions {
  skipCtrlProxyDownload?: boolean;
  /**
   * @deprecated Use skipCtrlProxyDownload instead.
   */
  skipAccessibilityDownload?: boolean;
  /**
   * @deprecated Use skipCtrlProxyDownload instead.
   */
  skipAccessibilitySetup?: boolean;
}

export class DeviceSessionManager implements DeviceSessionManager {
  private currentDevice: BootedDevice | undefined;
  private currentPlatform: Platform | undefined;
  private static instance: DeviceSessionManager;
  private static defaultProvider: DeviceClientProvider | undefined;
  private readonly provider: DeviceClientProvider;
  private readonly adbFactory: AdbClientFactory;
  private _adb: AdbExecutor | undefined;
  private window: Window | undefined;
  private simulatorAppOpened = false;

  // Track devices that have push update listeners registered
  private static pushUpdateListenersRegistered: Set<string> = new Set();

  private constructor(provider: DeviceClientProvider, adbFactory: AdbClientFactory = defaultAdbClientFactory) {
    this.provider = provider;
    this.adbFactory = adbFactory;
  }

  private get adb(): AdbExecutor {
    if (!this._adb) {
      this._adb = this.provider.getAdb();
    }
    return this._adb;
  }

  private get simctl(): SimCtlClient | undefined {
    return this.provider.getSimctl();
  }

  private get androidEmulator(): AndroidEmulatorClient | undefined {
    return this.provider.getAndroidEmulator();
  }

  private get deviceUtils(): PlatformDeviceManager {
    return this.provider.getDeviceUtils();
  }

  public static getInstance(): DeviceSessionManager {
    if (!DeviceSessionManager.instance) {
      if (!DeviceSessionManager.defaultProvider) {
        DeviceSessionManager.defaultProvider = new DefaultDeviceClientProvider();
      }
      DeviceSessionManager.instance = new DeviceSessionManager(DeviceSessionManager.defaultProvider);
    }
    return DeviceSessionManager.instance;
  }

  public static createInstance(provider: DeviceClientProvider): DeviceSessionManager {
    return new DeviceSessionManager(provider);
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
      // Update AdbClient with new device ID - need a fresh client for the new device
      this._adb = this.adbFactory.create(device);
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
    await applyAppearanceOnConnect(selectedDevice);
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
      await this.verifyIosDevice(deviceId, options);
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
      const skipCtrlProxyDownload = options?.skipCtrlProxyDownload ?? options?.skipAccessibilityDownload ?? options?.skipAccessibilitySetup;
      if (options?.skipAccessibilitySetup !== undefined) {
        if (options?.skipAccessibilityDownload !== undefined) { logger.warn("[DeviceSessionManager] skipAccessibilityDownload is deprecated; use skipCtrlProxyDownload instead."); } else { logger.warn("[DeviceSessionManager] skipAccessibilitySetup is deprecated; use skipCtrlProxyDownload instead."); }
      }

      const accessibilityClient = AndroidCtrlProxyClient.getInstance(device);
      if (accessibilityClient.isConnected()) {
        // WebSocket appears connected, but verify service is actually responsive
        // This catches cases where service crashed but socket wasn't properly closed
        logger.info(`[DeviceSessionManager] WebSocket connected for ${deviceId}, verifying service is responsive`);
        const isReady = await perf.track("verifyConnectedService", () =>
          accessibilityClient.verifyServiceReady(2, 200, 2000)
        );
        if (isReady) {
          logger.info(`[DeviceSessionManager] Accessibility service verified responsive for ${deviceId}`);
          perf.end();
          return;
        }
        // Service not responsive despite connected socket - fall through to normal flow
        logger.warn(`[DeviceSessionManager] WebSocket connected but service not responsive for ${deviceId}, checking status`);
      }

      const manager = AndroidCtrlProxyManager.getInstance(device);
      const verifyCompatibilityWhenSkipping = async (): Promise<void> => {
        const isCompatible = await manager.isVersionCompatible();
        if (isCompatible) {
          logger.info(`[DeviceSessionManager] Accessibility service version compatible for ${deviceId}`);
          return;
        }
        const errorMessage = "Accessibility service version mismatch detected. Run without skipCtrlProxyDownload to install a compatible version.";
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
          if (skipCtrlProxyDownload) {
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

      if (!isInstalled && skipCtrlProxyDownload) {
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
            if (skipCtrlProxyDownload) {
              await verifyCompatibilityWhenSkipping();
              return;
            }
            logger.info(`[DeviceSessionManager] Accessibility service enabled for ${deviceId}, verifying version compatibility`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.warn(`[DeviceSessionManager] Failed to enable accessibility service: ${errorMessage}`);
          if (skipCtrlProxyDownload) {
            return;
          }
          needsSetup = true;
        }
      }

      if (skipCtrlProxyDownload && !needsSetup) {
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
  public async verifyIosDevice(deviceId: string, options?: DeviceReadyOptions): Promise<void> {
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
      return;
    }

    if (!this.simulatorAppOpened) {
      this.simulatorAppOpened = true;
      await this.simctl!.openSimulatorApp().catch(err =>
        logger.warn(`[DeviceSessionManager] Failed to open Simulator.app: ${err}`)
      );
    }

    // Create a device object for the CtrlProxy iOS clients
    const device: BootedDevice = {
      deviceId,
      name: deviceInfo.name,
      platform: "ios"
    };

    // Always track setup timing (one-time per session, valuable for debugging)
    const perf = createPerformanceTracker(true);
    perf.serial("ensureCtrlProxy iOS");
    let didSetup = false;

    try {
      const skipCtrlProxyIOSSetup = options?.skipCtrlProxyDownload ?? options?.skipAccessibilityDownload ?? options?.skipAccessibilitySetup;

      const manager = IOSCtrlProxyManager.getInstance(device);
      const xcTestClient = IOSCtrlProxyClient.getInstance(device, manager.getServicePort());

      // Check if WebSocket is already connected
      if (xcTestClient.isConnected()) {
        // WebSocket appears connected, verify service is actually responsive
        logger.info(`[DeviceSessionManager] CtrlProxy iOS WebSocket connected for ${deviceId}, verifying service is responsive`);
        const isReady = await perf.track("verifyConnectedService", () =>
          xcTestClient.verifyServiceReady(2, 200, 2000)
        );
        if (isReady) {
          logger.info(`[DeviceSessionManager] CtrlProxy iOS verified responsive for ${deviceId}`);
          this.registerPushUpdateListener(device);
          perf.end();
          return;
        }
        // Service not responsive despite connected socket - fall through to normal flow
        logger.warn(`[DeviceSessionManager] WebSocket connected but CtrlProxy iOS not responsive for ${deviceId}, checking status`);
      }

      // Check current status
      const isRunning = await perf.track("checkRunning", () => manager.isRunning());

      if (isRunning) {
        logger.info(`[DeviceSessionManager] CtrlProxy iOS already running for ${deviceId}, verifying WebSocket connection`);
        // Service is running, try to connect WebSocket
        const connected = await perf.track("verifyConnection", () => xcTestClient.waitForConnection(3, 200));
        if (connected) {
          // Verify service is responsive and cache hierarchy for fast first observe
          logger.info(`[DeviceSessionManager] Verifying CtrlProxy iOS is responsive for ${deviceId}`);
          const ready = await perf.track("verifyServiceReady", () => xcTestClient.verifyServiceReady(3, 500, 3000));
          if (ready) {
            logger.info(`[DeviceSessionManager] CtrlProxy iOS running, connected, and verified for ${deviceId}`);
            this.registerPushUpdateListener(device);
            perf.end();
            return;
          }
          logger.warn(`[DeviceSessionManager] CtrlProxy iOS running and connected but not responsive for ${deviceId}`);
        }
        // WebSocket won't connect despite service running - may need restart
        logger.warn(`[DeviceSessionManager] CtrlProxy iOS running but WebSocket failed for ${deviceId}, will attempt restart`);
        manager.resetSetupState();
      }

      if (skipCtrlProxyIOSSetup) {
        logger.info(`[DeviceSessionManager] Skipping CtrlProxy iOS setup for ${deviceId}`);
        perf.end();
        return;
      }

      // Setup the service (will start if not running)
      logger.info(`[DeviceSessionManager] Setting up CtrlProxy iOS for ${deviceId}`);
      const setupResult = await manager.setup(false, perf);
      didSetup = true;

      if (!setupResult.success) {
        // Log build-specific errors if available
        if (setupResult.buildResult && !setupResult.buildResult.success) {
          logger.warn(`[DeviceSessionManager] CtrlProxy iOS build failed for ${deviceId}: ${setupResult.buildResult.error}`);
        } else {
          logger.warn(`[DeviceSessionManager] CtrlProxy iOS setup failed for ${deviceId}: ${setupResult.error}`);
        }
        // Don't throw - allow observe to fall back to other methods
        perf.end();
        return;
      }

      // Wait for WebSocket connection after setup
      // After fresh setup, WebSocket may need extra time to initialize
      logger.info(`[DeviceSessionManager] Waiting for CtrlProxy iOS WebSocket connection after setup for ${deviceId}`);
      const connected = await perf.track("waitForConnection", () => xcTestClient.waitForConnection(5, 1000));
      if (connected) {
        // Verify service is actually ready to respond (not just WebSocket connected)
        logger.info(`[DeviceSessionManager] Verifying CtrlProxy iOS is responsive for ${deviceId}`);
        const ready = await perf.track("verifyServiceReady", () => xcTestClient.verifyServiceReady(5, 1000, 5000));
        if (!ready) {
          logger.warn(`[DeviceSessionManager] CtrlProxy iOS not responsive after setup for ${deviceId}`);
        } else {
          logger.info(`[DeviceSessionManager] CtrlProxy iOS setup complete and verified for ${deviceId}`);
          this.registerPushUpdateListener(device);
        }
      } else {
        logger.warn(`[DeviceSessionManager] WebSocket connection failed after CtrlProxy iOS setup for ${deviceId}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[DeviceSessionManager] Failed to setup CtrlProxy iOS: ${errorMessage}`);
      // Don't throw - allow observe to fall back to other methods
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
   * Find an available device or start an emulator for the specified platform
   */
  public async findOrStartDevice(platform: Platform, options?: DeviceReadyOptions): Promise<BootedDevice> {
    if (platform === "android") {
      return await this.findOrStartAndroidDevice(options);
    } else {
      return await this.findOrStartIosDevice(options);
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
  public async findOrStartIosDevice(options?: DeviceReadyOptions): Promise<BootedDevice> {
    if (!this.simctl) {
      throw new ActionableError("iOS simulator tools not available");
    }
    const allDevices = await this.simctl.listSimulatorImages();
    allDevices.sort((a, b) => (a.deviceId || "").localeCompare(b.deviceId || ""));

    if (allDevices.length === 0) {
      throw new ActionableError(
        "No iOS simulators are available. Please create an iOS simulator using Xcode or the Simulator app."
      );
    }

    // Check for already booted simulators first
    const bootedDevices = await this.simctl.getBootedSimulators();
    bootedDevices.sort((a, b) => a.deviceId.localeCompare(b.deviceId));

    if (bootedDevices.length > 0) {
      // Use the first booted device
      const device = bootedDevices[0];
      logger.info(`[DeviceSessionManager] Selected booted iOS simulator ${device.name} (${device.deviceId})`);
      await this.verifyIosDevice(device.deviceId!, options);
      return device;
    }

    // No booted devices - boot the first available simulator
    const device = allDevices[0];
    const deviceId = device.deviceId!;
    logger.info(`[DeviceSessionManager] Booting iOS simulator ${device.name} (${deviceId})...`);

    const bootedDevice = await this.simctl!.bootSimulator(deviceId);
    await this.verifyIosDevice(deviceId, options);
    return bootedDevice;
  }

  /**
   * Register push update listener for an iOS device to clear ObserveScreen cache when UI changes.
   * This is called when CtrlProxy iOS is successfully connected.
   */
  private registerPushUpdateListener(device: BootedDevice): void {
    const deviceId = device.deviceId;
    if (DeviceSessionManager.pushUpdateListenersRegistered.has(deviceId)) {
      return; // Already registered
    }

    try {
      const manager = IOSCtrlProxyManager.getInstance(device);
      const xcTestClient = IOSCtrlProxyClient.getInstance(device, manager.getServicePort());

      xcTestClient.onPushUpdate(() => {
        logger.info(`[DeviceSessionManager] Received iOS UI change notification for ${deviceId}, clearing ObserveScreen cache`);
        RealObserveScreen.clearCache();
      });

      DeviceSessionManager.pushUpdateListenersRegistered.add(deviceId);
      logger.info(`[DeviceSessionManager] Registered push update listener for ${deviceId}`);
    } catch (error) {
      logger.warn(`[DeviceSessionManager] Failed to register push update listener for ${deviceId}: ${error}`);
    }
  }
}
