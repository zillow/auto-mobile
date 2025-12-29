import { AppLifecycleMonitor } from "../AppLifecycleMonitor";
import { AdbClient } from "../android-cmdline-tools/AdbClient";
import { AdbExecutor } from "../android-cmdline-tools/interfaces/AdbExecutor";
import { logger } from "../logger";

/**
 * Factory for creating and managing AppLifecycleMonitor instances
 * Provides dependency injection and singleton pattern management
 * Enables better testability and performance by reducing AdbClient instantiation
 */
export class AppLifecycleMonitorFactory {
  private static instance: AppLifecycleMonitor | null = null;
  private static injectedAdb: AdbExecutor | null = null;

  /**
   * Set the AdbClient instance to inject into AppLifecycleMonitor
   * Useful for testing with mock ADB executors
   * @param adb - The AdbExecutor instance to use (typically a fake for testing)
   */
  public static setAdbClient(adb: AdbExecutor): void {
    AppLifecycleMonitorFactory.injectedAdb = adb;
    logger.debug("AppLifecycleMonitor: Injected custom AdbClient instance");

    // Reset instance to force recreation with new ADB utils
    AppLifecycleMonitorFactory.instance = null;
  }

  /**
   * Get the singleton instance of AppLifecycleMonitor
   * Injects the previously set AdbClient, or creates a default one if none was set
   * @returns The AppLifecycleMonitor instance
   */
  public static getInstance(): AppLifecycleMonitor {
    if (!AppLifecycleMonitorFactory.instance) {
      // Use injected ADB or create a default one
      const adb = AppLifecycleMonitorFactory.injectedAdb || new AdbClient();
      AppLifecycleMonitorFactory.instance = new AppLifecycleMonitor(adb);
      logger.debug("AppLifecycleMonitor: Created new instance with " +
        (AppLifecycleMonitorFactory.injectedAdb ? "injected" : "default") + " AdbClient");
    }
    return AppLifecycleMonitorFactory.instance;
  }

  /**
   * Reset the factory state
   * Clears both the cached instance and injected ADB utils
   * Should be called in test teardown or when switching testing modes
   */
  public static reset(): void {
    AppLifecycleMonitorFactory.instance = null;
    AppLifecycleMonitorFactory.injectedAdb = null;
    logger.debug("AppLifecycleMonitor: Factory reset");
  }
}
