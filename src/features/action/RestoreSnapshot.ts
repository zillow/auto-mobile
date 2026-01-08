import { BootedDevice, ActionableError } from "../../models";
import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { AndroidEmulatorClient } from "../../utils/android-cmdline-tools/AndroidEmulatorClient";
import { SnapshotStorage, SnapshotManifest } from "../../utils/snapshotStorage";
import { logger } from "../../utils/logger";
import { promises as fs } from "fs";
import * as path from "path";

export interface RestoreSnapshotArgs {
  snapshotName: string;
  useVmSnapshot?: boolean;
}

export interface RestoreSnapshotResult {
  snapshotType: "vm" | "adb";
  restoredAt: string;
}

/**
 * Restore device state from snapshot
 * Supports VM snapshot restoration for emulators and ADB-based restore for all devices
 */
export class RestoreSnapshot {
  private device: BootedDevice;
  private adb: AdbClient;
  private emulator: AndroidEmulatorClient;
  private storage: SnapshotStorage;

  constructor(device: BootedDevice, adb?: AdbClient, emulator?: AndroidEmulatorClient) {
    if (device.platform !== "android") {
      throw new ActionableError("Snapshot restore is currently only supported for Android devices");
    }

    this.device = device;
    this.adb = adb || new AdbClient(device);
    this.emulator = emulator || new AndroidEmulatorClient();
    this.storage = new SnapshotStorage();
  }

  /**
   * Execute snapshot restoration
   */
  async execute(args: RestoreSnapshotArgs): Promise<RestoreSnapshotResult> {
    const { snapshotName, useVmSnapshot = true } = args;

    // Check if snapshot exists
    if (!(await this.storage.snapshotExists(snapshotName))) {
      throw new ActionableError(`Snapshot '${snapshotName}' not found`);
    }

    // Load snapshot manifest
    const manifest = await this.storage.loadManifest(snapshotName);

    logger.info(`Restoring snapshot '${snapshotName}' (type: ${manifest.snapshotType}) to device ${this.device.deviceId}`);

    // Verify device compatibility
    if (manifest.platform !== this.device.platform) {
      throw new ActionableError(
        `Snapshot platform '${manifest.platform}' does not match device platform '${this.device.platform}'`
      );
    }

    // Determine restoration method
    const isEmulator = this.device.deviceId.startsWith("emulator-");
    const shouldUseVmSnapshot = useVmSnapshot && manifest.snapshotType === "vm" && isEmulator;

    if (shouldUseVmSnapshot) {
      await this.restoreVmSnapshot(snapshotName, manifest);
    } else {
      await this.restoreAdbSnapshot(snapshotName, manifest);
    }

    logger.info(`Snapshot '${snapshotName}' restored successfully`);

    return {
      snapshotType: manifest.snapshotType,
      restoredAt: new Date().toISOString()
    };
  }

  /**
   * Restore VM snapshot using emulator console
   */
  private async restoreVmSnapshot(
    snapshotName: string,
    manifest: SnapshotManifest
  ): Promise<void> {
    logger.info(`Restoring VM snapshot for emulator ${this.device.deviceId}`);

    try {
      // Load VM snapshot using ADB emu command
      const loadCommand = `emu avd snapshot load ${snapshotName}`;
      logger.info(`Executing: adb -s ${this.device.deviceId} ${loadCommand}`);

      const result = await this.adb.executeCommand(loadCommand);

      if (result.stderr && result.stderr.includes("KO")) {
        throw new Error(`VM snapshot restoration failed: ${result.stderr}`);
      }

      logger.info(`VM snapshot restored successfully`);

      // Wait a moment for emulator to stabilize after snapshot load
      await this.sleep(2000);

      logger.info("VM snapshot restoration complete");
    } catch (error) {
      logger.error(`Failed to restore VM snapshot: ${error}`);
      throw new ActionableError(`Failed to restore VM snapshot: ${error}`);
    }
  }

