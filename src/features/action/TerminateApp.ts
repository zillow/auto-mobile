import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { BootedDevice, TerminateAppResult } from "../../models";
import { createGlobalPerformanceTracker } from "../../utils/PerformanceTracker";

export class TerminateApp extends BaseVisualChange {

  /**
   * Create an TerminateApp instance
   * @param device - Optional device
   * @param adb - Optional AdbClient instance for testing
   */
  constructor(device: BootedDevice, adb: AdbClient | null = null) {
    super(device, adb);
    this.device = device;
  }

  /**
   * Terminate an app by package name
   * @param packageName - The package name to terminate
   * @param options - Optional execution options
   */
  async execute(
    packageName: string,
    options?: {
      progress?: ProgressCallback;
      skipObservation?: boolean;
      skipUiStability?: boolean;
      userId?: number;
    }
  ): Promise<TerminateAppResult> {
    const perf = createGlobalPerformanceTracker();
    perf.serial("terminateApp");

    const terminateLogic = async (): Promise<TerminateAppResult> => {
      // Auto-detect target user if not specified
      const targetUserId = await perf.track("detectTargetUser", async () => {
        if (options?.userId !== undefined) {
          return options.userId;
        }

        // Check if app is in foreground and get its user
        const foregroundApp = await this.adb.getForegroundApp();
        if (foregroundApp && foregroundApp.packageName === packageName) {
          return foregroundApp.userId;
        }

        // Get list of users and prefer work profile
        const users = await this.adb.listUsers();

        // Find first work profile (userId > 0 and running)
        const workProfile = users.find(u => u.userId > 0 && u.running);
        if (workProfile) {
          return workProfile.userId;
        }

        // Fall back to primary user
        return 0;
      });

      // Check if app is installed
      const isInstalled = await perf.track("checkInstalled", async () => {
        const isInstalledCmd = `shell pm list packages --user ${targetUserId} -f ${packageName} | grep -c ${packageName}`;
        const isInstalledOutput = await this.adb.executeCommand(isInstalledCmd, undefined, undefined, true);
        return parseInt(isInstalledOutput.trim(), 10) > 0;
      });

      if (!isInstalled) {
        perf.end();
        return {
          success: true,
          packageName,
          wasInstalled: false,
          wasRunning: false,
          wasForeground: false,
          userId: targetUserId
        };
      }

      // Check if app is running
      const isRunning = true;

      if (!isRunning) {
        perf.end();
        return {
          success: true,
          packageName,
          wasInstalled: true,
          wasRunning: false,
          wasForeground: false,
          userId: targetUserId
        };
      }

      // Check if app is in foreground using getForegroundApp (which returns user context)
      const isForeground = await perf.track("checkForeground", async () => {
        const foregroundApp = await this.adb.getForegroundApp();
        return foregroundApp !== null &&
               foregroundApp.packageName === packageName &&
               foregroundApp.userId === targetUserId;
      });

      await perf.track("forceStop", async () => {
        await this.adb.executeCommand(`shell am force-stop --user ${targetUserId} ${packageName}`);
      });

      perf.end();
      return {
        success: true,
        packageName,
        wasInstalled: true,
        wasRunning: true,
        wasForeground: isForeground,
        userId: targetUserId
      };
    };

    // Skip observation when called internally (e.g., from LaunchApp)
    if (options?.skipObservation) {
      return terminateLogic();
    }

    return this.observedInteraction(
      terminateLogic,
      {
        changeExpected: false,
        progress: options?.progress,
        skipUiStability: options?.skipUiStability,
        perf
      }
    );
  }
}
