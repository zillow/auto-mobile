import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { BootedDevice, TerminateAppResult } from "../../models";
import { createGlobalPerformanceTracker } from "../../utils/PerformanceTracker";
import { SimCtlClient } from "../../utils/ios-cmdline-tools/SimCtlClient";
import { Timer, defaultTimer } from "../../utils/SystemTimer";

export class TerminateApp extends BaseVisualChange {
  private simctl: SimCtlClient;

  /**
   * Create an TerminateApp instance
   * @param device - Optional device
   * @param adb - Optional AdbClient instance for testing
   * @param simctl - Optional SimCtlClient instance for testing
   */
  constructor(
    device: BootedDevice,
    adb: AdbClient | null = null,
    simctl: SimCtlClient | null = null,
    timer: Timer = defaultTimer
  ) {
    super(device, adb, timer);
    this.device = device;
    this.simctl = simctl || new SimCtlClient(device);
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
    if (this.device.platform === "ios") {
      return this.executeiOS(packageName, options);
    }

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

  private async executeiOS(
    bundleId: string,
    options?: {
      progress?: ProgressCallback;
      skipObservation?: boolean;
      skipUiStability?: boolean;
    }
  ): Promise<TerminateAppResult> {
    const perf = createGlobalPerformanceTracker();
    perf.serial("terminateApp");

    const terminateLogic = async (): Promise<TerminateAppResult> => {
      const installedApps = await perf.track("checkInstalled", () => this.simctl.listApps(this.device.deviceId));
      const wasInstalled = installedApps.some(app => this.getBundleId(app) === bundleId);

      if (!wasInstalled) {
        perf.end();
        return {
          success: true,
          packageName: bundleId,
          wasInstalled: false,
          wasRunning: false,
          wasForeground: false
        };
      }

      let wasRunning = true;
      let errorMessage: string | undefined;

      try {
        await perf.track("terminateApp", () => this.simctl.terminateApp(bundleId, this.device.deviceId));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (this.isSimctlNotRunningError(message)) {
          wasRunning = false;
        } else {
          errorMessage = message;
        }
      }

      perf.end();
      return {
        success: !errorMessage,
        packageName: bundleId,
        wasInstalled: true,
        wasRunning,
        wasForeground: false,
        ...(errorMessage ? { error: errorMessage } : {})
      };
    };

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

  private isSimctlNotRunningError(message: string): boolean {
    const normalized = message.toLowerCase();
    return normalized.includes("no such process")
      || normalized.includes("not running")
      || normalized.includes("found nothing to terminate");
  }

  private getBundleId(app: any): string | undefined {
    if (!app || typeof app !== "object") {
      return undefined;
    }
    if (typeof app.bundleId === "string" && app.bundleId.trim().length > 0) {
      return app.bundleId;
    }
    if (typeof app.bundleIdentifier === "string" && app.bundleIdentifier.trim().length > 0) {
      return app.bundleIdentifier;
    }
    if (typeof app.CFBundleIdentifier === "string" && app.CFBundleIdentifier.trim().length > 0) {
      return app.CFBundleIdentifier;
    }
    return undefined;
  }
}
