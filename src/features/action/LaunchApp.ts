import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { BaseVisualChange } from "./BaseVisualChange";
import { BootedDevice, LaunchAppResult } from "../../models";
import { ActionableError } from "../../models";
import { TerminateApp } from "./TerminateApp";
import { ClearAppData } from "./ClearAppData";
import { logger } from "../../utils/logger";
import { Axe } from "../../utils/ios-cmdline-tools/axe";
import { ListInstalledApps } from "../observe/ListInstalledApps";
import { Simctl } from "../../utils/ios-cmdline-tools/simctl";

export class LaunchApp extends BaseVisualChange {

  private simctl: Simctl;
  /**
   * Create an LaunchApp instance
   * @param device - Optional device
   * @param adb - Optional AdbUtils instance for testing
   * @param axe - Optional Axe instance for testing
   * @param simctl - Optional Simctl instance for testing
   */
  constructor(
    device: BootedDevice,
    adb: AdbUtils | null = null,
    axe: Axe | null = null,
    simctl: Simctl | null = null) {
    super(device, adb, axe);
    this.device = device;
    this.simctl = simctl || new Simctl(this.device);
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
      logger.info(`[LaunchApp] Extracting launcher activities for ${packageName}`);

      // Try multiple approaches to find the main activity
      const approaches = [
        // Approach 1: Direct pm dump with specific grep
        `shell pm dump ${packageName} | grep -A 5 -B 5 "android.intent.action.MAIN"`,
        // Approach 2: Query resolver activities
        `shell cmd package query-activities --brief android.intent.action.MAIN android.intent.category.LAUNCHER | grep ${packageName}`,
        // Approach 3: Direct pm list activities
        `shell pm list packages -f ${packageName} && pm dump ${packageName} | grep -A 10 "Activity filter"`
      ];

      for (let i = 0; i < approaches.length; i++) {
        try {
          logger.info(`[LaunchApp] Trying approach ${i + 1}: ${approaches[i]}`);
          const result = await this.adb.executeCommand(approaches[i]);
          logger.info(`[LaunchApp] Approach ${i + 1} result: ${result.stdout.length} chars of output`);

          if (result.stdout.trim()) {
            // Extract activity name from various patterns
            const patterns = [
              // Pattern 1: "packageName/activityName"
              new RegExp(`${packageName}/([^\\s]+)`, "g"),
              // Pattern 2: Activity class names
              new RegExp(`${packageName}\\.[^\\s]*Activity[^\\s]*`, "g"),
              // Pattern 3: Full class names in the package
              new RegExp(`${packageName}\\.[^\\s]+`, "g")
            ];

            for (const pattern of patterns) {
              const matches = result.stdout.match(pattern);
              if (matches) {
                logger.info(`[LaunchApp] Found ${matches.length} potential activities with pattern: ${pattern}`);
                for (const match of matches) {
                  if (match.includes("/")) {
                    const activityName = match.split("/")[1];
                    if (activityName && !activities.includes(activityName)) {
                      activities.push(activityName);
                      logger.info(`[LaunchApp] Added activity: ${activityName}`);
                    }
                  } else if (match.startsWith(packageName + ".")) {
                    const activityName = match;
                    if (!activities.includes(activityName)) {
                      activities.push(activityName);
                      logger.info(`[LaunchApp] Added full activity name: ${activityName}`);
                    }
                  }
                }
              }
            }

            if (activities.length > 0) {
              logger.info(`[LaunchApp] Successfully found ${activities.length} activities using approach ${i + 1}`);
              break;
            }
          }
        } catch (error) {
          logger.warn(`[LaunchApp] Approach ${i + 1} failed:`, error);
        }
      }

      // If no activities found, try a simpler approach
      if (activities.length === 0) {
        logger.info(`[LaunchApp] No activities found, trying fallback approach`);
        try {
          const simpleResult = await this.adb.executeCommand(`shell pm dump ${packageName}`);
          const lines = simpleResult.stdout.split("\n");

          for (const line of lines) {
            if (line.includes("android.intent.action.MAIN") || line.includes("MainActivity") || line.includes(".Main")) {
              logger.info(`[LaunchApp] Found potential main activity line: ${line.trim()}`);
              // Look for activity names in surrounding lines
              const activityMatch = line.match(new RegExp(`${packageName}[^\\s]*`, "g"));
              if (activityMatch) {
                for (const match of activityMatch) {
                  if (!activities.includes(match)) {
                    activities.push(match);
                    logger.info(`[LaunchApp] Added fallback activity: ${match}`);
                  }
                }
              }
            }
          }
        } catch (error) {
          logger.warn(`[LaunchApp] Fallback approach failed:`, error);
        }
      }

    } catch (error) {
      logger.warn(`[LaunchApp] Failed to extract launcher activities for ${packageName}:`, error);
    }

