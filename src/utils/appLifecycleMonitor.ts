import { EventEmitter } from "events";
import { AdbUtils } from "./adb";
import { logger } from "./logger";

export interface AppLifecycleEvent {
    type: "launch" | "terminate" | "background" | "foreground" | "crash";
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
  private monitoringActive: boolean = false;
  private pollingInterval?: NodeJS.Timeout;
  private pollingIntervalMs: number = 1000; // 1 second
  private deviceId?: string;

  constructor(deviceId?: string) {
    super();
    this.deviceId = deviceId;
  }

  /**
   * Add a package to track for lifecycle events
   */
  public trackPackage(packageName: string): void {
    this.trackedPackages.add(packageName);
    logger.info(`Now tracking package: ${packageName}`);
  }

  /**
   * Remove a package from tracking
   */
  public untrackPackage(packageName: string): void {
    this.trackedPackages.delete(packageName);
    this.runningPackages.delete(packageName);
    logger.info(`Stopped tracking package: ${packageName}`);
  }

  /**
   * Get all tracked packages
   */
  public getTrackedPackages(): string[] {
    return Array.from(this.trackedPackages);
  }

  /**
     * Start monitoring app lifecycle events
     */
  public async startMonitoring(): Promise<void> {
    if (this.monitoringActive) {
      logger.warn("App lifecycle monitoring is already active");
      return;
    }

    logger.info("Starting app lifecycle monitoring");
    this.monitoringActive = true;

    // Get initial state of tracked packages
    try {
      await this.updateRunningPackages();
      logger.info(`Initial running packages: ${Array.from(this.runningPackages).join(", ")}`);
    } catch (error) {
      logger.warn(`Failed to detect initial running packages: ${error}`);
    }

    // Start polling for changes
    this.pollingInterval = setInterval(async () => {
      try {
        await this.pollForChanges();
      } catch (error) {
        logger.error(`Error during app lifecycle polling: ${error}`);
      }
    }, this.pollingIntervalMs);

    logger.info("App lifecycle monitoring started");
  }

  /**
     * Stop monitoring app lifecycle events
     */
  public async stopMonitoring(): Promise<void> {
    if (!this.monitoringActive) {
      return;
    }

    logger.info("Stopping app lifecycle monitoring");
    this.monitoringActive = false;

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
    }

    logger.info("App lifecycle monitoring stopped");
  }

  /**
   * Check if a specific package is currently running
   */
  public async isPackageRunning(packageName: string): Promise<boolean> {
    try {
      const adbUtils = new AdbUtils(this.deviceId ?? null);
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
   * Set polling interval in milliseconds
   */
  public setPollingInterval(intervalMs: number): void {
    this.pollingIntervalMs = intervalMs;
    if (this.monitoringActive && this.pollingInterval) {
      // Restart polling with new interval
      clearInterval(this.pollingInterval);
      this.pollingInterval = setInterval(async () => {
        try {
          await this.pollForChanges();
        } catch (error) {
          logger.error(`Error during app lifecycle polling: ${error}`);
        }
      }, this.pollingIntervalMs);
    }
  }

  /**
   * Poll for app state changes
   */
  private async pollForChanges(): Promise<void> {
    if (!this.monitoringActive) {
      return;
    }

    const previousRunning = new Set(this.runningPackages);
    await this.updateRunningPackages();

    // Check for newly launched packages
    for (const packageName of this.runningPackages) {
      if (!previousRunning.has(packageName)) {
        await this.handlePackageLaunched(packageName);
      }
    }

    // Check for terminated packages
    for (const packageName of previousRunning) {
      if (!this.runningPackages.has(packageName)) {
        await this.handlePackageTerminated(packageName);
      }
    }
  }

  /**
   * Update the set of currently running tracked packages
   */
  private async updateRunningPackages(): Promise<void> {
    for (const packageName of this.trackedPackages) {
      if (await this.isPackageRunning(packageName)) {
        this.runningPackages.add(packageName);
      } else {
        this.runningPackages.delete(packageName);
      }
    }
  }

  /**
   * Handle package launch event
   */
  private async handlePackageLaunched(packageName: string): Promise<void> {
    const event: AppLifecycleEvent = {
      type: "launch",
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
  private async handlePackageTerminated(packageName: string): Promise<void> {
    const event: AppLifecycleEvent = {
      type: "terminate",
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

  /**
     * Check if monitoring is active
     */
  public isMonitoring(): boolean {
    return this.monitoringActive;
  }

  /**
     * Set device ID for ADB operations
     */
  public setDeviceId(deviceId?: string): void {
    this.deviceId = deviceId;
  }
}
