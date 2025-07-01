import { AdbUtils } from "../../utils/adb";
import { UninstallAppResult } from "../../models/UninstallAppResult";

// TODO: Create MCP tool call that exposes this functionality
export class UninstallApp {
  private adb: AdbUtils;

  constructor(deviceId: string, adb: AdbUtils | null = null) {
    this.adb = adb || new AdbUtils(deviceId);
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
      // Check if app is installed
      const isInstalledCmd = `shell pm list packages -f ${packageName} | grep -c ${packageName}`;
      const isInstalledOutput = await this.adb.executeCommand(isInstalledCmd);
      const isInstalled = parseInt(isInstalledOutput.trim(), 10) > 0;

      if (!isInstalled) {
        return {
          success: true,
          packageName,
          wasInstalled: false,
          keepData
        };
      }

      // Check if app is running and terminate if needed
      const isRunningCmd = `shell ps | grep ${packageName} | grep -v grep | wc -l`;
      const isRunningOutput = await this.adb.executeCommand(isRunningCmd);
      const isRunning = parseInt(isRunningOutput.trim(), 10) > 0;

      if (isRunning) {
        await this.adb.executeCommand(`shell am force-stop ${packageName}`);
      }

      const cmd = keepData ?
        `shell pm uninstall -k ${packageName}` :
        `shell pm uninstall ${packageName}`;

      await this.adb.executeCommand(cmd);

      // Check if the package is still installed after uninstallation
      const isStillInstalledCmd = `shell pm list packages -f ${packageName} | grep -c ${packageName}`;
      const isStillInstalledOutput = await this.adb.executeCommand(isStillInstalledCmd);
      const isStillInstalled = parseInt(isStillInstalledOutput.trim(), 10) > 0;

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