    logger.info(`[LaunchApp] Final activities list: [${activities.join(", ")}]`);
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
   * @param clearAppData - Whether clear app data before launch (not supported on iOS)
   * @param coldBoot - Whether to cold boot the app or resume if already running
   */
  private async executeiOS(
    bundleId: string,
    clearAppData: boolean,
    coldBoot: boolean
  ): Promise<LaunchAppResult> {
    logger.info(`executeiOS bundleId ${bundleId}`);

    return this.observedInteraction(
      async () => {
        // Check if app is installed
        const installedApps = await (new ListInstalledApps(this.device)).execute();
        if (!installedApps.includes(bundleId)) {
          logger.info("App is not installed");
          return {
            success: false,
            packageName: bundleId,
            error: "App is not installed"
          };
        }

        // For iOS, handle coldBoot by terminating first if requested
        if (coldBoot) {
          try {
            // Attempt to terminate the app if it's running
            await this.simctl.terminateApp(bundleId);
            // Note: iOS doesn't have direct app data clearing like Android
            // clearAppData parameter is ignored on iOS
          } catch (error) {
            // App might not be running, continue with launch
            logger.info("App was not running or failed to terminate, continuing with launch");
          }
        }

        // Launch the app using axe
        const launchResult = await this.simctl.launchApp(bundleId, {
          foregroundIfRunning: !coldBoot
        });

        if (launchResult.error) {
          return {
            success: false,
            packageName: bundleId,
            error: launchResult.error
          };
        }

        return {
          success: true,
          packageName: bundleId,
          pid: launchResult.pid
        };
      },
      {
        changeExpected: false
      }
    );
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
      logger.error(`[LaunchApp] App ${packageName} is not installed`);
      return {
        success: false,
        packageName: packageName,
        error: "App is not installed"
      };
    }

    // Check if app is running
    const isRunningCmd = `shell ps | grep ${packageName} | grep -v grep | wc -l`;
    logger.info(`[LaunchApp] Checking if app is running: ${isRunningCmd}`);
    const isRunningOutput = await this.adb.executeCommand(isRunningCmd);
    const isRunning = parseInt(isRunningOutput.trim(), 10) > 0;
    logger.info(`[LaunchApp] App running: ${isRunning} (output: "${isRunningOutput.trim()}")`);

    if (isRunning) {
      if (clearAppData) {
        await new ClearAppData(this.device).execute(packageName);
      } else if (coldBoot) {
        await new TerminateApp(this.device).execute(packageName);
      }

      // Check if app is in foreground - use a more reliable approach
      let isForeground: boolean = false;
      try {
        logger.info(`[LaunchApp] Checking if app is in foreground`);

        // Revised, more robust foreground detection
        const foregroundChecks = [
          // Approach 1: Check for resumed activity
          `shell dumpsys activity activities | grep "mResumedActivity" | grep "${packageName}"`,
          // Approach 2: Check top activity with new activity command
          `shell dumpsys activity | grep "ResumedActivity.*${packageName}"`,
          // Approach 3: Check running processes (fallback)
          `shell dumpsys window | grep "Window #" | grep "${packageName}"`
        ];

        for (let i = 0; i < foregroundChecks.length; i++) {
          try {
            logger.info(`[LaunchApp] Foreground check ${i + 1}: ${foregroundChecks[i]}`);
            const checkResult = await this.adb.executeCommand(foregroundChecks[i]);
            const output = (checkResult && checkResult.stdout ? checkResult.stdout : "").trim();
            logger.info(`[LaunchApp] Foreground check ${i + 1} output: "${output}" (${output.length} chars)`);

            if (output.length > 0) {
              isForeground = true;
              logger.info(`[LaunchApp] App is in foreground (detected by check ${i + 1})`);
              break;
            }
          } catch (error) {
            logger.warn(`[LaunchApp] Foreground check ${i + 1} failed:`, error);
          }
        }
      } catch (outerError) {
        logger.warn(`[LaunchApp] All foreground checks failed:`, outerError);
        isForeground = false;
      }

      logger.info(`[LaunchApp] Final foreground status: ${isForeground}`);

      if (isForeground) {
        logger.info(`[LaunchApp] App ${packageName} is already in foreground`);
        return {
          success: true,
          packageName,
          activityName,
          error: "App is already in foreground"
        };
      }
    } else {
      if (clearAppData) {
        await new ClearAppData(this.device).execute(packageName);
      }
    }

