import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { UninstallAppResult } from "../../models/UninstallAppResult";
import { BootedDevice } from "../../models";
import { CheckAppStatus } from "./CheckAppStatus";

// TODO: Create MCP tool call that exposes this functionality
export class UninstallApp {
  private device: BootedDevice;
  private adb: AdbUtils;

  constructor(device: BootedDevice, adb: AdbUtils | null = null) {
    this.device = device;
    this.adb = adb || new AdbUtils(device);
  }

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
