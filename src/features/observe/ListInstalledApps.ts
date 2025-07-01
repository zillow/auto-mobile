import { AdbUtils } from "../../utils/adb";
import { logger } from "../../utils/logger";

export class ListInstalledApps {
  private adb: AdbUtils;

  /**
   * Create an ListInstalledApps instance
   * @param deviceId - Optional device ID
   * @param adbUtils - Optional AdbUtils instance for testing
   */
  constructor(deviceId: string, adb: AdbUtils | null = null) {
    this.adb = adb || new AdbUtils(deviceId);
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
