import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { logger } from "../../utils/logger";
import { ActionableError, BootedDevice, InstalledAppsByProfile, SystemInstalledApp } from "../../models";
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
          return this.flattenPackageNames(detailedApps);
        default:
          throw new ActionableError(`Unsupported platform: ${this.device.platform}`);
      }
    } catch (error) {
      logger.warn("Failed to list installed apps:", error);
      return []; // Return empty array on error
    }
  }

  /**
   * List installed packages on Android grouped by user profile, with system apps deduped.
   * @returns Promise with grouped installed app details
   */
  async executeDetailed(): Promise<InstalledAppsByProfile> {
    if (this.device.platform !== "android") {
      logger.warn("executeDetailed() is only supported on Android");
      return { profiles: {}, system: [] };
    }

    try {
      const installedApps: InstalledAppsByProfile = { profiles: {}, system: [] };
      const systemAppsMap = new Map<string, SystemInstalledApp>();

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

          const systemPackages = await this.listPackagesForUser(user.userId, "-s");
          const userPackages = await this.listPackagesForUser(user.userId, "-3");

          logger.info(`[ListInstalledApps] Found ${userPackages.length} user package(s) and ${systemPackages.length} system package(s) for user ${user.userId}`);

          installedApps.profiles[user.userId] = installedApps.profiles[user.userId] || [];

          for (const packageName of userPackages) {
            const isForeground = foregroundApp !== null &&
                                 foregroundApp.packageName === packageName &&
                                 foregroundApp.userId === user.userId;

            installedApps.profiles[user.userId].push({
              packageName,
              userId: user.userId,
              foreground: isForeground,
              recent: false // TODO: Implement recent app detection
            });
          }

          for (const packageName of systemPackages) {
            const isForeground = foregroundApp !== null &&
                                 foregroundApp.packageName === packageName &&
                                 foregroundApp.userId === user.userId;

            const existing = systemAppsMap.get(packageName);
            if (existing) {
              if (!existing.userIds.includes(user.userId)) {
                existing.userIds.push(user.userId);
              }
              existing.foreground = existing.foreground || isForeground;
            } else {
              systemAppsMap.set(packageName, {
                packageName,
                userIds: [user.userId],
                foreground: isForeground,
                recent: false // TODO: Implement recent app detection
              });
            }
          }
        } catch (error) {
          logger.warn(`Failed to list packages for user ${user.userId}:`, error);
          // Continue with other users
        }
      }

      installedApps.system = Array.from(systemAppsMap.values());
      const profileAppCount = Object.values(installedApps.profiles).reduce((count, apps) => count + apps.length, 0);

      logger.info(`Found ${profileAppCount} user app(s) across ${users.length} user(s); ${installedApps.system.length} system app(s) deduped`);
      return installedApps;
    } catch (error) {
      logger.warn("Failed to list installed apps with details:", error);
      return { profiles: {}, system: [] };
    }
  }

  private async listPackagesForUser(userId: number, filterFlag: "-s" | "-3"): Promise<string[]> {
    const { stdout } = await this.adb.executeCommand(
      `shell pm list packages ${filterFlag} --user ${userId}`
    );
    return this.parsePackages(stdout);
  }

  private parsePackages(stdout: string): string[] {
    return stdout
      .split("\n")
      .filter(line => line.startsWith("package:"))
      .map(line => line.replace("package:", "").trim())
      .filter(pkg => pkg.length > 0);
  }

  private flattenPackageNames(detailedApps: InstalledAppsByProfile): string[] {
    const packageNames = new Set<string>();
    for (const apps of Object.values(detailedApps.profiles)) {
      for (const app of apps) {
        packageNames.add(app.packageName);
      }
    }
    for (const app of detailedApps.system) {
      packageNames.add(app.packageName);
    }
    return Array.from(packageNames);
  }
}
