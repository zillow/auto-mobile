import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { BaseVisualChange } from "./BaseVisualChange";
import { BootedDevice, LaunchAppResult } from "../../models";
import { ActionableError } from "../../models";
import { TerminateApp } from "./TerminateApp";
import { ClearAppData } from "./ClearAppData";
import { logger } from "../../utils/logger";
import { ListInstalledApps } from "../observe/ListInstalledApps";
import { ViewHierarchy } from "../observe/ViewHierarchy";
import { SimCtlClient } from "../../utils/ios-cmdline-tools/SimCtlClient";
import { createGlobalPerformanceTracker, PerformanceTracker } from "../../utils/PerformanceTracker";
import { DisplayedTimeMetricsCollector } from "../performance/DisplayedTimeMetricsCollector";
import { serverConfig } from "../../utils/ServerConfig";
import { Timer, defaultTimer } from "../../utils/SystemTimer";

export interface TargetUserDetector {
  detectTargetUserId(packageName: string, userId?: number): Promise<number>;
}

export interface InstalledAppsProvider {
  listInstalledApps(): Promise<string[]>;
}

export interface LaunchAppDependencies {
  targetUserDetector?: TargetUserDetector;
  installedAppsProvider?: InstalledAppsProvider;
  performanceTrackerFactory?: () => PerformanceTracker;
}

export class LaunchApp extends BaseVisualChange {

  private simctl: SimCtlClient;
  private targetUserDetector: TargetUserDetector;
  private installedAppsProvider: InstalledAppsProvider;
  private performanceTrackerFactory: () => PerformanceTracker;
  /**
   * Create an LaunchApp instance
   * @param device - Optional device
   * @param adb - Optional AdbClient instance for testing
   * @param simctl - Optional SimCtlClient instance for testing
   * @param timer - Optional Timer instance for testing
   */
  constructor(
    device: BootedDevice,
    adb: AdbClient | null = null,
    simctl: SimCtlClient | null = null,
    timer: Timer = defaultTimer,
    dependencies: LaunchAppDependencies = {}) {
    super(device, adb, timer);
    this.device = device;
    this.simctl = simctl || new SimCtlClient(this.device);
    this.targetUserDetector = dependencies.targetUserDetector ?? {
      detectTargetUserId: (packageName: string, userId?: number) => this.detectTargetUserId(packageName, userId)
    };
    this.installedAppsProvider = dependencies.installedAppsProvider ?? {
      listInstalledApps: () => this.listInstalledApps()
    };
    this.performanceTrackerFactory = dependencies.performanceTrackerFactory ?? createGlobalPerformanceTracker;
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
   * @param userId - Optional Android user ID (auto-detected if not provided)
   * @param skipUiStability - Whether to skip UI stability checks
   */
  async execute(
    packageName: string,
    clearAppData: boolean,
    coldBoot: boolean,
    activityName?: string,
    userId?: number,
    skipUiStability?: boolean
  ): Promise<LaunchAppResult> {
    logger.info("execute");
    switch (this.device.platform) {
      case "ios":
        return this.executeiOS(packageName, clearAppData, coldBoot);
      case "android":
        return this.executeAndroid(packageName, clearAppData, coldBoot, activityName, userId, skipUiStability);
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

    let observationTimestampMs: number | undefined;

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

        await this.waitForIosHierarchyReady();
        observationTimestampMs = this.timer.now();
        return {
          success: true,
          packageName: bundleId,
          pid: launchResult.pid
        };
      },
      {
        changeExpected: false,
        observationTimestampProvider: () => observationTimestampMs
      }
    );
  }

