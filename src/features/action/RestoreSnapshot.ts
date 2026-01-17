import { BootedDevice, ActionableError, DeviceSnapshotManifest, DeviceSnapshotType } from "../../models";
import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
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

export interface RestoreSnapshotArgs {
  snapshotName: string;
  manifest: DeviceSnapshotManifest;
  useVmSnapshot?: boolean;
  vmSnapshotTimeoutMs?: number; // Timeout in milliseconds for emulator VM snapshot commands (default: 30000ms)
}

export interface RestoreSnapshotResult {
  snapshotType: DeviceSnapshotType;
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
  private store: DeviceSnapshotStore;
  private timer: Timer;

  constructor(
    device: BootedDevice,
    adb?: AdbClient,
    emulator?: AndroidEmulatorClient,
    timer: Timer = defaultTimer,
    store: DeviceSnapshotStore = new DeviceSnapshotStore()
  ) {
    if (device.platform !== "android") {
      throw new ActionableError("Snapshot restore is currently only supported for Android devices");
    }

    this.device = device;
    this.adb = adb || new AdbClient(device);
    this.emulator = emulator || new AndroidEmulatorClient();
    this.store = store;
    this.timer = timer;
  }

  /**
   * Execute snapshot restoration
   */
  async execute(args: RestoreSnapshotArgs): Promise<RestoreSnapshotResult> {
    const { snapshotName, manifest, useVmSnapshot = true, vmSnapshotTimeoutMs = 30000 } = args;

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
      await this.restoreVmSnapshot(snapshotName, manifest, vmSnapshotTimeoutMs);
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
    manifest: DeviceSnapshotManifest,
    vmSnapshotTimeoutMs: number
  ): Promise<void> {
    logger.info(`Restoring VM snapshot for emulator ${this.device.deviceId}`);

    try {
      // Load VM snapshot using ADB emu command
      const loadCommand = buildVmSnapshotCommand("load", snapshotName);
      logger.info(`Executing: adb -s ${this.device.deviceId} ${loadCommand}`);

      let result;
      try {
        result = await this.adb.executeCommand(loadCommand, vmSnapshotTimeoutMs);
      } catch (error) {
        throw new Error(formatVmSnapshotExecutionError("load", snapshotName, error));
      }

      const evaluation = evaluateVmSnapshotResult("load", snapshotName, result);
      if (!evaluation.ok) {
        throw new Error(evaluation.errorMessage);
      }

      logger.info(`VM snapshot restored successfully`);

      // Wait a moment for emulator to stabilize after snapshot load
      await this.timer.sleep(2000);

      logger.info("VM snapshot restoration complete");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to restore VM snapshot: ${message}`);
      throw new ActionableError(`Failed to restore VM snapshot: ${message}`);
    }
  }

  /**
   * Restore ADB-based snapshot
   */
  private async restoreAdbSnapshot(
    snapshotName: string,
    manifest: DeviceSnapshotManifest
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
    manifest: DeviceSnapshotManifest
  ): Promise<void> {
    logger.info("Restoring app data");

    // Check if backup metadata exists
    if (!manifest.appDataBackup) {
      logger.warn("No app data backup metadata found in manifest");
      return;
    }

    const { backupFile, backupMethod, backedUpPackages } = manifest.appDataBackup;

    // If no backup was performed, skip restore
    if (backupMethod === "none" || !backupFile || !backedUpPackages || backedUpPackages.length === 0) {
      logger.info(`No app data backup available (method: ${backupMethod || "none"})`);
      return;
    }

    // Get backup file path
    const backupFilePath = path.join(this.store.getAppDataPath(snapshotName), backupFile);

    try {
      // Check if backup file exists
      await fs.access(backupFilePath);

      const stats = await fs.stat(backupFilePath);
      if (stats.size === 0) {
        logger.warn("Backup file is empty, skipping restore");
        return;
      }

      logger.info(`Found backup file: ${backupFilePath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      logger.info(`Restoring ${backedUpPackages.length} apps using adb restore`);
      logger.info("Please confirm the restore on your device if prompted");

      // Perform adb restore
      const restoreResult = await this.performAdbRestore(backupFilePath);

      if (restoreResult.success) {
        logger.info(`Successfully restored app data for ${backedUpPackages.length} apps`);
      } else if (restoreResult.timedOut) {
        logger.warn("App data restore timed out - user may not have confirmed on device");
      } else {
        logger.warn("App data restore may have failed - check device");
      }
    } catch (error) {
      logger.warn(`Could not restore app data: ${error}`);
    }
  }

  /**
   * Perform adb restore with timeout
   */
  private async performAdbRestore(
    backupFilePath: string,
    timeoutMs: number = 30000
  ): Promise<{ success: boolean; timedOut: boolean }> {
    try {
      // Execute restore with timeout using timer
      let timeoutHandle: NodeJS.Timeout | null = null;
      let timedOut = false;

      const result = await Promise.race([
        this.adb.executeCommand(`restore "${backupFilePath}"`),
        new Promise<{ stdout: string; stderr: string; timedOut: true }>(resolve => {
          timeoutHandle = this.timer.setTimeout(() => {
            timedOut = true;
            resolve({ stdout: "", stderr: "Restore timed out", timedOut: true });
          }, timeoutMs);
        })
      ]);

      // Clear timeout if command completed first
      if (timeoutHandle && !timedOut) {
        this.timer.clearTimeout(timeoutHandle);
      }

      if ("timedOut" in result && result.timedOut) {
        logger.warn(`Restore timed out after ${timeoutMs}ms - user may not have confirmed on device`);
        return { success: false, timedOut: true };
      }

      // Check if restore was successful
      // adb restore doesn't provide clear success/failure output, so we assume success
      return { success: true, timedOut: false };
    } catch (error) {
      // Clear timeout to avoid keeping process alive
      if (timeoutHandle) {
        this.timer.clearTimeout(timeoutHandle);
      }
      logger.error(`Restore failed: ${error}`);
      return { success: false, timedOut: false };
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
}