    logger.info(`[LaunchApp] Proceeding with app launch`);

    return this.observedInteraction(
      async () => {
        logger.info("(");
        let targetActivity = activityName;

        // Try monkey launch first (ultra-fast approach)
        if (!targetActivity) {
          logger.info(`[LaunchApp] Trying monkey launch (ultra-fast approach)`);
          try {
            const monkeyCmd = `shell monkey -p ${packageName} 1`;
            logger.info(`[LaunchApp] Monkey command: ${monkeyCmd}`);
            await this.adb.executeCommand(monkeyCmd);
            logger.info(`[LaunchApp] Monkey launch completed successfully`);
            return {
              success: true,
              packageName,
              activityName: "monkey_launch"
            };
          } catch (error) {
            logger.info(`[LaunchApp] Monkey launch failed: ${error}, falling back to activity discovery`);
          }
        }

        // If no specific activity provided, get launcher activities from pm dump
        if (!targetActivity) {
          logger.info(`[LaunchApp] No activity specified, extracting launcher activities`);
          const launcherActivities = await this.extractLauncherActivities(packageName);

          if (launcherActivities.length > 0) {
            targetActivity = launcherActivities[0];
            logger.info(`[LaunchApp] Using first found activity: ${targetActivity}`);
          } else {
            logger.info(`[LaunchApp] No launcher activities found, trying common patterns`);
            // Try common activity name patterns
            const commonPatterns = [
              `${packageName}.MainActivity`,
              `${packageName}.ui.MainActivity`,
              `${packageName}.main.MainActivity`,
              `${packageName}.activity.MainActivity`,
              `${packageName}.LauncherActivity`,
              `${packageName}.MainLauncherActivity`
            ];

            for (const pattern of commonPatterns) {
              try {
                logger.info(`[LaunchApp] Trying common pattern: ${pattern}`);
                await this.adb.executeCommand(`shell am start -n ${packageName}/${pattern}`);
                logger.info(`[LaunchApp] Successfully launched with pattern: ${pattern}`);
                return {
                  success: true,
                  packageName,
                  activityName: pattern
                };
              } catch (error) {
                logger.info(`[LaunchApp] Pattern ${pattern} failed: ${error}`);
              }
            }
          }
        }

        // Launch with specific activity if found, otherwise use default method
        if (targetActivity) {
          logger.info(`[LaunchApp] Launching with activity: ${targetActivity}`);
          const launchCmd = `shell am start -n ${packageName}/${targetActivity}`;
          logger.info(`[LaunchApp] Launch command: ${launchCmd}`);
          await this.adb.executeCommand(launchCmd);
          logger.info(`[LaunchApp] Launch command completed successfully`);
        } else {
          // Fallback to launcher intent
          logger.info(`[LaunchApp] No activity found, trying launcher intent`);
          try {
            const launcherCmd = `shell am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER ${packageName}`;
            logger.info(`[LaunchApp] Launcher intent command: ${launcherCmd}`);
            await this.adb.executeCommand(launcherCmd);
            logger.info(`[LaunchApp] Launcher intent completed successfully`);
          } catch (error) {
            logger.error(`[LaunchApp] Launcher intent failed: ${error}`);
            throw new ActionableError("No launcher activity found and launcher intent failed");
          }
        }

        logger.info(`[LaunchApp] Launch completed successfully`);
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
