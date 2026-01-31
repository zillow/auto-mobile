import { AdbClientFactory, defaultAdbClientFactory } from "../../utils/android-cmdline-tools/AdbClientFactory";
import type { AdbExecutor } from "../../utils/android-cmdline-tools/interfaces/AdbExecutor";
import { logger } from "../../utils/logger";
import { ActionableError, BootedDevice, InstalledAppsByProfile, SystemInstalledApp } from "../../models";
import { SimCtlClient } from "../../utils/ios-cmdline-tools/SimCtlClient";
import { InstalledAppsRepository, InstalledAppsStore } from "../../db/installedAppsRepository";
import { Timer, defaultTimer } from "../../utils/SystemTimer";
import type { InstalledApp as DbInstalledApp, NewInstalledApp } from "../../db/types";

const INSTALLED_APPS_CACHE_TTL_MS = 5 * 60 * 1000;

interface ListInstalledAppsOptions {
  cacheEnabled?: boolean;
  installedAppsRepository?: InstalledAppsStore;
  timer?: Timer;
}

export class ListInstalledApps {
  private adb: AdbExecutor;
  private simctl: SimCtlClient;
  private device: BootedDevice;
  private installedAppsRepository: InstalledAppsStore;
  private cacheEnabled: boolean;
  private timer: Timer;
  /**
   * Create an ListInstalledApps instance
   * @param device - Optional device
   * @param adbFactoryOrExecutor - Factory for creating AdbClient instances, or an AdbExecutor for testing
   * @param simctl - Optional SimCtlClient instance for testing
   * @param options - Optional cache configuration
   */
  constructor(
    device: BootedDevice,
    adbFactoryOrExecutor: AdbClientFactory | AdbExecutor | null = defaultAdbClientFactory,
    simctl: SimCtlClient | null = null,
    options: ListInstalledAppsOptions = {}
  ) {
    // Detect if the argument is a factory (has create method) or an executor
    if (adbFactoryOrExecutor && typeof (adbFactoryOrExecutor as AdbClientFactory).create === "function") {
      this.adb = (adbFactoryOrExecutor as AdbClientFactory).create(device);
    } else if (adbFactoryOrExecutor) {
      this.adb = adbFactoryOrExecutor as AdbExecutor;
    } else {
      this.adb = defaultAdbClientFactory.create(device);
    }
    this.simctl = simctl || new SimCtlClient(device);
    this.device = device;
    this.installedAppsRepository = options.installedAppsRepository ?? new InstalledAppsRepository();
    // Enable caching by default when using the production factory
    const defaultCacheEnabled = adbFactoryOrExecutor === defaultAdbClientFactory;
    this.cacheEnabled = options.cacheEnabled ?? defaultCacheEnabled;
    this.timer = options.timer ?? defaultTimer;
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
      if (this.cacheEnabled) {
        const cachedApps = await this.getCachedInstalledApps();
        if (cachedApps) {
          return cachedApps;
        }
      }

      return await this.rebuildInstalledAppsCache();
    } catch (error) {
      logger.warn("Failed to list installed apps with details:", error);
      return { profiles: {}, system: [] };
    }
  }

  private async getCachedInstalledApps(): Promise<InstalledAppsByProfile | null> {
    const lastVerifiedAt = await this.installedAppsRepository.getLatestVerification(this.device.deviceId);
    if (!lastVerifiedAt) {
      return null;
    }

    const cacheAgeMs = this.timer.now() - lastVerifiedAt;
    if (cacheAgeMs > INSTALLED_APPS_CACHE_TTL_MS) {
      return null;
    }

    const cachedRows = await this.installedAppsRepository.listInstalledApps(this.device.deviceId);
    if (cachedRows.length === 0) {
      return null;
    }

    const foregroundApp = await this.adb.getForegroundApp();
    logger.info(`[ListInstalledApps] Using cached installed apps list (age ${cacheAgeMs}ms, rows ${cachedRows.length})`);
    return this.buildInstalledAppsFromRows(cachedRows, foregroundApp);
  }

  private buildInstalledAppsFromRows(
    rows: DbInstalledApp[],
    foregroundApp: { packageName: string; userId: number } | null
  ): InstalledAppsByProfile {
    const installedApps: InstalledAppsByProfile = { profiles: {}, system: [] };
    const systemAppsMap = new Map<string, SystemInstalledApp>();

    for (const row of rows) {
      const isForeground = foregroundApp !== null &&
        foregroundApp.packageName === row.package_name &&
        foregroundApp.userId === row.user_id;

      if (row.is_system) {
        const existing = systemAppsMap.get(row.package_name);
        if (existing) {
          if (!existing.userIds.includes(row.user_id)) {
            existing.userIds.push(row.user_id);
          }
          existing.foreground = existing.foreground || isForeground;
        } else {
          systemAppsMap.set(row.package_name, {
            packageName: row.package_name,
            userIds: [row.user_id],
            foreground: isForeground,
            recent: false
          });
        }
      } else {
        installedApps.profiles[row.user_id] = installedApps.profiles[row.user_id] || [];
        installedApps.profiles[row.user_id].push({
          packageName: row.package_name,
          userId: row.user_id,
          foreground: isForeground,
          recent: false
        });
      }
    }

    installedApps.system = Array.from(systemAppsMap.values());
    return installedApps;
  }

  private async rebuildInstalledAppsCache(): Promise<InstalledAppsByProfile> {
    const installedApps: InstalledAppsByProfile = { profiles: {}, system: [] };
    const systemAppsMap = new Map<string, SystemInstalledApp>();
    const cacheEntries: NewInstalledApp[] = [];
    const cacheKeys = new Set<string>();
    const timestampMs = this.timer.now();
    let hadUserErrors = false;

    // Get all users on the device
    logger.info("[ListInstalledApps] Getting list of users...");
    const users = await this.adb.listUsers();
    logger.info(`[ListInstalledApps] Found ${users.length} user(s): ${users.map(u => `${u.userId}:${u.name}`).join(", ")}`);
    if (users.length === 0) {
      logger.warn("[ListInstalledApps] No users reported; skipping cache update");
      return installedApps;
    }

    // Get the current foreground app
    const foregroundApp = await this.adb.getForegroundApp();

    // List packages for each user
    for (const user of users) {
      try {
        logger.info(`[ListInstalledApps] Listing packages for user ${user.userId}...`);

        const allPackages = await this.listPackagesForUser(user.userId);
        const systemPackages = await this.listPackagesForUser(user.userId, "-s");
        const systemPackageSet = new Set(systemPackages);
        const userPackages = allPackages.filter(packageName => !systemPackageSet.has(packageName));

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

          const cacheKey = `${user.userId}:${packageName}:0`;
          if (!cacheKeys.has(cacheKey)) {
            cacheKeys.add(cacheKey);
            cacheEntries.push({
              device_id: this.device.deviceId,
              user_id: user.userId,
              package_name: packageName,
              is_system: 0,
              installed_at: timestampMs,
              last_verified_at: timestampMs
            });
          }
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

          const cacheKey = `${user.userId}:${packageName}:1`;
          if (!cacheKeys.has(cacheKey)) {
            cacheKeys.add(cacheKey);
            cacheEntries.push({
              device_id: this.device.deviceId,
              user_id: user.userId,
              package_name: packageName,
              is_system: 1,
              installed_at: timestampMs,
              last_verified_at: timestampMs
            });
          }
        }
      } catch (error) {
        hadUserErrors = true;
        logger.warn(`Failed to list packages for user ${user.userId}:`, error);
        // Continue with other users
      }
    }

    installedApps.system = Array.from(systemAppsMap.values());
    const profileAppCount = Object.values(installedApps.profiles).reduce((count, apps) => count + apps.length, 0);

    logger.info(`Found ${profileAppCount} user app(s) across ${users.length} user(s); ${installedApps.system.length} system app(s) deduped`);

    if (this.cacheEnabled && !hadUserErrors) {
      await this.installedAppsRepository.replaceInstalledApps(this.device.deviceId, cacheEntries);
    } else if (this.cacheEnabled && hadUserErrors) {
      logger.warn("[ListInstalledApps] Skipping cache update due to user listing errors");
    }

    return installedApps;
  }

  private async listPackagesForUser(userId: number, filterFlag?: "-s" | "-3"): Promise<string[]> {
    const flag = filterFlag ? ` ${filterFlag}` : "";
    const { stdout } = await this.adb.executeCommand(
      `shell pm list packages${flag} --user ${userId}`
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