  private async waitForIosHierarchyReady(
    timeoutMs: number = 2000,
    pollIntervalMs: number = 200
  ): Promise<void> {
    const viewHierarchy = new ViewHierarchy(this.device, this.adb);
    const startTime = this.timer.now();
    let attempts = 0;

    while (this.timer.now() - startTime < timeoutMs) {
      attempts += 1;
      try {
        const result = await viewHierarchy.getViewHierarchy();
        const hierarchy = result?.hierarchy as { error?: string } | null | undefined;
        if (hierarchy && !hierarchy.error) {
          logger.info(`[LaunchApp] iOS hierarchy ready after ${this.timer.now() - startTime}ms`);
          return;
        }
        logger.debug(`[LaunchApp] iOS hierarchy not ready yet (attempt ${attempts})`);
      } catch (error) {
        logger.debug(`[LaunchApp] iOS hierarchy fetch failed (attempt ${attempts}): ${error}`);
      }
      await this.timer.sleep(pollIntervalMs);
    }

    logger.warn(`[LaunchApp] Timed out waiting for iOS hierarchy after ${timeoutMs}ms`);
  }

  private async detectTargetUserId(
    packageName: string,
    userId?: number
  ): Promise<number> {
    if (userId !== undefined) {
      return userId;
    }

    // Check if app is in foreground and get its user
    const foregroundApp = await this.adb.getForegroundApp();
    if (foregroundApp && foregroundApp.packageName === packageName) {
      logger.info(`[LaunchApp] App is in foreground in user ${foregroundApp.userId}`);
      return foregroundApp.userId;
    }

    // Get list of users and prefer work profile
    const users = await this.adb.listUsers();

    // Find first work profile (userId > 0 and running)
    const workProfile = users.find(u => u.userId > 0 && u.running);
    if (workProfile) {
      logger.info(`[LaunchApp] Using work profile: user ${workProfile.userId}`);
      return workProfile.userId;
    }

    // Fall back to primary user
    logger.info(`[LaunchApp] Using primary user: user 0`);
    return 0;
  }

  private async listInstalledApps(): Promise<string[]> {
    return (new ListInstalledApps(this.device, this.adb)).execute();
  }

