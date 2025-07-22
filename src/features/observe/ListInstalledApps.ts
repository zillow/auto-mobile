import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { logger } from "../../utils/logger";
import { BootedDevice } from "../../models";

export class ListInstalledApps {
  private adb: AdbUtils;

  /**
   * Create an ListInstalledApps instance
   * @param device - Optional device
   * @param adb - Optional AdbUtils instance for testing
   */
  constructor(device: BootedDevice, adb: AdbUtils | null = null) {
    this.adb = adb || new AdbUtils(device);
  }

  /**
   * List all installed packages on the device
   * @returns Promise with list of package names
   */
  async execute(): Promise<string[]> {
    try {
      const { stdout } = await this.adb.executeCommand("shell pm list packages");

      return stdout
        .split("\n")
        .filter(line => line.startsWith("package:"))
        .map(line => line.replace("package:", "").trim());
    } catch (error) {
      logger.warn("Failed to list installed apps:", error);
      return []; // Return empty array on error
    }
  }
}
