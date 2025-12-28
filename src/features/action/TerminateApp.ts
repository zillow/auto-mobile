import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { BootedDevice, TerminateAppResult } from "../../models";
import { Axe } from "../../utils/ios-cmdline-tools/axe";
import { createGlobalPerformanceTracker } from "../../utils/PerformanceTracker";

export class TerminateApp extends BaseVisualChange {

  /**
   * Create an TerminateApp instance
   * @param device - Optional device
   * @param adb - Optional AdbUtils instance for testing
   * @param axe - Optional Axe instance for testing
   */
  constructor(device: BootedDevice, adb: AdbUtils | null = null, axe: Axe | null = null) {
    super(device, adb, axe);
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
    }
  ): Promise<TerminateAppResult> {
    const perf = createGlobalPerformanceTracker();
    perf.serial("terminateApp");

    const terminateLogic = async (): Promise<TerminateAppResult> => {
      // Check if app is installed
      const isInstalled = await perf.track("checkInstalled", async () => {
        const isInstalledCmd = `shell pm list packages -f ${packageName} | grep -c ${packageName}`;
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
          wasForeground: false
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
          wasForeground: false
        };
      }

      // Check if app is in foreground
      const isForeground = await perf.track("checkForeground", async () => {
        try {
          const currentAppCmd = `shell "dumpsys window windows | grep '${packageName}'"`;
          const currentAppOutput = await this.adb.executeCommand(currentAppCmd, undefined, undefined, true);

          // App is in foreground if it's either the top app or an IME target
          const isTopApp = currentAppOutput.includes(`topApp=ActivityRecord{`) &&
            currentAppOutput.includes(`${packageName}`);
          const isImeTarget = currentAppOutput.includes(`imeLayeringTarget`) &&
            currentAppOutput.includes(`${packageName}`);

          return isTopApp || isImeTarget;
        } catch {
          // grep returns non-zero when no matches found
          return false;
        }
      });

      await perf.track("forceStop", async () => {
        await this.adb.executeCommand(`shell am force-stop ${packageName}`);
      });

      perf.end();
      return {
        success: true,
        packageName,
        wasInstalled: true,
        wasRunning: true,
        wasForeground: isForeground,
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
        perf
      }
    );
  }
}
