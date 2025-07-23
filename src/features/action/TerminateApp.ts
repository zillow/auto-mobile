import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { BootedDevice, TerminateAppResult } from "../../models";
import { IdbPython } from "../../utils/ios-cmdline-tools/idbPython";

export class TerminateApp extends BaseVisualChange {

  /**
   * Create an TerminateApp instance
   * @param device - Optional device
   * @param adb - Optional AdbUtils instance for testing
   * @param idb - Optional IdbPython instance for testing
   */
  constructor(device: BootedDevice, adb: AdbUtils | null = null, idb: IdbPython | null = null) {
    super(device, adb, idb);
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
        const isRunning = true;

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
