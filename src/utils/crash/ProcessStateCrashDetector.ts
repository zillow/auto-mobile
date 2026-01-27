import type { BootedDevice } from "../../models";
import type { AdbExecutor } from "../android-cmdline-tools/interfaces/AdbExecutor";
import type {
  CrashDetector,
  CrashEvent,
  AnrEvent,
  CrashEventListener,
  AnrEventListener,
} from "../interfaces/CrashMonitor";
import { AdbClient } from "../android-cmdline-tools/AdbClient";
import { logger } from "../logger";

/**
 * Detects crashes by monitoring process state changes.
 * If a tracked process disappears unexpectedly, it's likely a crash.
 */
export class ProcessStateCrashDetector implements CrashDetector {
  readonly name = "process_monitor";

  private adb: AdbExecutor;
  private device: BootedDevice | null = null;
  private packageName: string | null = null;
  private running = false;
  private lastKnownPid: number | null = null;
  private wasRunning = false;
  private crashListeners: CrashEventListener[] = [];
  private anrListeners: AnrEventListener[] = [];

  constructor(adb?: AdbExecutor) {
    this.adb = adb ?? new AdbClient();
  }

  async start(device: BootedDevice, packageName: string): Promise<void> {
    this.device = device;
    this.packageName = packageName;
    this.running = true;
    this.lastKnownPid = null;
    this.wasRunning = false;

    if (this.adb instanceof AdbClient) {
      this.adb.setDevice(device);
    }

    // Get initial process state
    const pid = await this.getProcessPid(packageName);
    if (pid !== null) {
      this.lastKnownPid = pid;
      this.wasRunning = true;
    }

    logger.info(
      `ProcessStateCrashDetector started for package ${packageName} on device ${device.deviceId}`
    );
  }

  async stop(): Promise<void> {
    this.running = false;
    this.device = null;
    this.packageName = null;
    this.lastKnownPid = null;
    this.wasRunning = false;
    logger.info("ProcessStateCrashDetector stopped");
  }

  async checkForCrashes(): Promise<CrashEvent[]> {
    if (!this.running || !this.device || !this.packageName) {
      return [];
    }

    const crashes: CrashEvent[] = [];

    try {
      const currentPid = await this.getProcessPid(this.packageName);

      // Process was running but is now gone - potential crash
      if (this.wasRunning && currentPid === null) {
        // Check if it was killed normally vs crashed
        const wasKilled = await this.checkIfNormalTermination(this.packageName);

        if (!wasKilled) {
          const event: CrashEvent = {
            deviceId: this.device.deviceId,
            packageName: this.packageName,
            crashType: "java", // Assume java crash; other detectors will provide more detail
            timestamp: Date.now(),
            processName: this.packageName,
            pid: this.lastKnownPid ?? undefined,
            detectionSource: "process_monitor",
            exceptionMessage: "Process terminated unexpectedly",
          };

          crashes.push(event);
          this.notifyCrashListeners(event);
        }

        this.wasRunning = false;
        this.lastKnownPid = null;
      } else if (currentPid !== null) {
        // Process is running
        if (this.lastKnownPid !== null && this.lastKnownPid !== currentPid) {
          // PID changed - process restarted (likely after crash)
          const event: CrashEvent = {
            deviceId: this.device.deviceId,
            packageName: this.packageName,
            crashType: "java",
            timestamp: Date.now(),
            processName: this.packageName,
            pid: this.lastKnownPid,
            detectionSource: "process_monitor",
            exceptionMessage: `Process restarted (PID changed from ${this.lastKnownPid} to ${currentPid})`,
          };

          crashes.push(event);
          this.notifyCrashListeners(event);
        }

        this.lastKnownPid = currentPid;
        this.wasRunning = true;
      }
    } catch (error) {
      logger.debug(`Error checking process state: ${error}`);
    }

    return crashes;
  }

  async checkForAnrs(): Promise<AnrEvent[]> {
    // Process state monitor doesn't directly detect ANRs
    // It can only detect that a process is stuck, but that's handled by other detectors
    return [];
  }

  isRunning(): boolean {
    return this.running;
  }

  addCrashListener(listener: CrashEventListener): void {
    this.crashListeners.push(listener);
  }

  removeCrashListener(listener: CrashEventListener): void {
    const index = this.crashListeners.indexOf(listener);
    if (index !== -1) {
      this.crashListeners.splice(index, 1);
    }
  }

  addAnrListener(listener: AnrEventListener): void {
    this.anrListeners.push(listener);
  }

  removeAnrListener(listener: AnrEventListener): void {
    const index = this.anrListeners.indexOf(listener);
    if (index !== -1) {
      this.anrListeners.splice(index, 1);
    }
  }

  /**
   * Get the PID of a running process by package name
   */
  private async getProcessPid(packageName: string): Promise<number | null> {
    try {
      const result = await this.adb.executeCommand(
        `shell pidof ${packageName}`,
        5000
      );

      const pidStr = result.stdout.trim();
      if (pidStr) {
        // pidof can return multiple PIDs for multi-process apps
        const pids = pidStr.split(/\s+/).map(p => parseInt(p, 10));
        return pids[0] ?? null;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Check if the process was terminated normally (e.g., user closed the app)
   * vs crashed unexpectedly
   */
  private async checkIfNormalTermination(packageName: string): Promise<boolean> {
    try {
      // Check recent activity manager logs for normal stop
      const result = await this.adb.executeCommand(
        `logcat -b system -d -t 50 | grep -E "(Killing|Force stopping|Process .* died)" | grep ${packageName}`,
        5000
      );

      // If we find "Force stopping" without "crash", it's likely intentional
      if (
        result.stdout.includes("Force stopping") &&
        !result.stdout.toLowerCase().includes("crash")
      ) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  private notifyCrashListeners(event: CrashEvent): void {
    for (const listener of this.crashListeners) {
      try {
        void listener(event);
      } catch (error) {
        logger.error(`Error in crash listener: ${error}`);
      }
    }
  }
}
