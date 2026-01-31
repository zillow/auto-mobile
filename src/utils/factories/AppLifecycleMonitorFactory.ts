import { AppLifecycleMonitor } from "../AppLifecycleMonitor";
import { AdbClientFactory, defaultAdbClientFactory } from "../android-cmdline-tools/AdbClientFactory";
import { logger } from "../logger";

/**
 * Factory for creating and managing AppLifecycleMonitor instances
 * Provides dependency injection and singleton pattern management
 * Enables better testability and performance by reducing AdbClient instantiation
 */
export class AppLifecycleMonitorFactory {
  private static instance: AppLifecycleMonitor | null = null;
  private static injectedAdbFactory: AdbClientFactory | null = null;

  /**
   * Set the AdbClientFactory instance to inject into AppLifecycleMonitor
   * Useful for testing with mock ADB factories
   * @param factory - The AdbClientFactory instance to use (typically a fake for testing)
   */
  public static setAdbFactory(factory: AdbClientFactory): void {
    AppLifecycleMonitorFactory.injectedAdbFactory = factory;
    logger.debug("AppLifecycleMonitor: Injected custom AdbClientFactory instance");

    // Reset instance to force recreation with new ADB factory
    AppLifecycleMonitorFactory.instance = null;
  }

  /**
   * Get the singleton instance of AppLifecycleMonitor
   * Injects the previously set AdbClientFactory, or uses default if none was set
   * @returns The AppLifecycleMonitor instance
   */
  public static getInstance(): AppLifecycleMonitor {
    if (!AppLifecycleMonitorFactory.instance) {
      // Use injected ADB factory or default
      const adbFactory = AppLifecycleMonitorFactory.injectedAdbFactory ?? defaultAdbClientFactory;
      AppLifecycleMonitorFactory.instance = new AppLifecycleMonitor(adbFactory);
      logger.debug("AppLifecycleMonitor: Created new instance with " +
        (AppLifecycleMonitorFactory.injectedAdbFactory ? "injected" : "default") + " AdbClientFactory");
    }
    return AppLifecycleMonitorFactory.instance;
  }

  /**
   * Reset the factory state
   * Clears both the cached instance and injected ADB factory
   * Should be called in test teardown or when switching testing modes
   */
  public static reset(): void {
    AppLifecycleMonitorFactory.instance = null;
    AppLifecycleMonitorFactory.injectedAdbFactory = null;
    logger.debug("AppLifecycleMonitor: Factory reset");
  }
}
