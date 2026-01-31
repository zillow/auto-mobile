import { DeviceSessionManager } from "../DeviceSessionManager";
import { MultiPlatformDeviceManager } from "../deviceUtils";
import { AdbClientFactory, defaultAdbClientFactory } from "../android-cmdline-tools/AdbClientFactory";
import { PlatformDeviceManager } from "../interfaces/DeviceUtils";
import { logger } from "../logger";

/**
 * Factory for creating and managing DeviceSessionManager instances
 * Provides dependency injection and singleton pattern management
 * Enables better testability and performance by reducing AdbClient and DeviceUtils instantiation
 */
export class DeviceSessionManagerFactory {
  private static instance: DeviceSessionManager | null = null;
  private static injectedAdbFactory: AdbClientFactory | null = null;
  private static injectedDeviceUtils: PlatformDeviceManager | null = null;

  /**
   * Set the AdbClientFactory instance to inject into DeviceSessionManager
   * Useful for testing with mock ADB factories
   * @param factory - The AdbClientFactory instance to use (typically a fake for testing)
   */
  public static setAdbFactory(factory: AdbClientFactory): void {
    DeviceSessionManagerFactory.injectedAdbFactory = factory;
    logger.debug("DeviceSessionManager: Injected custom AdbClientFactory instance");

    // Reset instance to force recreation with new ADB factory
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
      const adbFactory = DeviceSessionManagerFactory.injectedAdbFactory ?? defaultAdbClientFactory;
      const adb = adbFactory.create();
      const deviceUtils = DeviceSessionManagerFactory.injectedDeviceUtils ||
        new MultiPlatformDeviceManager(adb as any, null, null);

      DeviceSessionManagerFactory.instance = DeviceSessionManager.createInstance(adb, deviceUtils);
      logger.debug("DeviceSessionManager: Created new instance with " +
        (DeviceSessionManagerFactory.injectedAdbFactory ? "injected" : "default") + " AdbClientFactory and " +
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
    DeviceSessionManagerFactory.injectedAdbFactory = null;
    DeviceSessionManagerFactory.injectedDeviceUtils = null;
    logger.debug("DeviceSessionManager: Factory reset");
  }
}
