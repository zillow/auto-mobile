import { Timer, defaultTimer } from "./SystemTimer";
import { logger } from "./logger";
import type { AdbExecutor } from "./android-cmdline-tools/interfaces/AdbExecutor";
import type { InstalledAppsStore } from "../db/installedAppsRepository";

/**
 * Environment variable to configure polling interval (default: 5000ms)
 */
const DEFAULT_POLL_INTERVAL_MS = 5000;

/**
 * State tracking for a single work profile
 */
interface ProfileState {
  userId: number;
  hasAccessibilityService: boolean;
  lastRefreshMs: number;
}

/**
 * Interface for monitoring work profiles and polling for package updates
 * when accessibility service is not available
 */
export interface WorkProfileMonitor {
  /**
   * Start the polling monitor
   */
  start(): void;

  /**
   * Stop the polling monitor
   */
  stop(): void;

  /**
   * Update the accessibility service status for a profile
   * @param userId - The user ID of the profile
   * @param hasService - Whether the profile has accessibility service enabled
   */
  setProfileHasAccessibilityService(userId: number, hasService: boolean): void;

  /**
   * Get the current state of all tracked profiles
   */
  getProfileStates(): ProfileState[];

  /**
   * Manually trigger a refresh for a specific profile
   * @param userId - The user ID of the profile to refresh
   */
  refreshProfile(userId: number): Promise<void>;

  /**
   * Check if the monitor is currently running
   */
  isRunning(): boolean;
}

/**
 * Options for creating a WorkProfileMonitor
 */
interface WorkProfileMonitorOptions {
  deviceId: string;
  adb: AdbExecutor;
  installedAppsStore: InstalledAppsStore;
  timer?: Timer;
  pollIntervalMs?: number;
}

/**
 * Default implementation of WorkProfileMonitor
 * Polls work profiles without accessibility service at regular intervals
 */
export class DefaultWorkProfileMonitor implements WorkProfileMonitor {
  private readonly deviceId: string;
  private readonly adb: AdbExecutor;
  private readonly installedAppsStore: InstalledAppsStore;
  private readonly timer: Timer;
  private readonly pollIntervalMs: number;
  private readonly profileStates: Map<number, ProfileState> = new Map();
  private intervalHandle: NodeJS.Timeout | null = null;
  private running: boolean = false;

  constructor(options: WorkProfileMonitorOptions) {
    this.deviceId = options.deviceId;
    this.adb = options.adb;
    this.installedAppsStore = options.installedAppsStore;
    this.timer = options.timer ?? defaultTimer;

    // Allow override via environment variable
    const envInterval = process.env.AUTOMOBILE_WORK_PROFILE_POLL_INTERVAL_MS;
    this.pollIntervalMs = options.pollIntervalMs ??
      (envInterval ? parseInt(envInterval, 10) : DEFAULT_POLL_INTERVAL_MS);
  }

  start(): void {
    if (this.running) {
      logger.debug("[WORK_PROFILE_MONITOR] Already running");
      return;
    }

    this.running = true;
    logger.info(`[WORK_PROFILE_MONITOR] Starting polling (interval: ${this.pollIntervalMs}ms)`);

    this.intervalHandle = this.timer.setInterval(() => {
      void this.pollStaleProfiles();
    }, this.pollIntervalMs);
  }

  stop(): void {
    if (!this.running) {
      logger.debug("[WORK_PROFILE_MONITOR] Not running");
      return;
    }

    this.running = false;
    if (this.intervalHandle) {
      this.timer.clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    logger.info("[WORK_PROFILE_MONITOR] Stopped");
  }

  setProfileHasAccessibilityService(userId: number, hasService: boolean): void {
    const existing = this.profileStates.get(userId);
    if (existing) {
      existing.hasAccessibilityService = hasService;
      logger.debug(`[WORK_PROFILE_MONITOR] Updated profile ${userId} hasAccessibilityService=${hasService}`);
    } else {
      this.profileStates.set(userId, {
        userId,
        hasAccessibilityService: hasService,
        lastRefreshMs: 0
      });
      logger.debug(`[WORK_PROFILE_MONITOR] Added profile ${userId} hasAccessibilityService=${hasService}`);
    }
  }

  getProfileStates(): ProfileState[] {
    return Array.from(this.profileStates.values());
  }

  async refreshProfile(userId: number): Promise<void> {
    const state = this.profileStates.get(userId);
    if (!state) {
      logger.warn(`[WORK_PROFILE_MONITOR] No state found for profile ${userId}`);
      return;
    }

    logger.info(`[WORK_PROFILE_MONITOR] Refreshing packages for user ${userId}`);

    try {
      const result = await this.adb.executeCommand(
        `shell pm list packages --user ${userId}`,
        undefined,
        undefined,
        true
      );

      const packages = this.parsePackageList(result.stdout);
      const timestampMs = this.timer.now();

      // Upsert each package into the repository
      for (const pkg of packages) {
        await this.installedAppsStore.upsertInstalledApp(
          this.deviceId,
          userId,
          pkg.packageName,
          pkg.isSystem,
          timestampMs
        );
      }

      state.lastRefreshMs = timestampMs;
      logger.info(`[WORK_PROFILE_MONITOR] Refreshed ${packages.length} packages for user ${userId}`);
    } catch (error) {
      logger.warn(`[WORK_PROFILE_MONITOR] Failed to refresh packages for user ${userId}: ${error}`);
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Parse the output of `pm list packages` into package info
   */
  private parsePackageList(output: string): Array<{ packageName: string; isSystem: boolean }> {
    const packages: Array<{ packageName: string; isSystem: boolean }> = [];
    const lines = output.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      // Format: "package:com.example.app"
      if (trimmed.startsWith("package:")) {
        const packageName = trimmed.slice(8);
        if (packageName) {
          // We can't easily determine isSystem from pm list packages output
          // Default to false; system packages are typically already installed via main user
          packages.push({ packageName, isSystem: false });
        }
      }
    }

    return packages;
  }

  /**
   * Poll all profiles that don't have accessibility service
   */
  private async pollStaleProfiles(): Promise<void> {
    const profilesToRefresh = Array.from(this.profileStates.values())
      .filter(state => !state.hasAccessibilityService);

    if (profilesToRefresh.length === 0) {
      logger.debug("[WORK_PROFILE_MONITOR] No stale profiles to refresh");
      return;
    }

    logger.debug(`[WORK_PROFILE_MONITOR] Polling ${profilesToRefresh.length} stale profile(s)`);

    for (const profile of profilesToRefresh) {
      await this.refreshProfile(profile.userId);
    }
  }
}
