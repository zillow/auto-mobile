import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { BootedDevice, ClearAppDataResult } from "../../models";
import { CheckAppStatus } from "./CheckAppStatus";

export class ClearAppData {
  private device: BootedDevice;
  private adb: AdbUtils;

  constructor(device: BootedDevice, adb: AdbUtils | null = null) {
    this.device = device;
    this.adb = adb || new AdbUtils(device);
  }

  async execute(
    packageName: string,
  ): Promise<ClearAppDataResult> {
    try {
      // Check if app is installed
      const checkAppStatus = new CheckAppStatus(this.device);
      const statusResult = await checkAppStatus.execute(packageName);

      if (!statusResult.success || !statusResult.isInstalled) {
        return {
          success: false,
          packageName,
          error: statusResult.error || "Application not installed"
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
