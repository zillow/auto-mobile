import { BootedDevice, ActionableError, DeviceSnapshotManifest, DeviceSnapshotType } from "../../models";
import { AdbClientFactory, defaultAdbClientFactory } from "../../utils/android-cmdline-tools/AdbClientFactory";
import type { AdbExecutor } from "../../utils/android-cmdline-tools/interfaces/AdbExecutor";
import { AndroidEmulatorClient } from "../../utils/android-cmdline-tools/AndroidEmulatorClient";
import {
  buildVmSnapshotCommand,
  evaluateVmSnapshotResult,
  formatVmSnapshotExecutionError
} from "../../utils/android-cmdline-tools/vmSnapshot";
import { DeviceSnapshotStore } from "../../utils/DeviceSnapshotStore";
import { logger } from "../../utils/logger";
import { promises as fs } from "fs";
import * as path from "path";
import { Timer, defaultTimer } from "../../utils/SystemTimer";

export interface CaptureSnapshotArgs {
  snapshotName: string;
  includeAppData?: boolean;
  includeSettings?: boolean;
  useVmSnapshot?: boolean;
  strictBackupMode?: boolean; // If true, fail entire snapshot if app data backup fails
  backupTimeoutMs?: number; // Timeout in milliseconds for adb backup (default: 30000ms)
  userApps?: "current" | "all"; // Which apps to backup: "current" (foreground app only) or "all" (all user apps)
  vmSnapshotTimeoutMs?: number; // Timeout in milliseconds for emulator VM snapshot commands (default: 30000ms)
  appBundleIds?: string[]; // iOS-only: bundle identifiers to include in app data snapshot
}

export interface CaptureSnapshotResult {
  snapshotName: string;
  timestamp: string;
  snapshotType: DeviceSnapshotType;
  manifest: DeviceSnapshotManifest;
}

/**
 * Capture device state snapshot
 * Supports VM snapshots for emulators and ADB-based capture for all devices
 */
export class CaptureSnapshot {
  private device: BootedDevice;
  private adb: AdbExecutor;
  private emulator: AndroidEmulatorClient;
  private store: DeviceSnapshotStore;
  private timer: Timer;

  constructor(
    device: BootedDevice,
    adbFactory: AdbClientFactory = defaultAdbClientFactory,
    emulator?: AndroidEmulatorClient,
    timer: Timer = defaultTimer,
    store: DeviceSnapshotStore = new DeviceSnapshotStore()
  ) {
    if (device.platform !== "android") {
      throw new ActionableError("Snapshot capture is currently only supported for Android devices");
    }

    this.device = device;
    this.adb = adbFactory.create(device);
    this.emulator = emulator || new AndroidEmulatorClient();
    this.store = store;
    this.timer = timer;
  }

  /**
   * Execute snapshot capture
   */
  async execute(args: CaptureSnapshotArgs): Promise<CaptureSnapshotResult> {
    const {
      snapshotName,
      includeAppData = true,
      includeSettings = true,
      useVmSnapshot = true,
      strictBackupMode = false,
      backupTimeoutMs = 30000,
      userApps = "current",
      vmSnapshotTimeoutMs = 30000
    } = args;

    logger.info(`Capturing snapshot '${snapshotName}' for device ${this.device.deviceId}`);

    // Determine if we can use VM snapshot
    const isEmulator = this.device.deviceId.startsWith("emulator-");
    const shouldUseVmSnapshot = useVmSnapshot && isEmulator;

    let manifest: DeviceSnapshotManifest;

    if (shouldUseVmSnapshot) {
      manifest = await this.captureVmSnapshot(snapshotName, includeSettings, vmSnapshotTimeoutMs);
    } else {
      manifest = await this.captureAdbSnapshot(
        snapshotName,
        includeAppData,
        includeSettings,
        strictBackupMode,
        backupTimeoutMs,
        userApps
      );
    }

    logger.info(`Snapshot '${snapshotName}' captured successfully (type: ${manifest.snapshotType})`);

    return {
      snapshotName: manifest.snapshotName,
      timestamp: manifest.timestamp,
      snapshotType: manifest.snapshotType,
      manifest
    };
  }

