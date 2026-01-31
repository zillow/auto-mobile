import { EventEmitter } from "events";
import { AdbClientFactory, defaultAdbClientFactory } from "./android-cmdline-tools/AdbClientFactory";
import { logger } from "./logger";
import { BootedDevice } from "../models";

/**
 * Interface for AppLifecycleMonitor
 * Enables type-safe mocking and dependency injection
 */
export interface AppLifecycleMonitor {
  /**
   * Add a package to track for lifecycle events
   */
  trackPackage(device: BootedDevice, packageName: string): Promise<void>;

  /**
   * Remove a package from tracking
   */
  untrackPackage(device: BootedDevice, packageName: string): Promise<void>;

  /**
   * Get all tracked packages
   */
  getTrackedPackages(): string[];

  /**
   * Check if a specific package is currently running
   */
  isPackageRunning(device: BootedDevice, packageName: string): Promise<boolean>;

  /**
   * Get list of currently running tracked packages
   */
  getRunningPackages(): string[];

  /**
   * Poll for app state changes
   */
  checkForChanges(device: BootedDevice): Promise<void>;
}

export interface AppLifecycleEvent {
    type: "launch" | "terminate" | "background" | "foreground" | "crash";
    device: BootedDevice;
    appId: string;
    timestamp: Date;
    previousApp?: string;
    metadata?: Record<string, any>;
}

export interface AppLifecycleEventListener {
    (event: AppLifecycleEvent): Promise<void>;
}

export class AppLifecycleMonitor extends EventEmitter implements AppLifecycleMonitor {
  private trackedPackages: Set<string> = new Set();
  private runningPackages: Set<string> = new Set();
  private adbFactory: AdbClientFactory;
  private static instance: AppLifecycleMonitor;

  /**
   * Constructor for AppLifecycleMonitor
   * @param adbFactory - Optional injected AdbClientFactory for dependency injection. Defaults to defaultAdbClientFactory.
   */
  constructor(adbFactory: AdbClientFactory = defaultAdbClientFactory) {
    super();
    this.adbFactory = adbFactory;
  }

  public static getInstance(): AppLifecycleMonitor {
    if (!AppLifecycleMonitor.instance) {
      AppLifecycleMonitor.instance = new AppLifecycleMonitor();
    }
    return AppLifecycleMonitor.instance;
  }

  /**
   * Add a package to track for lifecycle events
   */
  public async trackPackage(device: BootedDevice, packageName: string) {
    this.trackedPackages.add(packageName);
    await this.checkForChanges(device);
    logger.info(`Now tracking package: ${packageName}`);
  }

  /**
   * Remove a package from tracking
   */
  public async untrackPackage(device: BootedDevice, packageName: string) {
    this.trackedPackages.delete(packageName);
    this.runningPackages.delete(packageName);
    await this.checkForChanges(device);
    logger.info(`Stopped tracking package: ${packageName}`);
  }

  /**
   * Get all tracked packages
   */
  public getTrackedPackages(): string[] {
    return Array.from(this.trackedPackages);
  }

  /**
   * Check if a specific package is currently running
   */
  public async isPackageRunning(device: BootedDevice, packageName: string): Promise<boolean> {
    try {
      // Create ADB client for this device
      const adb = this.adbFactory.create(device);
      const result = await adb.executeCommand(`shell pidof ${packageName}`);

      // pidof returns empty stdout if package is not running
      return result.stdout.trim().length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get list of currently running tracked packages
   */
  public getRunningPackages(): string[] {
    return Array.from(this.runningPackages);
  }

  /**
     * Add event listener for specific event types
     */
  public addEventListener(type: string, listener: AppLifecycleEventListener): void {
    this.on(type, listener);
  }

  /**
     * Remove event listener
     */
  public removeEventListener(type: string, listener: AppLifecycleEventListener): void {
    this.off(type, listener);
  }

  /**
   * Poll for app state changes
   */
  public async checkForChanges(device: BootedDevice): Promise<void> {

    const previousRunning = new Set(this.runningPackages);
    await this.updateRunningPackages(device);

    // Check for newly launched packages
    for (const packageName of this.runningPackages) {
      if (!previousRunning.has(packageName)) {
        await this.handlePackageLaunched(device, packageName);
      }
    }

    // Check for terminated packages
    for (const packageName of previousRunning) {
      if (!this.runningPackages.has(packageName)) {
        await this.handlePackageTerminated(device, packageName);
      }
    }
  }

  /**
   * Update the set of currently running tracked packages
   */
  private async updateRunningPackages(device: BootedDevice) {
    for (const packageName of this.trackedPackages) {
      if (await this.isPackageRunning(device, packageName)) {
        this.runningPackages.add(packageName);
      } else {
        this.runningPackages.delete(packageName);
      }
    }
  }

  /**
   * Handle package launch event
   */
  private async handlePackageLaunched(device: BootedDevice, packageName: string): Promise<void> {
    const event: AppLifecycleEvent = {
      type: "launch",
      device: device,
      appId: packageName,
      timestamp: new Date(),
      metadata: {
        detectionMethod: "pidof"
      }
    };

    logger.info(`Package launched: ${packageName}`);
    await this.emitEvent(event);
  }

  /**
   * Handle package termination event
   */
  private async handlePackageTerminated(device: BootedDevice, packageName: string): Promise<void> {
    const event: AppLifecycleEvent = {
      type: "terminate",
      device: device,
      appId: packageName,
      timestamp: new Date(),
      metadata: {
        detectionMethod: "pidof"
      }
    };

    logger.info(`Package terminated: ${packageName}`);
    await this.emitEvent(event);
  }

  /**
     * Emit an app lifecycle event
     */
  private async emitEvent(event: AppLifecycleEvent): Promise<void> {
    try {
      this.emit(event.type, event);
    } catch (error) {
      logger.error(`Error emitting app lifecycle event: ${error}`);
    }
  }
}
