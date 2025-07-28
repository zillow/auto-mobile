import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { UninstallAppResult } from "../../models/UninstallAppResult";
import { BootedDevice } from "../../models";
import { ListInstalledApps } from "../observe/ListInstalledApps";
import { Simctl } from "../../utils/ios-cmdline-tools/simctl";

// TODO: Create MCP tool call that exposes this functionality
export class UninstallApp {
  private device: BootedDevice;
  private adb: AdbUtils;
  private simctl: Simctl;

  constructor(device: BootedDevice, adb: AdbUtils | null = null, simctl: Simctl | null = null) {
    this.device = device;
    this.adb = adb || new AdbUtils(device);
    this.simctl = simctl || new Simctl(device);
  }

  /**
   * Uninstall an app - routes to platform-specific implementation
   * @param packageName - The package name or bundle identifier to uninstall
   * @param keepData - Whether to keep app data (Android only, ignored on iOS)
   */
  async execute(
    packageName: string,
    keepData: boolean = false,
  ): Promise<UninstallAppResult> {
    // Validate package name
    if (!packageName || !packageName.trim()) {
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
        return this.executeiOS(packageName);
      case "android":
        return this.executeAndroid(packageName, keepData);
      default:
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
   */
  private async executeAndroid(packageName: string, keepData: boolean): Promise<UninstallAppResult> {
    try {
      // Check if app is running and terminate if needed
      const listApps = new ListInstalledApps(this.device);

      const installed = (await listApps.execute()).find(app => app === packageName) !== undefined;

      if (!installed) {
        return {
          success: true,
          packageName,
          wasInstalled: false,
          keepData
        };
      }

      // TODO: query if app was running and needed to be stopped
      await this.adb.executeCommand(`shell am force-stop ${packageName}`);

      const cmd = keepData ?
        `shell pm uninstall -k ${packageName}` :
        `shell pm uninstall ${packageName}`;

      await this.adb.executeCommand(cmd);

      // Verify the app was uninstalled
      const isStillInstalled = (await listApps.execute()).find(app => app === packageName) !== undefined;

      if (isStillInstalled) {
        return {
          success: false,
          packageName,
          wasInstalled: true,
          keepData,
          error: "Failed to uninstall application"
        };
      }

      return {
        success: true,
        packageName,
        wasInstalled: true,
        keepData
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