  /**
   * Capture VM snapshot using emulator console
   */
  private async captureVmSnapshot(
    snapshotName: string,
    includeSettings: boolean,
    vmSnapshotTimeoutMs: number
  ): Promise<DeviceSnapshotManifest> {
    logger.info(`Using VM snapshot for emulator ${this.device.deviceId}`);

    try {
      // Save VM snapshot using ADB emu command
      const saveCommand = buildVmSnapshotCommand("save", snapshotName);
      logger.info(`Executing: adb -s ${this.device.deviceId} ${saveCommand}`);

      let result;
      try {
        result = await this.adb.executeCommand(saveCommand, vmSnapshotTimeoutMs);
      } catch (error) {
        throw new Error(formatVmSnapshotExecutionError("save", snapshotName, error));
      }

      const evaluation = evaluateVmSnapshotResult("save", snapshotName, result);
      if (!evaluation.ok) {
        throw new Error(evaluation.errorMessage);
      }

      logger.info(`VM snapshot saved successfully`);

      // Capture settings if requested (VM snapshot doesn't include this metadata)
      let settings;
      if (includeSettings) {
        settings = await this.captureSettings();
      }

      // Get foreground app
      const foregroundApp = await this.getForegroundApp();

      // Create manifest
      const manifest: DeviceSnapshotManifest = {
        snapshotName,
        timestamp: new Date().toISOString(),
        deviceId: this.device.deviceId,
        deviceName: this.device.name,
        platform: "android",
        snapshotType: "vm",
        includeAppData: true, // VM snapshot includes everything
        includeSettings: includeSettings,
        foregroundApp,
        settings
      };

      return manifest;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to capture VM snapshot: ${message}`);
      throw new ActionableError(`Failed to capture VM snapshot: ${message}`);
    }
  }

  /**
   * Capture ADB-based snapshot
   */
  private async captureAdbSnapshot(
    snapshotName: string,
    includeAppData: boolean,
    includeSettings: boolean,
    strictBackupMode: boolean,
    backupTimeoutMs: number,
    userApps: "current" | "all"
  ): Promise<DeviceSnapshotManifest> {
    logger.info(`Using ADB-based snapshot for device ${this.device.deviceId}`);

    try {
      // Get foreground app first (needed if userApps is "current")
      const foregroundApp = await this.getForegroundApp();

      // Get list of installed packages
      const packages = await this.getInstalledPackages();
      logger.info(`Found ${packages.length} installed packages`);

      // Capture settings if requested
      let settings;
      if (includeSettings) {
        settings = await this.captureSettings();
        await this.saveSettings(snapshotName, settings);
      }

      // Capture app data if requested
      let appDataBackup;
      if (includeAppData) {
        appDataBackup = await this.captureAppData(
          snapshotName,
          packages,
          strictBackupMode,
          backupTimeoutMs,
          userApps,
          foregroundApp
        );
      }

      // Create manifest
      const manifest: DeviceSnapshotManifest = {
        snapshotName,
        timestamp: new Date().toISOString(),
        deviceId: this.device.deviceId,
        deviceName: this.device.name,
        platform: "android",
        snapshotType: "adb",
        includeAppData,
        includeSettings,
        packages,
        foregroundApp,
        settings,
        appDataBackup
      };

      return manifest;
    } catch (error) {
      logger.error(`Failed to capture ADB snapshot: ${error}`);
      throw new ActionableError(`Failed to capture ADB snapshot: ${error}`);
    }
  }

  /**
   * Get list of installed packages
   */
  private async getInstalledPackages(): Promise<string[]> {
    const result = await this.adb.executeCommand("shell pm list packages");
    return result.stdout
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.startsWith("package:"))
      .map(line => line.replace("package:", ""));
  }

  /**
   * Get currently foreground app
   */
  private async getForegroundApp(): Promise<string | undefined> {
    try {
      const foregroundApp = await this.adb.getForegroundApp();
      return foregroundApp?.packageName;
    } catch (error) {
      logger.warn(`Failed to get foreground app: ${error}`);
      return undefined;
    }
  }

  /**
   * Capture device settings
   */
  private async captureSettings(): Promise<{
    global: Record<string, string>;
    secure: Record<string, string>;
    system: Record<string, string>;
  }> {
    logger.info("Capturing device settings");

    const settingsTypes = ["global", "secure", "system"];
    const settings: any = {};

    for (const type of settingsTypes) {
      try {
        const result = await this.adb.executeCommand(`shell settings list ${type}`);
        settings[type] = this.parseSettings(result.stdout);
        logger.info(`Captured ${Object.keys(settings[type]).length} ${type} settings`);
      } catch (error) {
        logger.warn(`Failed to capture ${type} settings: ${error}`);
        settings[type] = {};
      }
    }

    return settings;
  }

  /**
   * Parse settings output into key-value pairs
   */
  private parseSettings(output: string): Record<string, string> {
    const settings: Record<string, string> = {};

    for (const line of output.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {continue;}

      const match = trimmed.match(/^(.+?)=(.*)$/);
      if (match) {
        settings[match[1]] = match[2];
      }
    }

    return settings;
  }

  /**
   * Save settings to snapshot directory
   */
  private async saveSettings(
    snapshotName: string,
    settings: any
  ): Promise<void> {
    // Ensure snapshot directory exists before writing
    const snapshotDir = this.store.getSnapshotPath(snapshotName);
    await fs.mkdir(snapshotDir, { recursive: true });

    const settingsPath = this.store.getSettingsPath(snapshotName);
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
    logger.info(`Saved settings to ${settingsPath}`);
  }

  /**
   * Capture app data using adb backup
   */
  private async captureAppData(
    snapshotName: string,
    packages: string[],
    strictBackupMode: boolean,
    backupTimeoutMs: number,
    userApps: "current" | "all",
    foregroundApp: string | undefined
  ): Promise<DeviceSnapshotManifest["appDataBackup"]> {
    logger.info(`Capturing app data (scope: ${userApps})`);

    const appDataPath = this.store.getAppDataPath(snapshotName);
    await fs.mkdir(appDataPath, { recursive: true });

    // Save package list for reference
    const packageListPath = path.join(appDataPath, "packages.txt");
    await fs.writeFile(packageListPath, packages.join("\n"), "utf-8");

    // Filter to user apps only (exclude system apps)
    let userPackages = await this.filterUserPackages(packages);
    logger.info(`Found ${userPackages.length} user-installed apps (excluding ${packages.length - userPackages.length} system apps)`);

    // If userApps is "current", only backup the foreground app
    if (userApps === "current") {
      if (!foregroundApp) {
        logger.warn("No foreground app detected, cannot backup current app");
        return {
          backupMethod: "none",
          totalPackages: packages.length,
          backedUpPackages: [],
          skippedPackages: [],
          failedPackages: []
        };
      }

      if (userPackages.includes(foregroundApp)) {
        userPackages = [foregroundApp];
        logger.info(`Backing up current foreground app: ${foregroundApp}`);
      } else {
        logger.warn(`Foreground app ${foregroundApp} is not a user app, skipping backup`);
        return {
          backupMethod: "none",
          totalPackages: packages.length,
          backedUpPackages: [],
          skippedPackages: [],
          failedPackages: []
        };
      }
    }

    // Filter out packages that don't allow backup
    const { allowedPackages, skippedPackages } = await this.filterBackupAllowedPackages(userPackages);
    logger.info(`${allowedPackages.length} apps allow backup, ${skippedPackages.length} apps disallow backup`);

    if (skippedPackages.length > 0) {
      logger.info(`Skipped apps (android:allowBackup="false"): ${skippedPackages.slice(0, 10).join(", ")}${skippedPackages.length > 10 ? "..." : ""}`);
    }

    if (allowedPackages.length === 0) {
      logger.warn("No apps available for backup");
      return {
        backupMethod: "none",
        totalPackages: packages.length,
        backedUpPackages: [],
        skippedPackages,
        failedPackages: []
      };
    }

    // Attempt adb backup
    const backupFilePath = this.store.getBackupFilePath(snapshotName);
    const backupResult = await this.performAdbBackup(allowedPackages, backupFilePath, backupTimeoutMs);

    // Check if backup succeeded
    let backupSucceeded = false;
    try {
      const stats = await fs.stat(backupFilePath);
      backupSucceeded = stats.size > 0;
    } catch {
      backupSucceeded = false;
    }

    if (!backupSucceeded) {
      const errorMessage = `App data backup failed or timed out. User may need to confirm backup on device. ${allowedPackages.length} apps were attempted.`;
      logger.warn(errorMessage);

      if (strictBackupMode) {
        throw new ActionableError(errorMessage);
      }

      return {
        backupMethod: "adb_backup",
        totalPackages: packages.length,
        backedUpPackages: [],
        skippedPackages,
        failedPackages: allowedPackages,
        backupTimedOut: backupResult.timedOut
      };
    }

    logger.info(`Successfully backed up ${allowedPackages.length} apps to ${backupFilePath}`);

    return {
      backupFile: path.basename(backupFilePath),
      backupMethod: "adb_backup",
      totalPackages: packages.length,
      backedUpPackages: allowedPackages,
      skippedPackages,
      failedPackages: [],
      backupTimedOut: false
    };
  }

  /**
   * Filter packages to only include user-installed apps
   */
  private async filterUserPackages(packages: string[]): Promise<string[]> {
    const userPackages: string[] = [];

    for (const packageName of packages) {
      try {
        const result = await this.adb.executeCommand(`shell pm list packages -3 ${packageName}`);
        if (result.stdout.includes(packageName)) {
          userPackages.push(packageName);
        }
      } catch (error) {
        logger.debug(`Failed to check if ${packageName} is user app: ${error}`);
      }
    }

    return userPackages;
  }

  /**
   * Filter packages to only include those that allow backup
   */
  private async filterBackupAllowedPackages(packages: string[]): Promise<{
    allowedPackages: string[];
    skippedPackages: string[];
  }> {
    const allowedPackages: string[] = [];
    const skippedPackages: string[] = [];

    for (const packageName of packages) {
      try {
        // Check if app allows backup using dumpsys
        const result = await this.adb.executeCommand(`shell dumpsys package ${packageName}`);

        // Look for ALLOW_BACKUP flag in the output
        // If allowBackup is false, the output will contain "ALLOW_BACKUP=false"
        if (result.stdout.includes("ALLOW_BACKUP=false")) {
          skippedPackages.push(packageName);
        } else {
          allowedPackages.push(packageName);
        }
      } catch (error) {
        // If we can't determine, assume it allows backup
        logger.debug(`Failed to check backup flag for ${packageName}, assuming allowed: ${error}`);
        allowedPackages.push(packageName);
      }
    }

    return { allowedPackages, skippedPackages };
  }

  /**
   * Perform adb backup with timeout
   */
  private async performAdbBackup(
    packages: string[],
    backupFilePath: string,
    timeoutMs: number
  ): Promise<{ timedOut: boolean }> {
    logger.info(`Starting adb backup for ${packages.length} packages (timeout: ${timeoutMs}ms)`);
    logger.info("Please confirm the backup on your device if prompted");

    try {
      // Build adb backup command
      // -f: file path, -noapk: don't backup APK files, -obb: include OBB files
      // -shared: include shared storage, -all: backup all data
      const packageList = packages.join(" ");
      const command = `backup -f "${backupFilePath}" -noapk ${packageList}`;

      // Execute backup with timeout using timer
      let timeoutHandle: NodeJS.Timeout | null = null;
      let timedOut = false;

      const result = await Promise.race([
        this.adb.executeCommand(command),
        new Promise<{ stdout: string; stderr: string; timedOut: true }>(resolve => {
          timeoutHandle = this.timer.setTimeout(() => {
            timedOut = true;
            resolve({ stdout: "", stderr: "Backup timed out", timedOut: true });
          }, timeoutMs);
        })
      ]);

      // Clear timeout if command completed first
      if (timeoutHandle && !timedOut) {
        this.timer.clearTimeout(timeoutHandle);
      }

      if ("timedOut" in result && result.timedOut) {
        logger.warn(`Backup timed out after ${timeoutMs}ms - user may not have confirmed on device`);
        return { timedOut: true };
      }

      return { timedOut: false };
    } catch (error) {
      // Clear timeout to avoid keeping process alive
      if (timeoutHandle) {
        this.timer.clearTimeout(timeoutHandle);
      }
      logger.error(`Backup failed: ${error}`);
      return { timedOut: false };
    }
  }
}
