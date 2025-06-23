import { AdbUtils } from "../../utils/adb";
import { BaseVisualChange } from "./BaseVisualChange";
import { LaunchAppResult } from "../../models/LaunchAppResult";
import { ActionableError } from "../../models";

export class LaunchApp extends BaseVisualChange {
  /**
   * Create an LaunchApp instance
   * @param deviceId - Optional device ID
   * @param adbUtils - Optional AdbUtils instance for testing
   */
  constructor(deviceId: string | null = null, adb: AdbUtils | null = null) {
    super(deviceId, adb);
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
   * @param activityName - Optional activity name to launch
   */
  async execute(
    packageName: string,
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

    return this.observedChange(
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
