import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { logger } from "../../utils/logger";
import { ActionableError, BootedDevice, InstalledApp } from "../../models";
import { SimCtlClient } from "../../utils/ios-cmdline-tools/SimCtlClient";

export class ListInstalledApps {
  private adb: AdbClient;
  private simctl: SimCtlClient;
  private device: BootedDevice;
  /**
   * Create an ListInstalledApps instance
   * @param device - Optional device
   * @param adb - Optional AdbClient instance for testing
   * @param simctl - Optional SimCtlClient instance for testing
   */
  constructor(device: BootedDevice, adb: AdbClient | null = null, simctl: SimCtlClient | null = null) {
    this.adb = adb || new AdbClient(device);
    this.simctl = simctl || new SimCtlClient(device);
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
          const apps = await this.simctl.listApps();
          return apps.map((app: any) => app.bundleId);
        case "android":
          // For backward compatibility, just return package names
          const detailedApps = await this.executeDetailed();
          return detailedApps.map(app => app.packageName);
        default:
          throw new ActionableError(`Unsupported platform: ${this.device.platform}`);
      }
    } catch (error) {
      logger.warn("Failed to list installed apps:", error);
      return []; // Return empty array on error
    }
  }

  /**
   * List all installed packages on Android with detailed user profile information
   * Returns apps from all user profiles (personal, work, etc.) with foreground/recent status
   * @returns Promise with list of installed app details
   */
  async executeDetailed(): Promise<InstalledApp[]> {
    if (this.device.platform !== "android") {
      logger.warn("executeDetailed() is only supported on Android");
      return [];
    }

    try {
      const installedApps: InstalledApp[] = [];

      // Get all users on the device
      logger.info("[ListInstalledApps] Getting list of users...");
      const users = await this.adb.listUsers();
      logger.info(`[ListInstalledApps] Found ${users.length} user(s): ${users.map(u => `${u.userId}:${u.name}`).join(", ")}`);

      // Get the current foreground app
      const foregroundApp = await this.adb.getForegroundApp();

      // List packages for each user
      for (const user of users) {
        try {
          logger.info(`[ListInstalledApps] Listing packages for user ${user.userId}...`);
          const { stdout } = await this.adb.executeCommand(
            `shell pm list packages --user ${user.userId}`
          );
          logger.info(`[ListInstalledApps] Got ${stdout.length} chars of output for user ${user.userId}`);

          const packages = stdout
            .split("\n")
            .filter(line => line.startsWith("package:"))
            .map(line => line.replace("package:", "").trim())
            .filter(pkg => pkg.length > 0);

          logger.info(`[ListInstalledApps] Found ${packages.length} package(s) for user ${user.userId}`);

          for (const packageName of packages) {
            const isForeground = foregroundApp !== null &&
                                 foregroundApp.packageName === packageName &&
                                 foregroundApp.userId === user.userId;

            installedApps.push({
              packageName,
              userId: user.userId,
              foreground: isForeground,
              recent: false // TODO: Implement recent app detection
            });
          }
        } catch (error) {
          logger.warn(`Failed to list packages for user ${user.userId}:`, error);
          // Continue with other users
        }
      }

      logger.info(`Found ${installedApps.length} installed app(s) across ${users.length} user(s)`);
      return installedApps;
    } catch (error) {
      logger.warn("Failed to list installed apps with details:", error);
      return [];
    }
  }
}
