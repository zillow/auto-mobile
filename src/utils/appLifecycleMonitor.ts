import { EventEmitter } from "events";
import { AdbUtils } from "./adb";
import { logger } from "./logger";

export interface AppLifecycleEvent {
    type: "launch" | "terminate" | "background" | "foreground" | "crash";
    deviceId: string;
    appId: string;
    timestamp: Date;
    previousApp?: string;
    metadata?: Record<string, any>;
}

export interface AppLifecycleEventListener {
    (event: AppLifecycleEvent): Promise<void>;
}

export class AppLifecycleMonitor extends EventEmitter {
  private trackedPackages: Set<string> = new Set();
  private runningPackages: Set<string> = new Set();
  private static instance: AppLifecycleMonitor;

  private constructor() {
    super();
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
  public async trackPackage(deviceId: string, packageName: string) {
    this.trackedPackages.add(packageName);
    await this.checkForChanges(deviceId);
    logger.info(`Now tracking package: ${packageName}`);
  }

  /**
   * Remove a package from tracking
   */
  public async untrackPackage(deviceId: string, packageName: string) {
    this.trackedPackages.delete(packageName);
    this.runningPackages.delete(packageName);
    await this.checkForChanges(deviceId);
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
  public async isPackageRunning(deviceId: string, packageName: string): Promise<boolean> {
    try {
      const adbUtils = new AdbUtils(deviceId);
      const result = await adbUtils.executeCommand(`shell pidof ${packageName}`);

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
  public async checkForChanges(deviceId: string): Promise<void> {

    const previousRunning = new Set(this.runningPackages);
    await this.updateRunningPackages(deviceId);

    // Check for newly launched packages
    for (const packageName of this.runningPackages) {
      if (!previousRunning.has(packageName)) {
        await this.handlePackageLaunched(deviceId, packageName);
      }
    }

    // Check for terminated packages
    for (const packageName of previousRunning) {
      if (!this.runningPackages.has(packageName)) {
        await this.handlePackageTerminated(deviceId, packageName);
      }
    }
  }

  /**
   * Update the set of currently running tracked packages
   */
  private async updateRunningPackages(deviceId: string) {
    for (const packageName of this.trackedPackages) {
      if (await this.isPackageRunning(deviceId, packageName)) {
        this.runningPackages.add(packageName);
      } else {
        this.runningPackages.delete(packageName);
      }
    }
  }

  /**
   * Handle package launch event
   */
  private async handlePackageLaunched(deviceId: string, packageName: string): Promise<void> {
    const event: AppLifecycleEvent = {
      type: "launch",
      deviceId: deviceId,
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
  private async handlePackageTerminated(deviceId: string, packageName: string): Promise<void> {
    const event: AppLifecycleEvent = {
      type: "terminate",
      deviceId: deviceId,
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
