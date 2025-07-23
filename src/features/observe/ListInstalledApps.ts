import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { logger } from "../../utils/logger";
import { ActionableError, BootedDevice } from "../../models";
import { IdbPython } from "../../utils/ios-cmdline-tools/idbPython";

export class ListInstalledApps {
  private adb: AdbUtils;
  private idb: IdbPython;
  private device: BootedDevice;
  /**
   * Create an ListInstalledApps instance
   * @param device - Optional device
   * @param adb - Optional AdbUtils instance for testing
   */
  constructor(device: BootedDevice, adb: AdbUtils | null = null, idb: IdbPython | null = null) {
    this.adb = adb || new AdbUtils(device);
    this.idb = idb || new IdbPython(device);
    this.device = device;
  }

  /**
   * List all installed packages on the device
   * @returns Promise with list of package names
   */
  async execute(): Promise<string[]> {
    try {
      switch (this.device.platform) {
        case "ios":
          // iOS device - use idb to get installed apps
          const apps = await this.idb.listApps();
          return apps.map((app: any) => app.bundleId);
        case "android":
          // Android device - use adb to get installed apps
          const { stdout } = await this.adb.executeCommand("shell pm list packages");
          return stdout
            .split("\n")
            .filter(line => line.startsWith("package:"))
            .map(line => line.replace("package:", "").trim());
        default:
          throw new ActionableError(`Unsupported platform: ${this.device.platform}`);
      }
    } catch (error) {
      logger.warn("Failed to list installed apps:", error);
      return []; // Return empty array on error
    }
  }
}
