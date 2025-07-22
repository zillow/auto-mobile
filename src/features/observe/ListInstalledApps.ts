import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { logger } from "../../utils/logger";
import { BootedDevice } from "../../models";
import { DeviceDetection } from "../../utils/deviceDetection";
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
  constructor(device: BootedDevice, adb: AdbUtils, idb: IdbPython) {
    this.adb = adb;
    this.idb = idb;
    this.device = device;
  }

  /**
   * List all installed packages on the device
   * @returns Promise with list of package names
   */
  async execute(): Promise<string[]> {
    try {
      const isiOSDevice = DeviceDetection.isiOSDevice(this.device.deviceId);

      if (isiOSDevice) {
        // iOS device - use idb to get installed apps
        const { stdout } = await this.idb.executeCommand("list-apps --json");
        const apps = JSON.parse(stdout);
        return apps.map((app: any) => app.bundleId);
      } else {
        // Android device - use adb to get installed apps
        const { stdout } = await this.adb.executeCommand("shell pm list packages");

        return stdout
          .split("\n")
          .filter(line => line.startsWith("package:"))
          .map(line => line.replace("package:", "").trim());
      }
    } catch (error) {
      logger.warn("Failed to list installed apps:", error);
      return []; // Return empty array on error
    }
  }
}