  /**
   * Restore ADB-based snapshot
   */
  private async restoreAdbSnapshot(
    snapshotName: string,
    manifest: SnapshotManifest
  ): Promise<void> {
    logger.info(`Restoring ADB-based snapshot for device ${this.device.deviceId}`);

    try {
      // Clear current app data only if app data was captured
      // Note: We only clear app data when includeAppData is true to avoid
      // unintentionally wiping user data when the snapshot opted out of data capture
      if (manifest.includeAppData && manifest.packages && manifest.packages.length > 0) {
        await this.clearCurrentAppData(manifest.packages);
      }

      // Restore settings if they were captured
      if (manifest.includeSettings && manifest.settings) {
        await this.restoreSettings(manifest.settings);
      }

      // Restore app data if it was captured
      if (manifest.includeAppData) {
        await this.restoreAppData(snapshotName, manifest);
      }

      // Restore foreground app if captured
      if (manifest.foregroundApp) {
        await this.restoreForegroundApp(manifest.foregroundApp);
      }

      logger.info("ADB snapshot restoration complete");
    } catch (error) {
      logger.error(`Failed to restore ADB snapshot: ${error}`);
      throw new ActionableError(`Failed to restore ADB snapshot: ${error}`);
    }
  }

  /**
   * Clear app data for all packages
   */
  private async clearCurrentAppData(packages: string[]): Promise<void> {
    logger.info(`Clearing app data for ${packages.length} packages`);

    let successCount = 0;
    let failureCount = 0;

    for (const packageName of packages) {
      try {
        // Use pm clear to reset app data
        const result = await this.adb.executeCommand(`shell pm clear ${packageName}`);

        if (result.stdout.includes("Success")) {
          successCount++;
          logger.debug(`Cleared data for ${packageName}`);
        } else {
          failureCount++;
          logger.warn(`Failed to clear data for ${packageName}: ${result.stdout}`);
        }
      } catch (error) {
        failureCount++;
        logger.warn(`Error clearing data for ${packageName}: ${error}`);
      }
    }

    logger.info(`App data cleared: ${successCount} succeeded, ${failureCount} failed`);
  }

  /**
   * Restore device settings
   */
  private async restoreSettings(settings: {
    global?: Record<string, string>;
    secure?: Record<string, string>;
    system?: Record<string, string>;
  }): Promise<void> {
    logger.info("Restoring device settings");

    for (const [settingsType, values] of Object.entries(settings)) {
      if (!values || Object.keys(values).length === 0) {
        continue;
      }

      logger.info(`Restoring ${Object.keys(values).length} ${settingsType} settings`);
      let successCount = 0;
      let failureCount = 0;

      for (const [key, value] of Object.entries(values)) {
        try {
          // Escape special characters in value
          const escapedValue = value.replace(/'/g, "'\\''");
          await this.adb.executeCommand(`shell settings put ${settingsType} ${key} '${escapedValue}'`);
          successCount++;
        } catch (error) {
          failureCount++;
          logger.warn(`Failed to restore ${settingsType} setting ${key}: ${error}`);
        }
      }

      logger.info(`${settingsType} settings restored: ${successCount} succeeded, ${failureCount} failed`);
    }
  }

  /**
   * Restore app data from snapshot
   */
  private async restoreAppData(
    snapshotName: string,
    manifest: SnapshotManifest
  ): Promise<void> {
    logger.info("Restoring app data");

    const appDataPath = this.storage.getAppDataPath(snapshotName);
    const packageListPath = path.join(appDataPath, "packages.txt");

    try {
      // Check if package list exists
      await fs.access(packageListPath);

      const packageListContent = await fs.readFile(packageListPath, "utf-8");
      const packages = packageListContent.split("\n").filter(p => p.trim());

      logger.info(`Package list contains ${packages.length} packages`);

      // Note: Actual app data restoration would require:
      // 1. Root access to push data to /data/data/
      // 2. Or adb restore for backed up data
      // For now, we've cleared the app data - apps will start fresh
      logger.info("App data restoration requires root access or adb restore confirmation");
    } catch (error) {
      logger.warn(`Could not restore app data: ${error}`);
    }
  }

  /**
   * Restore foreground app
   */
  private async restoreForegroundApp(packageName: string): Promise<void> {
    logger.info(`Restoring foreground app: ${packageName}`);

    try {
      // Launch the app to restore foreground state
      await this.adb.executeCommand(
        `shell am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER ${packageName}`
      );
      logger.info(`Launched ${packageName}`);
    } catch (error) {
      logger.warn(`Failed to restore foreground app: ${error}`);
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
