import { DeviceSessionManager } from "../DeviceSessionManager";
import { AdbClient } from "../android-cmdline-tools/AdbClient";
import { MultiPlatformDeviceManager } from "../deviceUtils";
import { AdbExecutor } from "../android-cmdline-tools/interfaces/AdbExecutor";
import { PlatformDeviceManager } from "../interfaces/DeviceUtils";
import { logger } from "../logger";

/**
 * Factory for creating and managing DeviceSessionManager instances
 * Provides dependency injection and singleton pattern management
 * Enables better testability and performance by reducing AdbClient and DeviceUtils instantiation
 */
export class DeviceSessionManagerFactory {
  private static instance: DeviceSessionManager | null = null;
  private static injectedAdbExecutor: AdbExecutor | null = null;
  private static injectedDeviceUtils: PlatformDeviceManager | null = null;

  /**
   * Set the AdbExecutor instance to inject into DeviceSessionManager
   * Useful for testing with mock ADB executors
   * @param adb - The AdbExecutor instance to use (typically a fake for testing)
   */
  public static setAdbExecutor(adb: AdbExecutor): void {
    DeviceSessionManagerFactory.injectedAdbExecutor = adb;
    logger.debug("DeviceSessionManager: Injected custom AdbExecutor instance");

    // Reset instance to force recreation with new ADB executor
    DeviceSessionManagerFactory.instance = null;
  }

  /**
   * Set the DeviceUtils instance to inject into DeviceSessionManager
   * Useful for testing with mock device utilities
   * @param utils - The DeviceUtils instance to use (typically a fake for testing)
   */
  public static setDeviceUtils(utils: PlatformDeviceManager): void {
    DeviceSessionManagerFactory.injectedDeviceUtils = utils;
    logger.debug("DeviceSessionManager: Injected custom DeviceUtils instance");

    // Reset instance to force recreation with new DeviceUtils
    DeviceSessionManagerFactory.instance = null;
  }

  /**
   * Get the singleton instance of DeviceSessionManager
   * Injects the previously set AdbExecutor and DeviceUtils, or creates defaults if none were set
   * @returns The DeviceSessionManager instance
   */
  public static getInstance(): DeviceSessionManager {
    if (!DeviceSessionManagerFactory.instance) {
      // Use injected dependencies or create defaults
      const adb = DeviceSessionManagerFactory.injectedAdbExecutor || new AdbClient();
      const deviceUtils = DeviceSessionManagerFactory.injectedDeviceUtils ||
        new MultiPlatformDeviceManager(adb as any, null, null);

      DeviceSessionManagerFactory.instance = DeviceSessionManager.createInstance(adb, deviceUtils);
      logger.debug("DeviceSessionManager: Created new instance with " +
        (DeviceSessionManagerFactory.injectedAdbExecutor ? "injected" : "default") + " AdbExecutor and " +
        (DeviceSessionManagerFactory.injectedDeviceUtils ? "injected" : "default") + " DeviceUtils");
    }
    return DeviceSessionManagerFactory.instance;
  }

  /**
   * Reset the factory state
   * Clears both the cached instance and injected dependencies
   * Should be called in test teardown or when switching testing modes
   */
  public static reset(): void {
    DeviceSessionManagerFactory.instance = null;
    DeviceSessionManagerFactory.injectedAdbExecutor = null;
    DeviceSessionManagerFactory.injectedDeviceUtils = null;
    logger.debug("DeviceSessionManager: Factory reset");
  }
}
