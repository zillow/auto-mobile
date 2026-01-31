import { MultiPlatformDeviceManager } from "../deviceUtils";
import { AdbClientFactory, defaultAdbClientFactory } from "../android-cmdline-tools/AdbClientFactory";
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
  private static injectedAdbFactory: AdbClientFactory | null = null;

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
   * Set the AdbClientFactory instance to inject when creating a new manager
   * Useful for testing with mock ADB factories
   * @param factory - The AdbClientFactory instance to use (typically a fake for testing)
   */
  public static setAdbFactory(factory: AdbClientFactory | null): void {
    PlatformDeviceManagerFactory.injectedAdbFactory = factory;
    // Reset cached instance to force recreation with new factory
    PlatformDeviceManagerFactory.instance = null;
    logger.debug("PlatformDeviceManagerFactory: Injected custom AdbClientFactory");
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
        // Create default with injected or default AdbClientFactory
        const adbFactory = PlatformDeviceManagerFactory.injectedAdbFactory ?? defaultAdbClientFactory;
        const adb = adbFactory.create();
        PlatformDeviceManagerFactory.instance = new MultiPlatformDeviceManager(adb as any, null, null);
        logger.debug("PlatformDeviceManagerFactory: Created new instance with " +
          (PlatformDeviceManagerFactory.injectedAdbFactory ? "injected" : "default") + " AdbClientFactory");
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
    PlatformDeviceManagerFactory.injectedAdbFactory = null;
    logger.debug("PlatformDeviceManagerFactory: Factory reset");
  }
}
