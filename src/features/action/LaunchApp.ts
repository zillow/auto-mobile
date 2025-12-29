import { AdbClient } from "../../utils/android-cmdline-tools/adb";
import { BaseVisualChange } from "./BaseVisualChange";
import { BootedDevice, LaunchAppResult } from "../../models";
import { ActionableError } from "../../models";
import { TerminateApp } from "./TerminateApp";
import { ClearAppData } from "./ClearAppData";
import { logger } from "../../utils/logger";
import { AxeClient } from "../../utils/ios-cmdline-tools/axe";
import { ListInstalledApps } from "../observe/ListInstalledApps";
import { SimCtlClient } from "../../utils/ios-cmdline-tools/simctl";
import { createGlobalPerformanceTracker, PerformanceTracker } from "../../utils/PerformanceTracker";

export type ForegroundCheckMode = "parallel" | "single";

export class LaunchApp extends BaseVisualChange {

  private simctl: SimCtlClient;
  /**
   * Create an LaunchApp instance
   * @param device - Optional device
   * @param adb - Optional AdbClient instance for testing
   * @param axe - Optional AxeClient instance for testing
   * @param simctl - Optional SimCtlClient instance for testing
   */
  constructor(
    device: BootedDevice,
    adb: AdbClient | null = null,
    axe: AxeClient | null = null,
    simctl: SimCtlClient | null = null) {
    super(device, adb, axe);
    this.device = device;
    this.simctl = simctl || new SimCtlClient(this.device);
  }

