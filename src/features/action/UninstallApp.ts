import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { UninstallAppResult } from "../../models/UninstallAppResult";
import { BootedDevice } from "../../models";
import { CheckAppStatus } from "./CheckAppStatus";
import { IdbPython } from "../../utils/ios-cmdline-tools/idbPython";

// TODO: Create MCP tool call that exposes this functionality
export class UninstallApp {
  private device: BootedDevice;
  private adb: AdbUtils;
  private idb: IdbPython;

  constructor(device: BootedDevice, adb: AdbUtils | null = null, idb: IdbPython | null = null) {
    this.device = device;
    this.adb = adb || new AdbUtils(device);
    this.idb = idb || new IdbPython(device);
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
      const checkAppStatus = new CheckAppStatus(this.device);
      const statusResult = await checkAppStatus.execute(bundleId);

      if (!statusResult.success || !statusResult.isInstalled) {
        return {
          success: true,
          packageName: bundleId,
          wasInstalled: false,
          keepData: false
        };
      }

      // Terminate app if it's running before uninstalling
      if (statusResult.isRunning) {
        try {
          await this.idb.terminateApp(bundleId);
        } catch (error) {
          // App might not be running or already terminated, continue with uninstall
        }
      }

      // Uninstall the app
      await this.idb.uninstallApp(bundleId);

      // Verify the app was uninstalled
      const postUninstallStatus = new CheckAppStatus(this.device);
      const postUninstallResult = await postUninstallStatus.execute(bundleId);
      const isStillInstalled = postUninstallResult.success && postUninstallResult.isInstalled;

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
      const appStatus = new CheckAppStatus(this.device);
      const statusResult = await appStatus.execute(packageName);
      const isRunning = statusResult.success && statusResult.isRunning;
      const isInstalled = statusResult.success && statusResult.isInstalled;

      if (!isInstalled) {
        return {
          success: true,
          packageName,
          wasInstalled: false,
          keepData
        };
      }

      if (isRunning) {
        await this.adb.executeCommand(`shell am force-stop ${packageName}`);
      }

      const cmd = keepData ?
        `shell pm uninstall -k ${packageName}` :
        `shell pm uninstall ${packageName}`;

      await this.adb.executeCommand(cmd);

      // Check if the package is still installed after uninstallation
      const postUninstallAppStatus = new CheckAppStatus(this.device);
      const postUninstallStatusResult = await postUninstallAppStatus.execute(packageName);
      const isStillInstalled = postUninstallStatusResult.success && postUninstallStatusResult.isInstalled;

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
