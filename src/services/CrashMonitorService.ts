import type { BootedDevice } from "../models";
import type { AdbExecutor } from "../utils/android-cmdline-tools/interfaces/AdbExecutor";
import type { Timer } from "../utils/SystemTimer";
import type { CrashEvent, AnrEvent } from "../utils/interfaces/CrashMonitor";
import { CrashMonitorCoordinator } from "../utils/crash/CrashMonitorCoordinator";
import { getFailureEventRepository } from "../db/failureEventRepository";
import { defaultTimer } from "../utils/SystemTimer";
import { logger } from "../utils/logger";

/**
 * Service that manages always-on crash monitoring.
 * Automatically starts monitoring when a device and package are set,
 * and persists detected crashes/ANRs to the database.
 */
export class CrashMonitorService {
  private static instance: CrashMonitorService | null = null;

  private coordinator: CrashMonitorCoordinator;
  private timer: Timer;
  private currentDevice: BootedDevice | null = null;
  private currentPackage: string | null = null;
  private currentNavigationNodeId: number | null = null;
  private currentTestExecutionId: number | null = null;
  private sessionUuid: string | null = null;
  private started = false;

  /**
   * Dependencies for testing
   */
  constructor(options: {
    adb?: AdbExecutor;
    timer?: Timer;
    coordinator?: CrashMonitorCoordinator;
  } = {}) {
    this.timer = options.timer ?? defaultTimer;
    this.coordinator = options.coordinator ?? new CrashMonitorCoordinator({
      adb: options.adb,
      timer: this.timer,
    });

    // Subscribe to crash/ANR events for persistence
    this.coordinator.addCrashListener(this.handleCrash.bind(this));
    this.coordinator.addAnrListener(this.handleAnr.bind(this));
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): CrashMonitorService {
    if (!CrashMonitorService.instance) {
      CrashMonitorService.instance = new CrashMonitorService();
    }
    return CrashMonitorService.instance;
  }

  /**
   * Reset the singleton (for testing)
   */
  static resetInstance(): void {
    if (CrashMonitorService.instance) {
      void CrashMonitorService.instance.stop();
      CrashMonitorService.instance = null;
    }
  }

  /**
   * Start monitoring for a device and package
   */
  async start(
    device: BootedDevice,
    packageName: string,
    options: {
      sessionUuid?: string;
      navigationNodeId?: number;
      testExecutionId?: number;
    } = {}
  ): Promise<void> {
    // Stop existing monitoring if different target
    if (
      this.started &&
      (this.currentDevice?.deviceId !== device.deviceId ||
        this.currentPackage !== packageName)
    ) {
      await this.stop();
    }

    this.currentDevice = device;
    this.currentPackage = packageName;
    this.sessionUuid = options.sessionUuid ?? null;
    this.currentNavigationNodeId = options.navigationNodeId ?? null;
    this.currentTestExecutionId = options.testExecutionId ?? null;

    if (!this.started) {
      await this.coordinator.start(device, packageName, {
        sessionUuid: this.sessionUuid ?? undefined,
        pollingIntervalMs: 1000,
      });
      this.started = true;

      logger.info(
        `[CrashMonitorService] Started monitoring ${packageName} on ${device.deviceId}`
      );
    }

    // Update context on coordinator
    this.coordinator.setCurrentNavigationNodeId(this.currentNavigationNodeId);
    this.coordinator.setCurrentTestExecutionId(this.currentTestExecutionId);
  }

  /**
   * Stop monitoring
   */
  async stop(): Promise<void> {
    if (this.started) {
      await this.coordinator.stop();
      this.started = false;
      this.currentDevice = null;
      this.currentPackage = null;

      logger.info("[CrashMonitorService] Stopped monitoring");
    }
  }

  /**
   * Update the current navigation node ID for crash correlation
   */
  setNavigationNodeId(nodeId: number | null): void {
    this.currentNavigationNodeId = nodeId;
    if (this.started) {
      this.coordinator.setCurrentNavigationNodeId(nodeId);
    }
  }

  /**
   * Update the current test execution ID for crash correlation
   */
  setTestExecutionId(executionId: number | null): void {
    this.currentTestExecutionId = executionId;
    if (this.started) {
      this.coordinator.setCurrentTestExecutionId(executionId);
    }
  }

  /**
   * Update the session UUID
   */
  setSessionUuid(sessionUuid: string | null): void {
    this.sessionUuid = sessionUuid;
  }

  /**
   * Get all crashes detected in the current session
   */
  getCrashes(): CrashEvent[] {
    return this.coordinator.getCrashes();
  }

  /**
   * Get all ANRs detected in the current session
   */
  getAnrs(): AnrEvent[] {
    return this.coordinator.getAnrs();
  }

  /**
   * Check if monitoring is active
   */
  isMonitoring(): boolean {
    return this.started;
  }

  /**
   * Get the currently monitored package
   */
  getMonitoredPackage(): string | null {
    return this.currentPackage;
  }

  /**
   * Get the currently monitored device
   */
  getMonitoredDevice(): BootedDevice | null {
    return this.currentDevice;
  }

  /**
   * Called when a foreground app changes - auto-starts monitoring
   */
  async onForegroundAppChanged(
    device: BootedDevice,
    packageName: string
  ): Promise<void> {
    // Auto-start monitoring for the new foreground app
    await this.start(device, packageName, {
      sessionUuid: this.sessionUuid ?? undefined,
      navigationNodeId: this.currentNavigationNodeId ?? undefined,
      testExecutionId: this.currentTestExecutionId ?? undefined,
    });
  }

  /**
   * Handle a detected crash - persist to database
   */
  private async handleCrash(event: CrashEvent): Promise<void> {
    try {
      const repo = getFailureEventRepository();
      const id = await repo.saveCrash(event);

      logger.info(
        `[CrashMonitorService] Persisted crash ${id}: ${event.exceptionClass ?? event.signal ?? "unknown"}`
      );
    } catch (error) {
      logger.error(`[CrashMonitorService] Failed to persist crash: ${error}`);
    }
  }

  /**
   * Handle a detected ANR - persist to database
   */
  private async handleAnr(event: AnrEvent): Promise<void> {
    try {
      const repo = getFailureEventRepository();
      const id = await repo.saveAnr(event);

      logger.info(
        `[CrashMonitorService] Persisted ANR ${id}: ${event.reason ?? "unknown reason"}`
      );
    } catch (error) {
      logger.error(`[CrashMonitorService] Failed to persist ANR: ${error}`);
    }
  }
}

// Export singleton getter
export function getCrashMonitorService(): CrashMonitorService {
  return CrashMonitorService.getInstance();
}
