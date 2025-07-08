import { AdbUtils } from "../../utils/adb";
import { BaseVisualChange } from "./BaseVisualChange";
import { LaunchAppResult } from "../../models";
import { ActionableError } from "../../models";
import { TerminateApp } from "./TerminateApp";
import { ClearAppData } from "./ClearAppData";

export class LaunchApp extends BaseVisualChange {
  private deviceId: string;
  /**
   * Create an LaunchApp instance
   * @param deviceId - Optional device ID
   * @param adb - Optional AdbUtils instance for testing
   */
  constructor(deviceId: string, adb: AdbUtils | null = null) {
    super(deviceId, adb);
    this.deviceId = deviceId;
  }

  /**
   * Extract launcher activities using targeted adb command
   * @param packageName - Package name we're trying to launch
   * @returns Array of launcher activity names
   */
  private async extractLauncherActivities(packageName: string): Promise<string[]> {
    const activities: string[] = [];

    try {
      const cmd = `shell pm dump ${packageName} | grep "${packageName}" -A 1 | grep 'Action: "android.intent.action.MAIN"' -B 1 | head -n 1`;
      const result = await this.adb.executeCommand(cmd);

      if (result.stdout.trim()) {
        // Extract activity name from lines like:
        // "2a4a30f com.example.app/com.example.WowActivity filter 6622f9c"
        const match = result.stdout.match(new RegExp(`${packageName}/([^\\s]+)`));
        if (match) {
          const activityName = match[1];
          activities.push(activityName);
        }
      }
    } catch (error) {
      // If grep command fails, return empty array
      console.warn(`Failed to extract launcher activities for ${packageName}:`, error);
    }

    return activities;
  }

  /**
   * Launch an app by package name
   * @param packageName - The package name to launch
   * @param clearAppData - Whether clear app data before launch
   * @param coldBoot - Whether to cold boot the app or resume if already running
   * @param activityName - Optional activity name to launch
   */
  async execute(
    packageName: string,
    clearAppData: boolean,
    coldBoot: boolean,
    activityName?: string
  ): Promise<LaunchAppResult> {

    // Check if app is installed
    const isInstalledCmd = `shell pm list packages -f ${packageName} | grep -c ${packageName}`;
    const isInstalledOutput = await this.adb.executeCommand(isInstalledCmd);
    const isInstalled = parseInt(isInstalledOutput.trim(), 10) > 0;

    if (!isInstalled) {
      return {
        success: false,
        packageName,
        activityName,
        error: "App is not installed"
      };
    }

    // Check if app is running
    const isRunningCmd = `shell ps | grep ${packageName} | grep -v grep | wc -l`;
    const isRunningOutput = await this.adb.executeCommand(isRunningCmd);
    const isRunning = parseInt(isRunningOutput.trim(), 10) > 0;

    if (isRunning) {

      if (clearAppData) {
        await new ClearAppData(this.deviceId, this.adb).execute(packageName);
      } else if (coldBoot) {
        await new TerminateApp(this.deviceId, this.adb).execute(packageName);
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

      if (isForeground) {
        return {
          success: true,
          packageName,
          activityName,
          error: "App is already in foreground"
        };
      }
    }

    return this.observedInteraction(
      async () => {
        let targetActivity = activityName;

        // If no specific activity provided, get launcher activities from pm dump
        if (!targetActivity) {
          const launcherActivities = await this.extractLauncherActivities(packageName);

          if (launcherActivities.length > 0) {
            targetActivity = launcherActivities[0];
          }
        }

        // Launch with specific activity if found, otherwise use default method
        if (targetActivity) {
          await this.adb.executeCommand(`shell am start -n ${packageName}/${targetActivity}`);
        } else {
          // Fallback to default launcher intent
          throw new ActionableError("No launcher activity found");
        }

        // Wait for app to become stable - reduced timeout to prevent client timeouts
        await this.awaitIdle.waitForUiStability(packageName, 3000);

        return {
          success: true,
          packageName,
          activityName: targetActivity
        };
      },
      {
        changeExpected: false
      }
    );
  }
}
