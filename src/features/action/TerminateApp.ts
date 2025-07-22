import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { BootedDevice, TerminateAppResult } from "../../models";
import { CheckAppStatus } from "./CheckAppStatus";

export class TerminateApp extends BaseVisualChange {
  private device: BootedDevice;

  /**
   * Create an TerminateApp instance
   * @param device - Optional device
   * @param adb - Optional AdbUtils instance for testing
   */
  constructor(device: BootedDevice, adb: AdbUtils | null = null) {
    super(device, adb);
    this.device = device;
  }

  /**
   * Terminate an app by package name
   * @param packageName - The package name to terminate
   * @param progress - Optional progress callback
   */
  async execute(
    packageName: string,
    progress?: ProgressCallback
  ): Promise<TerminateAppResult> {

    return this.observedInteraction(
      async () => {

        // Check if app is installed
        const isInstalledCmd = `shell pm list packages -f ${packageName} | grep -c ${packageName}`;
        const isInstalledOutput = await this.adb.executeCommand(isInstalledCmd);
        const isInstalled = parseInt(isInstalledOutput.trim(), 10) > 0;

        if (!isInstalled) {
          return {
            success: true,
            packageName,
            wasInstalled: false,
            wasRunning: false,
            wasForeground: false
          };
        }

        // Check if app is running
        const appStatus = new CheckAppStatus(this.device);
        const statusResult = await appStatus.execute(packageName);
        const isRunning = statusResult.success && statusResult.isRunning;

        if (!isRunning) {
          return {
            success: true,
            packageName,
            wasInstalled: true,
            wasRunning: false,
            wasForeground: false
          };
        }

        // Check if app is in foreground
        const currentAppCmd = `shell "dumpsys window windows | grep '${packageName}'"`;
        const currentAppOutput = await this.adb.executeCommand(currentAppCmd);

        // App is in foreground if it's either the top app or an IME target
        const isTopApp = currentAppOutput.includes(`topApp=ActivityRecord{`) &&
          currentAppOutput.includes(`${packageName}`);
        const isImeTarget = currentAppOutput.includes(`imeLayeringTarget`) &&
          currentAppOutput.includes(`${packageName}`);

        const isForeground = isTopApp || isImeTarget;

        await this.adb.executeCommand(`shell am force-stop ${packageName}`);

        return {
          success: true,
          packageName,
          wasInstalled: true,
          wasRunning: true,
          wasForeground: isForeground,
        };
      },
      {
        changeExpected: false, // TODO: Can make this true if we
        progress
      }
    );
  }
}
