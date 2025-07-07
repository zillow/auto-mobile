import { ActionableError } from "../models/ActionableError";
import { EmulatorUtils } from "./emulator";
import { AdbUtils } from "./adb";
import { Window } from "../features/observe/Window";
import { logger } from "./logger";
import { TestAuthoringManager } from "./testAuthoringManager";

export class DeviceSessionManager {
  private currentDeviceId: string | undefined;
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
     * Set the current device ID
     */
  public setCurrentDeviceId(deviceId: string | undefined): void {
    this.currentDeviceId = deviceId;
    // Update AdbUtils with new device ID
    this.adbUtils = new AdbUtils(deviceId || null);
    // Reset window when device changes
    this.window = undefined;
    // Update test authoring manager with new device ID
    this.testAuthoringManager.setDeviceId(deviceId);
  }

  /**
     * Ensure a device is ready and return its ID
     * If no device is currently set and none is provided, it will:
     * 1. Check for connected devices
     * 2. Start an emulator if no devices are found
     * 3. Use the first available device
     */
  public async ensureDeviceReady(providedDeviceId?: string, failIfNoDevice: boolean = false): Promise<string> {
    // If a specific device is provided, use it
    if (providedDeviceId) {
      await this.verifyDevice(providedDeviceId);
      this.setCurrentDeviceId(providedDeviceId);
      return providedDeviceId;
    }

    // If we have a current device, verify it's still ready
    if (this.currentDeviceId) {
      try {
        await this.verifyDevice(this.currentDeviceId);
        return this.currentDeviceId;
      } catch (error) {
        logger.warn(`Current device ${this.currentDeviceId} is no longer ready: ${error}`);
        this.currentDeviceId = undefined;
      }
    }

    if (failIfNoDevice) {
      throw new ActionableError("No device is currently set and none was provided.");
    }

    // No device set - find or start one
    const deviceId = await this.findOrStartDevice();
    this.setCurrentDeviceId(deviceId);
    return deviceId;
  }

  /**
     * Verify a specific device is connected and ready
     */
  private async verifyDevice(deviceId: string): Promise<void> {
    const allDevices = await this.adbUtils.getDevices();

    if (!allDevices.includes(deviceId)) {
      throw new ActionableError(
        `Device ${deviceId} is not connected. Available devices: ${allDevices.join(", ") || "none"}`
      );
    }

    // Check if we can get an active window from the device
    try {
      logger.info(`[DeviceSessionManager] Verifying device ${deviceId} readiness`);

      if (!this.window || this.window.getDeviceId() !== deviceId) {
        this.window = new Window(deviceId);
      }

      let activeWindow = await this.window.getActive();
      if (!activeWindow || !activeWindow.appId || !activeWindow.activityName) {
        activeWindow = await this.window.getActive(true);
        if (!activeWindow || !activeWindow.appId || !activeWindow.activityName) {
          logger.warn(`[DeviceSessionManager] Device ${deviceId} is not fully ready`);
          if (activeWindow) {
            logger.warn(`[DeviceSessionManager] activeWindow.appId: ${activeWindow.appId} | activeWindow.activityName: ${activeWindow.activityName}`);
          } else {
            logger.warn(`[DeviceSessionManager] activeWindow: ${activeWindow}`);
          }
          throw new ActionableError(
            `Cannot get active window information from device ${deviceId}. The device may not be fully booted or is in an unusual state.`
          );
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new ActionableError(
        `Failed to verify device ${deviceId} readiness: ${errorMessage}`
      );
    }
  }

  /**
     * Find an available device or start an emulator
     */
  private async findOrStartDevice(): Promise<string> {
    const allDevices = await this.adbUtils.getDevices();

    if (allDevices.length > 0) {
      // Use the first available device
      const deviceId = allDevices[0];
      await this.verifyDevice(deviceId);
      return deviceId;
    }

    // No devices - try to start an emulator
    const availableAvds = await this.emulatorUtils.listAvds();

    if (availableAvds.length === 0) {
      throw new ActionableError(
        "No devices are connected and no Android Virtual Devices (AVDs) are available. Please connect a physical device or create an AVD first."
      );
    }

    // Start the first available AVD
    const avdName = availableAvds[0];
    logger.info(`Starting emulator ${avdName}...`);
    await this.emulatorUtils.startEmulator(avdName, []);

    // Wait for the emulator to fully boot and get its device ID
    const newDeviceId = await this.emulatorUtils.waitForEmulatorReady(avdName);

    if (!newDeviceId) {
      throw new ActionableError(
        `Failed to start emulator ${avdName}.`
      );
    }

    await this.verifyDevice(newDeviceId);
    return newDeviceId;
  }

  /**
     * Clear the current device session
     */
  public clearSession(): void {
    this.currentDeviceId = undefined;
    this.window = undefined;
    this.adbUtils = new AdbUtils(null);
    // Clear device from test authoring manager
    this.testAuthoringManager.setDeviceId(undefined);
  }
}
