import { AdbUtils } from "../../utils/adb";
import { ClearAppDataResult } from "../../models";

export class ClearAppData {
  private adb: AdbUtils;

  constructor(deviceId: string, adb: AdbUtils | null = null) {
    this.adb = adb || new AdbUtils(deviceId);
  }

  async execute(
    packageName: string,
  ): Promise<ClearAppDataResult> {
    try {
      // Check if app is installed
      const isInstalledCmd = `shell pm list packages -f ${packageName} | grep -c ${packageName}`;
      const isInstalledOutput = await this.adb.executeCommand(isInstalledCmd);
      const isInstalled = parseInt(isInstalledOutput.trim(), 10) > 0;

      if (!isInstalled) {
        return {
          success: false,
          packageName,
          error: "Application not installed"
        };
      }

      await this.adb.executeCommand(`shell am force-stop ${packageName}`);
      // TODO: need to poll for app stopped via dumpsys
      // TODO: Add awaitidle

      await this.adb.executeCommand(`shell pm clear ${packageName}`);

      return {
        success: true,
        packageName
      };
    } catch (error) {
      return {
        success: false,
        packageName,
        error: "Failed to clear application data"
      };
    }
  }
}
