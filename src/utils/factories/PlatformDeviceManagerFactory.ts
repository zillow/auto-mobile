import { MultiPlatformDeviceManager } from "../deviceUtils";
import { AdbClient } from "../android-cmdline-tools/AdbClient";
import { AdbExecutor } from "../android-cmdline-tools/interfaces/AdbExecutor";
import { PlatformDeviceManager } from "../interfaces/DeviceUtils";
import { logger } from "../logger";

/**
 * Factory for creating and managing PlatformDeviceManager instances
 * Provides dependency injection and lazy initialization
 * Enables better testability by avoiding module-level instantiation
 */
export class PlatformDeviceManagerFactory {
  private static instance: PlatformDeviceManager | null = null;
  private static injectedManager: PlatformDeviceManager | null = null;
  private static injectedAdbExecutor: AdbExecutor | null = null;

  /**
   * Set the PlatformDeviceManager instance to inject
   * Useful for testing with mock device managers
   * @param manager - The PlatformDeviceManager instance to use (typically a fake for testing)
   */
  public static setInstance(manager: PlatformDeviceManager | null): void {
    PlatformDeviceManagerFactory.injectedManager = manager;
    // Reset cached instance to force recreation
    PlatformDeviceManagerFactory.instance = null;
    logger.debug("PlatformDeviceManagerFactory: Injected custom instance");
  }

  /**
   * Set the AdbExecutor instance to inject when creating a new manager
   * Useful for testing with mock ADB executors
   * @param adb - The AdbExecutor instance to use (typically a fake for testing)
   */
  public static setAdbExecutor(adb: AdbExecutor | null): void {
    PlatformDeviceManagerFactory.injectedAdbExecutor = adb;
    // Reset cached instance to force recreation with new executor
    PlatformDeviceManagerFactory.instance = null;
    logger.debug("PlatformDeviceManagerFactory: Injected custom AdbExecutor");
  }

  /**
   * Get the singleton instance of PlatformDeviceManager
   * Uses injected instance if set, otherwise lazily creates a default
   * @returns The PlatformDeviceManager instance
   */
  public static getInstance(): PlatformDeviceManager {
    if (!PlatformDeviceManagerFactory.instance) {
      if (PlatformDeviceManagerFactory.injectedManager) {
        PlatformDeviceManagerFactory.instance = PlatformDeviceManagerFactory.injectedManager;
        logger.debug("PlatformDeviceManagerFactory: Using injected instance");
      } else {
        // Create default with injected or real AdbExecutor
        const adb = PlatformDeviceManagerFactory.injectedAdbExecutor || new AdbClient();
        PlatformDeviceManagerFactory.instance = new MultiPlatformDeviceManager(adb as any, null, null);
        logger.debug("PlatformDeviceManagerFactory: Created new instance with " +
          (PlatformDeviceManagerFactory.injectedAdbExecutor ? "injected" : "default") + " AdbExecutor");
      }
    }
    return PlatformDeviceManagerFactory.instance;
  }

  /**
   * Reset the factory state
   * Clears both the cached instance and injected dependencies
   * Should be called in test teardown
   */
  public static reset(): void {
    PlatformDeviceManagerFactory.instance = null;
    PlatformDeviceManagerFactory.injectedManager = null;
    PlatformDeviceManagerFactory.injectedAdbExecutor = null;
    logger.debug("PlatformDeviceManagerFactory: Factory reset");
  }
}
