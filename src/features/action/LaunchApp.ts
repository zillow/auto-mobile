import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { BaseVisualChange } from "./BaseVisualChange";
import { BootedDevice, LaunchAppResult } from "../../models";
import { ActionableError } from "../../models";
import { TerminateApp } from "./TerminateApp";
import { ClearAppData } from "./ClearAppData";

import { IdbPython } from "../../utils/ios-cmdline-tools/idbPython";
import { logger } from "../../utils/logger";
import { ListInstalledApps } from "../observe/ListInstalledApps";

export class LaunchApp extends BaseVisualChange {
  private device: BootedDevice;
  private idb: IdbPython;
  /**
   * Create an LaunchApp instance
   * @param device - Optional device
   * @param adb - Optional AdbUtils instance for testing
   */
  constructor(device: BootedDevice, adb: AdbUtils | null = null, idb: IdbPython | null = null) {
    super(device, adb);
    this.device = device;
    this.idb = idb || new IdbPython(device);
  }

  /**
   * Extract launcher activities using targeted adb command
   * @param packageName - Package name we're trying to launch
   * @returns Array of launcher activity names
   */
  private async extractLauncherActivities(packageName: string): Promise<string[]> {
    logger.info("extractLauncherActivities");
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
   * Launch an app by package name - routes to platform-specific implementation
   * @param packageName - The package name to launch
   * @param clearAppData - Whether clear app data before launch
   * @param coldBoot - Whether to cold boot the app or resume if already running
   * @param activityName - Optional activity name to launch (Android only)
   */
  async execute(
    packageName: string,
    clearAppData: boolean,
    coldBoot: boolean,
    activityName?: string
  ): Promise<LaunchAppResult> {
    logger.info("execute");
    switch (this.device.platform) {
      case "ios":
        return this.executeiOS(packageName, clearAppData, coldBoot);
      case "android":
        return this.executeAndroid(packageName, clearAppData, coldBoot, activityName);
      default:
        throw new ActionableError(`Unsupported platform: ${this.device.platform}`);
    }
  }

  /**
   * Launch an iOS app by bundle identifier
   * @param bundleId - The bundle identifier to launch
   * @param clearAppData - Whether clear app data before launch
   * @param coldBoot - Whether to cold boot the app or resume if already running
   */
  private async executeiOS(
    bundleId: string,
    clearAppData: boolean,
    coldBoot: boolean
  ): Promise<LaunchAppResult> {
    logger.info(`executeiOS bundleId ${bundleId}`);
    // Check if app is installed
    const installedApps = await (new ListInstalledApps(this.device)).execute();
    if (!installedApps.includes(bundleId)) {
      logger.info("App is not installed?!?");
      return {
        success: false,
        packageName: bundleId,
        error: "App is not installed"
      };
    }

    // For iOS, we'll handle coldBoot and clearAppData by terminating first if requested
    if (clearAppData || coldBoot) {
      try {
        // Attempt to terminate the app if it's running
        await this.idb.terminateApp(bundleId);
        // Note: iOS doesn't have direct app data clearing like Android
        // This would require uninstall/reinstall or app-specific reset
      } catch (error) {
        // TODO: We need to handle this error or figure out the best way to handle it
        // App might not be running, continue with launch
      }
    }

    // Launch the app
    await this.idb.launchApp(bundleId, { foregroundIfRunning: true });

    return {
      success: true,
      packageName: bundleId
    };
  }

  /**
   * Launch an Android app by package name
   * @param packageName - The package name to launch
   * @param clearAppData - Whether clear app data before launch
   * @param coldBoot - Whether to cold boot the app or resume if already running
   * @param activityName - Optional activity name to launch
   */
  private async executeAndroid(
    packageName: string,
    clearAppData: boolean,
    coldBoot: boolean,
    activityName?: string
  ): Promise<LaunchAppResult> {
    logger.info(`executeAndroid: ${packageName}`);
    // Check app status (installation and running)
    const installedApps = await (new ListInstalledApps(this.device)).execute();
    if (!installedApps.includes(packageName)) {
      logger.info("App is not installed?!?");
      return {
        success: false,
        packageName: packageName,
        error: "App is not installed"
      };
    }

    // Use the installation status check which also includes running status
    const isRunning = true; // TODO

    if (isRunning) {
      if (clearAppData) {
        await new ClearAppData(this.device).execute(packageName);
      } else if (coldBoot) {
        await new TerminateApp(this.device).execute(packageName);
      }

      // Check if app is in foreground
      let isForeground: boolean;
      try {
        const currentAppCmd = `shell "dumpsys window windows | grep '${packageName}'"`;
        const currentAppOutput = await this.adb.executeCommand(currentAppCmd);
        // App is in foreground if it's either the top app or an IME target
        const isTopApp = currentAppOutput.includes(`topApp=ActivityRecord{`) &&
          currentAppOutput.includes(`${packageName}`);
        const isImeTarget = currentAppOutput.includes(`imeLayeringTarget`) &&
          currentAppOutput.includes(`${packageName}`);

        isForeground = isTopApp || isImeTarget;
      } catch (error) {
        isForeground = false;
      }

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
        logger.info("(");
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