  /**
   * Launch an Android app by package name
   * @param packageName - The package name to launch
   * @param clearAppData - Whether clear app data before launch
   * @param coldBoot - Whether to cold boot the app or resume if already running
   * @param activityName - Optional activity name to launch
   * @param userId - Optional Android user ID (auto-detected if not provided)
   * @param skipUiStability - Whether to skip UI stability checks
   */
  private async executeAndroid(
    packageName: string,
    clearAppData: boolean,
    coldBoot: boolean,
    activityName?: string,
    userId?: number,
    skipUiStability?: boolean
  ): Promise<LaunchAppResult> {
    const perf = this.performanceTrackerFactory();
    perf.serial("launchApp");

    logger.info(`executeAndroid: ${packageName}`);

    const [targetUserResult, installedAppsResult] = await Promise.allSettled([
      // Auto-detect target user if not specified
      perf.track("detectTargetUser", async () => {
        return this.targetUserDetector.detectTargetUserId(packageName, userId);
      }),
      // Check app status (installation and running)
      perf.track("checkInstalled", async () => {
        return this.installedAppsProvider.listInstalledApps();
      })
    ]);

    if (targetUserResult.status === "rejected") {
      throw targetUserResult.reason;
    }
    if (installedAppsResult.status === "rejected") {
      throw installedAppsResult.reason;
    }

    const targetUserId = targetUserResult.value;
    const installedApps = installedAppsResult.value;
    logger.info(`[LaunchApp] Found ${installedApps.length} installed app(s)`);
    logger.info(`[LaunchApp] Looking for package: ${packageName}`);
    logger.info(`[LaunchApp] Installed apps: ${installedApps.join(", ")}`);
    if (!installedApps.includes(packageName)) {
      logger.error(`[LaunchApp] App ${packageName} is not installed`);
      logger.error(`[LaunchApp] DEBUG: installedApps.length = ${installedApps.length}`);
      logger.error(`[LaunchApp] DEBUG: installedApps = [${installedApps.join(", ")}]`);
      perf.end();
      return {
        success: false,
        packageName: packageName,
        userId: targetUserId,
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
    let alreadyForeground = false;

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
        // Check if app is in foreground - use getForegroundApp which returns user context
        const foregroundApp = await perf.track(`checkForeground`, async () => {
          return this.adb.getForegroundApp();
        });

        alreadyForeground = foregroundApp &&
                            foregroundApp.packageName === packageName &&
                            foregroundApp.userId === targetUserId;

        if (alreadyForeground) {
          logger.info(`[LaunchApp] App ${packageName} is already in foreground in user ${targetUserId}`);
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

    if (alreadyForeground) {
      const result = await this.observedInteraction(
        async () => {
          perf.end();
          return {
            success: true,
            packageName,
            activityName,
            userId: targetUserId
          };
        },
        {
          changeExpected: false,
          perf,
          packageName,
          skipPreviousObserve: true,
          skipUiStability: skipUiStability ?? false
        }
      );
      result.error = "App is already in foreground";
      result.success = true;
      return result;
    }

    logger.info(`[LaunchApp] Proceeding with app launch`);

    const captureDisplayedMetrics = serverConfig.isUiPerfModeEnabled();
    const displayedMetricsCollector = captureDisplayedMetrics
      ? new DisplayedTimeMetricsCollector(this.device, this.adb)
      : null;
    let displayedMetricsStartMs: number | null = null;

    const foregroundWaitTimeoutMs = 5000;
    const foregroundPollIntervalMs = 200;
    let observationTimestampMs: number | undefined;

    const launchResult = await this.observedInteraction(
      async () => {
        if (displayedMetricsCollector) {
          displayedMetricsStartMs = await perf.track(
            "displayedLogcatStartTime",
            () => this.adb.getDeviceTimestampMs()
          );
        }
        const launchOutcome = await this.performLaunch(packageName, activityName, targetUserId, perf);
        await this.waitForAppForeground(
          packageName,
          targetUserId,
          foregroundWaitTimeoutMs,
          foregroundPollIntervalMs,
          perf
        );
        observationTimestampMs = await this.adb.getDeviceTimestampMs();
        return launchOutcome;
      },
      {
        changeExpected: false,
        perf,
        skipPreviousObserve: true,
        skipUiStability: skipUiStability ?? false,
        packageName,
        observationTimestampProvider: () => observationTimestampMs
      }
    );

    if (displayedMetricsCollector && displayedMetricsStartMs !== null && launchResult?.observation) {
      const displayedMetricsEndMs = await perf.track(
        "displayedLogcatEndTime",
        () => this.adb.getDeviceTimestampMs()
      );
      const displayedTimeMetrics = await displayedMetricsCollector.captureDisplayedMetrics(
        {
          packageName,
          startTimestampMs: displayedMetricsStartMs,
          endTimestampMs: displayedMetricsEndMs
        },
        perf
      );
      launchResult.observation.displayedTimeMetrics = displayedTimeMetrics;
    }

    return launchResult;
  }

  /**
   * Wait for the target app to enter the foreground.
   */
  private async waitForAppForeground(
    packageName: string,
    userId: number,
    timeoutMs: number,
    pollIntervalMs: number,
    perf?: PerformanceTracker
  ): Promise<boolean> {
    const waitForForeground = async (): Promise<boolean> => {
      const startTime = this.timer.now();

      logger.info(`[LaunchApp] Waiting for ${packageName} to reach foreground (timeout: ${timeoutMs}ms)`);

      while (true) {
        const isForeground = await this.checkAppForeground(packageName, perf, userId);
        if (isForeground) {
          logger.info(`[LaunchApp] App ${packageName} reached foreground after ${this.timer.now() - startTime}ms`);
          return true;
        }

        if (this.timer.now() - startTime >= timeoutMs) {
          break;
        }

        await this.timer.sleep(pollIntervalMs);
      }

      logger.warn(`[LaunchApp] Timed out waiting for ${packageName} to reach foreground after ${timeoutMs}ms`);
      return false;
    };

    if (perf) {
      return perf.track("waitForForeground", waitForForeground);
    }

    return waitForForeground();
  }

  /**
   * Check if app is in foreground
   * @param packageName - Package name to check
   * @param perf - Optional performance tracker
   */
  private async checkAppForeground(
    packageName: string,
    perf?: PerformanceTracker,
    userId?: number
  ): Promise<boolean> {
    logger.info("[LaunchApp] Checking if app is in foreground");

    const foregroundApp = perf
      ? await perf.track("foregroundApp", () => this.adb.getForegroundApp())
      : await this.adb.getForegroundApp();

    if (foregroundApp) {
      const matchesPackage = foregroundApp.packageName === packageName;
      const matchesUser = userId === undefined || foregroundApp.userId === userId;
      const isForeground = matchesPackage && matchesUser;
      logger.info(`[LaunchApp] Foreground app match (adb): ${isForeground}`);
      if (isForeground) {
        return true;
      }
    }

    return this.checkForegroundDumpsys(packageName, perf);
  }

  /**
   * Foreground check using a single dumpsys call.
   */
  private async checkForegroundDumpsys(packageName: string, perf?: PerformanceTracker): Promise<boolean> {
    try {
      // Use a single dumpsys activity activities call and parse the output
      const cmd = `shell dumpsys activity activities | grep -E "(mResumedActivity|mFocusedActivity|topResumedActivity)" | head -5`;
      logger.info(`[LaunchApp] Dumpsys check: ${cmd}`);

      const checkResult = perf
        ? await perf.track("dumpsysCheck", () => this.adb.executeCommand(cmd))
        : await this.adb.executeCommand(cmd);

      const output = (checkResult && checkResult.stdout ? checkResult.stdout : "").trim();
      logger.info(`[LaunchApp] Dumpsys check output: "${output}" (${output.length} chars)`);

      const isForeground = output.includes(packageName);
      logger.info(`[LaunchApp] Final foreground status (dumpsys): ${isForeground}`);
      return isForeground;
    } catch (error) {
      logger.warn(`[LaunchApp] Dumpsys foreground check failed:`, error);
      return false;
    }
  }

  /**
   * Perform the actual app launch with timing
   */
  private async performLaunch(
    packageName: string,
    activityName: string | undefined,
    userId: number,
    perf: PerformanceTracker
  ): Promise<{ success: boolean; packageName: string; activityName?: string; userId: number }> {
    let targetActivity = activityName;

    // Try am start with intent first (alternative to monkey)
    if (!targetActivity) {
      const intentResult = await perf.track("intentLaunch", async () => {
        logger.info(`[LaunchApp] Trying am start with intent for user ${userId}`);
        try {
          // Use am start with MAIN/LAUNCHER intent - more reliable than monkey
          const intentCmd = `shell am start --user ${userId} -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n ${packageName}/.MainActivity 2>/dev/null || am start --user ${userId} -a android.intent.action.MAIN -c android.intent.category.LAUNCHER ${packageName}`;
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
          activityName: "intent_launch",
          userId
        };
      }
    }

    // Try monkey launch as fallback (fast but less reliable)
    if (!targetActivity) {
      const monkeyResult = await perf.track("monkeyLaunch", async () => {
        logger.info(`[LaunchApp] Trying monkey launch (fallback approach) for user ${userId}`);
        try {
          const monkeyCmd = `shell monkey -p ${packageName} --user ${userId} 1`;
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
          activityName: "monkey_launch",
          userId
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
              await this.adb.executeCommand(`shell am start --user ${userId} -n ${packageName}/${pattern}`);
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
            activityName: patternResult.pattern,
            userId
          };
        }
      }
    }

    // Launch with specific activity if found, otherwise use default method
    if (targetActivity) {
      await perf.track("launchActivity", async () => {
        logger.info(`[LaunchApp] Launching with activity: ${targetActivity} for user ${userId}`);
        const launchCmd = `shell am start --user ${userId} -n ${packageName}/${targetActivity}`;
        logger.info(`[LaunchApp] Launch command: ${launchCmd}`);
        await this.adb.executeCommand(launchCmd);
        logger.info(`[LaunchApp] Launch command completed successfully`);
      });
    } else {
      // Fallback to launcher intent
      await perf.track("launcherIntent", async () => {
        logger.info(`[LaunchApp] No activity found, trying launcher intent for user ${userId}`);
        try {
          const launcherCmd = `shell am start --user ${userId} -a android.intent.action.MAIN -c android.intent.category.LAUNCHER ${packageName}`;
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
      activityName: targetActivity,
      userId
    };
  }
}
