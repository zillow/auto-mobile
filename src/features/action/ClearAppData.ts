import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { BootedDevice, ClearAppDataResult } from "../../models";
import { logger } from "../../utils/logger";
import { createGlobalPerformanceTracker } from "../../utils/PerformanceTracker";

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
    const perf = createGlobalPerformanceTracker();
    perf.serial("clearAppData");

    try {
      // pm clear both clears data AND stops the app, no need for separate force-stop
      await perf.track("pmClear", async () => {
        await this.adb.executeCommand(`shell pm clear ${packageName}`);
        logger.info("Clearing app data was successful");
      });

      perf.end();
      return {
        success: true,
        packageName
      };
    } catch {
      perf.end();
      return {
        success: false,
        packageName,
        error: "Failed to clear application data"
      };
    }
  }
}
