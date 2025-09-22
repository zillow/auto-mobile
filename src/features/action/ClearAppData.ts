import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { BootedDevice, ClearAppDataResult } from "../../models";
import { logger } from "../../utils/logger";

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
      await this.adb.executeCommand(`shell am force-stop ${packageName}`);
      logger.info("Force stopping the application successful");
      // TODO: need to poll for app stopped via dumpsys
      // TODO: Add awaitidle

      await this.adb.executeCommand(`shell pm clear ${packageName}`);
      logger.info("Clearing app data was successful");

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
