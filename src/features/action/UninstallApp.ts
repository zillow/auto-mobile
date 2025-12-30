import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { UninstallAppResult } from "../../models/UninstallAppResult";
import { BootedDevice } from "../../models";
import { ListInstalledApps } from "../observe/ListInstalledApps";
import { SimCtlClient } from "../../utils/ios-cmdline-tools/SimCtlClient";
import { createGlobalPerformanceTracker } from "../../utils/PerformanceTracker";

// TODO: Create MCP tool call that exposes this functionality
export class UninstallApp {
  private device: BootedDevice;
  private adb: AdbClient;
  private simctl: SimCtlClient;

  constructor(device: BootedDevice, adb: AdbClient | null = null, simctl: SimCtlClient | null = null) {
    this.device = device;
    this.adb = adb || new AdbClient(device);
    this.simctl = simctl || new SimCtlClient(device);
  }

  /**
   * Uninstall an app - routes to platform-specific implementation
   * @param packageName - The package name or bundle identifier to uninstall
   * @param keepData - Whether to keep app data (Android only, ignored on iOS)
   * @param userId - Optional Android user ID (auto-detected if not provided)
   */
  async execute(
    packageName: string,
    keepData: boolean = false,
    userId?: number
  ): Promise<UninstallAppResult> {
    const perf = createGlobalPerformanceTracker();
    perf.serial("uninstallApp");

    // Validate package name
    if (!packageName || !packageName.trim()) {
      perf.end();
      return {
        success: false,
        packageName: packageName || "",
        wasInstalled: false,
        keepData,
        error: "Invalid package name provided"
      };
    }

    switch (this.device.platform) {
      case "ios":
        return perf.track("iOSUninstall", () => this.executeiOS(packageName));
      case "android":
        return perf.track("androidUninstall", () => this.executeAndroid(packageName, keepData, userId));
      default:
        perf.end();
        throw new Error(`Unsupported platform: ${this.device.platform}`);
    }
  }

  /**
   * Uninstall an iOS app by bundle identifier
   * @param bundleId - The bundle identifier to uninstall
   */
  private async executeiOS(bundleId: string): Promise<UninstallAppResult> {
    try {
      // Check if app is installed
      const listApps = new ListInstalledApps(this.device);

      const installed = (await listApps.execute()).find(app => app === bundleId) !== undefined;

      if (!installed) {
        return {
          success: true,
          packageName: bundleId,
          wasInstalled: false,
          keepData: false
        };
      }

      // Terminate app if it's running before uninstalling
      // TODO: query if the app was running
      await this.simctl.killSimulator(this.device);

      // Uninstall the app
      await this.simctl.killSimulator(this.device);

      // Verify the app was uninstalled
      const isStillInstalled = (await listApps.execute()).find(app => app === bundleId) !== undefined;

      if (isStillInstalled) {
        return {
          success: false,
          packageName: bundleId,
          wasInstalled: true,
          keepData: false,
          error: "Failed to uninstall application"
        };
      }

      return {
        success: true,
        packageName: bundleId,
        wasInstalled: true,
        keepData: false // iOS doesn't support keeping data during uninstall
      };
    } catch (error) {
      return {
        success: false,
        packageName: bundleId,
        wasInstalled: true,
        keepData: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Uninstall an Android app by package name
   * @param packageName - The package name to uninstall
   * @param keepData - Whether to keep app data
   * @param userId - Optional Android user ID (auto-detected if not provided)
   */
  private async executeAndroid(packageName: string, keepData: boolean, userId?: number): Promise<UninstallAppResult> {
    try {
      // Auto-detect target user if not specified
      let targetUserId = userId;
      if (targetUserId === undefined) {
        // Check if app is in foreground and get its user
        const foregroundApp = await this.adb.getForegroundApp();
        if (foregroundApp && foregroundApp.packageName === packageName) {
          targetUserId = foregroundApp.userId;
        } else {
          // Get list of users and prefer work profile
          const users = await this.adb.listUsers();

          // Find first work profile (userId > 0 and running)
          const workProfile = users.find(u => u.userId > 0 && u.running);
          if (workProfile) {
            targetUserId = workProfile.userId;
          } else {
            // Fall back to primary user
            targetUserId = 0;
          }
        }
      }

      // Check if app is running and terminate if needed
      const listApps = new ListInstalledApps(this.device);

      const installed = (await listApps.execute()).find(app => app === packageName) !== undefined;

      if (!installed) {
        return {
          success: true,
          packageName,
          wasInstalled: false,
          keepData,
          userId: targetUserId
        };
      }

      // TODO: query if app was running and needed to be stopped
      await this.adb.executeCommand(`shell am force-stop --user ${targetUserId} ${packageName}`);

      const cmd = keepData ?
        `shell pm uninstall --user ${targetUserId} -k ${packageName}` :
        `shell pm uninstall --user ${targetUserId} ${packageName}`;

      await this.adb.executeCommand(cmd);

      // Verify the app was uninstalled
      const isStillInstalled = (await listApps.execute()).find(app => app === packageName) !== undefined;

      if (isStillInstalled) {
        return {
          success: false,
          packageName,
          wasInstalled: true,
          keepData,
          userId: targetUserId,
          error: "Failed to uninstall application"
        };
      }

      return {
        success: true,
        packageName,
        wasInstalled: true,
        keepData,
        userId: targetUserId
      };
    } catch (error) {
      return {
        success: false,
        packageName,
        wasInstalled: true,
        keepData,
        error: "Error occurred during application uninstallation"
      };
    }
  }
}