  /**
   * Extract launcher activities using targeted adb command
   * @param packageName - Package name we're trying to launch
   * @param perf - Optional performance tracker
   * @returns Array of launcher activity names
   */
  private async extractLauncherActivities(
    packageName: string,
    perf?: PerformanceTracker
  ): Promise<string[]> {
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
          const result = perf
            ? await perf.track(`activityApproach_${i + 1}`, () => this.adb.executeCommand(approaches[i]))
            : await this.adb.executeCommand(approaches[i]);
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
          const simpleResult = perf
            ? await perf.track("activityFallback", () => this.adb.executeCommand(`shell pm dump ${packageName}`))
            : await this.adb.executeCommand(`shell pm dump ${packageName}`);
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
   * @param foregroundCheckMode - Experimental: strategy for checking if app is in foreground
   */
  async execute(
    packageName: string,
    clearAppData: boolean,
    coldBoot: boolean,
    activityName?: string,
    foregroundCheckMode: ForegroundCheckMode = "single"
  ): Promise<LaunchAppResult> {
    logger.info("execute");
    switch (this.device.platform) {
      case "ios":
        return this.executeiOS(packageName, clearAppData, coldBoot);
      case "android":
        return this.executeAndroid(packageName, clearAppData, coldBoot, activityName, foregroundCheckMode);
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
   * @param foregroundCheckMode - Strategy for checking if app is in foreground
   */
  private async executeAndroid(
    packageName: string,
    clearAppData: boolean,
    coldBoot: boolean,
    activityName?: string,
    foregroundCheckMode: ForegroundCheckMode = "single"
  ): Promise<LaunchAppResult> {
    const perf = createGlobalPerformanceTracker();
    perf.serial("launchApp");

    logger.info(`executeAndroid: ${packageName}`);

    // Check app status (installation and running)
    const installedApps = await perf.track("checkInstalled", async () => {
      return (new ListInstalledApps(this.device)).execute();
    });
    if (!installedApps.includes(packageName)) {
      logger.error(`[LaunchApp] App ${packageName} is not installed`);
      perf.end();
      return {
        success: false,
        packageName: packageName,
        error: "App is not installed"
      };
    }

    // Check if app is running
    const isRunning = await perf.track("checkRunning", async () => {
      const isRunningCmd = `shell ps | grep ${packageName} | grep -v grep | wc -l`;
      logger.info(`[LaunchApp] Checking if app is running: ${isRunningCmd}`);
      const isRunningOutput = await this.adb.executeCommand(isRunningCmd);
      const result = parseInt(isRunningOutput.trim(), 10) > 0;
      logger.info(`[LaunchApp] App running: ${result} (output: "${isRunningOutput.trim()}")`);
      return result;
    });

    let didTerminateOrClear = false;

    if (isRunning) {
      if (clearAppData) {
        await perf.track("clearAppData", async () => {
          return new ClearAppData(this.device).execute(packageName);
        });
        didTerminateOrClear = true;
      } else if (coldBoot) {
        await perf.track("terminateApp", async () => {
          return new TerminateApp(this.device).execute(packageName, { skipObservation: true });
        });
        didTerminateOrClear = true;
      }

      // Skip foreground check if we just terminated or cleared - we know app is not in foreground
      if (!didTerminateOrClear) {
        // Check if app is in foreground - use a more reliable approach
        const isForeground = await perf.track(`checkForeground_${foregroundCheckMode}`, async () => {
          return this.checkAppForeground(packageName, foregroundCheckMode, perf);
        });

        if (isForeground) {
          logger.info(`[LaunchApp] App ${packageName} is already in foreground`);
          perf.end();
          const result: LaunchAppResult = {
            success: true,
            packageName,
            activityName,
            error: "App is already in foreground"
          };
          // Add perfTiming if enabled
          const timings = perf.getTimings();
          if (perf.isEnabled() && timings) {
            result.observation = {
              updatedAt: new Date().toISOString(),
              screenSize: { width: 0, height: 0 },
              systemInsets: { top: 0, bottom: 0, left: 0, right: 0 },
              perfTiming: timings
            };
          }
          return result;
        }
      }
    } else {
      if (clearAppData) {
        await perf.track("clearAppData", async () => {
          return new ClearAppData(this.device).execute(packageName);
        });
        didTerminateOrClear = true;
      }
    }

    logger.info(`[LaunchApp] Proceeding with app launch`);

    return this.observedInteraction(
      async () => {
        return this.performLaunch(packageName, activityName, perf);
      },
      {
        changeExpected: false,
        perf,
        skipPreviousObserve: didTerminateOrClear
      }
    );
  }

  /**
   * Check if app is in foreground
   * @param packageName - Package name to check
   * @param mode - Check strategy: 'single' (default) or 'parallel'
   * @param perf - Optional performance tracker
   */
  private async checkAppForeground(
    packageName: string,
    mode: ForegroundCheckMode = "single",
    perf?: PerformanceTracker
  ): Promise<boolean> {
    logger.info(`[LaunchApp] Checking if app is in foreground (mode: ${mode})`);

    switch (mode) {
      case "parallel":
        return this.checkForegroundParallel(packageName, perf);
      case "single":
      default:
        return this.checkForegroundSingle(packageName, perf);
    }
  }

  /**
   * Parallel foreground check - runs all 3 dumpsys commands in parallel (kept for future use)
   */
  private async checkForegroundParallel(packageName: string, perf?: PerformanceTracker): Promise<boolean> {
    try {
      // Note: Window check uses mCurrentFocus (not "Window #") to avoid false positives from background windows
      const foregroundChecks = [
        `shell dumpsys activity activities | grep "mResumedActivity" | grep "${packageName}"`,
        `shell dumpsys activity | grep "ResumedActivity.*${packageName}"`,
        `shell dumpsys window | grep "mCurrentFocus" | grep "${packageName}"`
      ];

      logger.info(`[LaunchApp] Running ${foregroundChecks.length} foreground checks in parallel`);

      const checkPromises = foregroundChecks.map(async (cmd, i) => {
        try {
          const checkResult = perf
            ? await perf.track(`parallelCheck_${i + 1}`, () => this.adb.executeCommand(cmd))
            : await this.adb.executeCommand(cmd);
          const output = (checkResult && checkResult.stdout ? checkResult.stdout : "").trim();
          logger.info(`[LaunchApp] Parallel check ${i + 1} output: "${output}" (${output.length} chars)`);
          return output.length > 0;
        } catch (error) {
          logger.warn(`[LaunchApp] Parallel check ${i + 1} failed:`, error);
          return false;
        }
      });

      const results = await Promise.all(checkPromises);
      const isForeground = results.some(result => result);
      logger.info(`[LaunchApp] Final foreground status (parallel): ${isForeground}`);
      return isForeground;
    } catch (outerError) {
      logger.warn(`[LaunchApp] Parallel foreground check failed:`, outerError);
      return false;
    }
  }

  /**
   * Single dumpsys foreground check - uses one comprehensive dumpsys call
   */
  private async checkForegroundSingle(packageName: string, perf?: PerformanceTracker): Promise<boolean> {
    try {
      // Use a single dumpsys activity activities call and parse the output
      const cmd = `shell dumpsys activity activities | grep -E "(mResumedActivity|mFocusedActivity|topResumedActivity)" | head -5`;
      logger.info(`[LaunchApp] Single dumpsys check: ${cmd}`);

      const checkResult = perf
        ? await perf.track("singleCheck", () => this.adb.executeCommand(cmd))
        : await this.adb.executeCommand(cmd);

      const output = (checkResult && checkResult.stdout ? checkResult.stdout : "").trim();
      logger.info(`[LaunchApp] Single check output: "${output}" (${output.length} chars)`);

      const isForeground = output.includes(packageName);
      logger.info(`[LaunchApp] Final foreground status (single): ${isForeground}`);
      return isForeground;
    } catch (error) {
      logger.warn(`[LaunchApp] Single foreground check failed:`, error);
      return false;
    }
  }

  /**
   * Perform the actual app launch with timing
   */
  private async performLaunch(
    packageName: string,
    activityName: string | undefined,
    perf: PerformanceTracker
  ): Promise<{ success: boolean; packageName: string; activityName?: string }> {
    let targetActivity = activityName;

    // Try am start with intent first (alternative to monkey)
    if (!targetActivity) {
      const intentResult = await perf.track("intentLaunch", async () => {
        logger.info(`[LaunchApp] Trying am start with intent`);
        try {
          // Use am start with MAIN/LAUNCHER intent - more reliable than monkey
          const intentCmd = `shell am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n ${packageName}/.MainActivity 2>/dev/null || am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER ${packageName}`;
          logger.info(`[LaunchApp] Intent command: ${intentCmd}`);
          const result = await this.adb.executeCommand(intentCmd);
          // Check if launch was successful (no "Error" in output)
          if (result.stdout && !result.stdout.includes("Error")) {
            logger.info(`[LaunchApp] Intent launch completed successfully`);
            return { success: true };
          }
          logger.info(`[LaunchApp] Intent launch returned error: ${result.stdout}`);
          return { success: false };
        } catch (error) {
          logger.info(`[LaunchApp] Intent launch failed: ${error}, falling back to monkey`);
          return { success: false };
        }
      });

      if (intentResult.success) {
        perf.end();
        return {
          success: true,
          packageName,
          activityName: "intent_launch"
        };
      }
    }

    // Try monkey launch as fallback (fast but less reliable)
    if (!targetActivity) {
      const monkeyResult = await perf.track("monkeyLaunch", async () => {
        logger.info(`[LaunchApp] Trying monkey launch (fallback approach)`);
        try {
          const monkeyCmd = `shell monkey -p ${packageName} 1`;
          logger.info(`[LaunchApp] Monkey command: ${monkeyCmd}`);
          await this.adb.executeCommand(monkeyCmd);
          logger.info(`[LaunchApp] Monkey launch completed successfully`);
          return { success: true };
        } catch (error) {
          logger.info(`[LaunchApp] Monkey launch failed: ${error}, falling back to activity discovery`);
          return { success: false };
        }
      });

      if (monkeyResult.success) {
        perf.end();
        return {
          success: true,
          packageName,
          activityName: "monkey_launch"
        };
      }
    }

    // If no specific activity provided, get launcher activities from pm dump
    if (!targetActivity) {
      const launcherActivities = await perf.track("extractLauncherActivities", async () => {
        logger.info(`[LaunchApp] No activity specified, extracting launcher activities`);
        return this.extractLauncherActivities(packageName, perf);
      });

      if (launcherActivities.length > 0) {
        targetActivity = launcherActivities[0];
        logger.info(`[LaunchApp] Using first found activity: ${targetActivity}`);
      } else {
        // Try common activity name patterns
        const patternResult = await perf.track("tryCommonPatterns", async () => {
          logger.info(`[LaunchApp] No launcher activities found, trying common patterns`);
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
              return { success: true, pattern };
            } catch (error) {
              logger.info(`[LaunchApp] Pattern ${pattern} failed: ${error}`);
            }
          }
          return { success: false, pattern: null };
        });

        if (patternResult.success && patternResult.pattern) {
          perf.end();
          return {
            success: true,
            packageName,
            activityName: patternResult.pattern
          };
        }
      }
    }

    // Launch with specific activity if found, otherwise use default method
    if (targetActivity) {
      await perf.track("launchActivity", async () => {
        logger.info(`[LaunchApp] Launching with activity: ${targetActivity}`);
        const launchCmd = `shell am start -n ${packageName}/${targetActivity}`;
        logger.info(`[LaunchApp] Launch command: ${launchCmd}`);
        await this.adb.executeCommand(launchCmd);
        logger.info(`[LaunchApp] Launch command completed successfully`);
      });
    } else {
      // Fallback to launcher intent
      await perf.track("launcherIntent", async () => {
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
      });
    }

    logger.info(`[LaunchApp] Launch completed successfully`);
    perf.end();
    return {
      success: true,
      packageName,
      activityName: targetActivity
    };
  }
}
