import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { BootedDevice, AppStatusResult } from "../../models";
import { IdbPython } from "../../utils/ios-cmdline-tools/idbPython";

export class CheckAppStatus {
  private device: BootedDevice;
  private adb: AdbUtils;
  private idb: IdbPython;

  constructor(device: BootedDevice, adb: AdbUtils | null = null, idb: IdbPython | null = null) {
    this.device = device;
    this.adb = adb || new AdbUtils(device);
    this.idb = idb || new IdbPython(device);
  }

  /**
   * Check comprehensive app status (installation and running) - routes to platform-specific implementation
   * @param packageName - The package name or bundle identifier to check
   */
  async execute(packageName: string): Promise<AppStatusResult> {
    switch (this.device.platform) {
      case "ios":
        return this.executeiOS(packageName);
      case "android":
        return this.executeAndroid(packageName);
      default:
        throw new Error(`Unsupported platform: ${this.device.platform}`);
    }
  }

  /**
   * Check iOS app installation and running status by bundle identifier
   * @param bundleId - The bundle identifier to check
   */
  private async executeiOS(bundleId: string): Promise<AppStatusResult> {
    try {
      const installedAppsResult = await this.idb.listApps();
      const apps = Array.isArray(installedAppsResult) ? installedAppsResult : [];
      
      // Find the app in the list and check both installation and running status
      const app = apps.find((app: any) => app.bundle_id === bundleId);
      const isInstalled = !!app;
      const isRunning = app ? app.isRunning : false;

      return {
        success: true,
        packageName: bundleId,
        isInstalled,
        isRunning
      };
    } catch (error) {
      return {
        success: false,
        packageName: bundleId,
        isInstalled: false,
        isRunning: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Check Android app installation and running status by package name
   * @param packageName - The package name to check
   */
  private async executeAndroid(packageName: string): Promise<AppStatusResult> {
    try {
      // Check if app is installed
      const isInstalledCmd = `shell pm list packages -f ${packageName} | grep -c ${packageName}`;
      const isInstalledOutput = await this.adb.executeCommand(isInstalledCmd);
      const isInstalled = parseInt(isInstalledOutput.trim(), 10) > 0;

      // Check if app is running (only if installed)
      let isRunning = false;
      if (isInstalled) {
        const isRunningCmd = `shell ps | grep ${packageName} | grep -v grep | wc -l`;
        const isRunningOutput = await this.adb.executeCommand(isRunningCmd);
        isRunning = parseInt(isRunningOutput.trim(), 10) > 0;
      }

      return {
        success: true,
        packageName,
        isInstalled,
        isRunning
      };
    } catch (error) {
      return {
        success: false,
        packageName,
        isInstalled: false,
        isRunning: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
} 