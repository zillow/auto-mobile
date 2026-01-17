import { ActionableError, BootedDevice, DeviceSnapshotManifest } from "../../models";
import type { RestoreSnapshotArgs, RestoreSnapshotResult } from "./RestoreSnapshot";
import { DeviceSnapshotStore, SnapshotPathOptions } from "../../utils/DeviceSnapshotStore";
import { SimCtlClient } from "../../utils/ios-cmdline-tools/SimCtlClient";
import { logger } from "../../utils/logger";
import { promises as fs } from "fs";
import * as path from "path";

const IOS_APP_DATA_FOLDERS = ["Documents", "Library", "tmp"];

export class RestoreSnapshotIos {
  private device: BootedDevice;
  private simctl: SimCtlClient;
  private store: DeviceSnapshotStore;

  constructor(
    device: BootedDevice,
    simctl?: SimCtlClient,
    store: DeviceSnapshotStore = new DeviceSnapshotStore()
  ) {
    if (device.platform !== "ios") {
      throw new ActionableError("Snapshot restore is currently only supported for iOS simulators");
    }

    this.device = device;
    this.simctl = simctl || new SimCtlClient(device);
    this.store = store;
  }

  async execute(args: RestoreSnapshotArgs): Promise<RestoreSnapshotResult> {
    const { snapshotName, manifest } = args;

    logger.info(`[iOS] Restoring snapshot '${snapshotName}' (type: ${manifest.snapshotType})`);

    if (manifest.platform !== "ios") {
      throw new ActionableError(
        `Snapshot platform '${manifest.platform}' does not match device platform '${this.device.platform}'`
      );
    }

    if (manifest.snapshotType !== "app_data") {
      throw new ActionableError(
        `Unsupported iOS snapshot type '${manifest.snapshotType}'. Re-capture using app container backups.`
      );
    }

    await this.restoreAppData(snapshotName, manifest);

    logger.info(`[iOS] Snapshot '${snapshotName}' restored successfully`);

    return {
      snapshotType: manifest.snapshotType,
      restoredAt: new Date().toISOString(),
    };
  }

  private getPathOptions(): SnapshotPathOptions {
    return { platform: "ios", deviceId: this.device.deviceId };
  }

  private async restoreAppData(
    snapshotName: string,
    manifest: DeviceSnapshotManifest
  ): Promise<void> {
    if (!manifest.includeAppData) {
      logger.info("[iOS] Snapshot does not include app data; skipping restore");
      return;
    }

    const pathOptions = this.getPathOptions();
    const appDataPath = this.store.getAppDataPath(snapshotName, pathOptions);
    if (!(await this.pathExists(appDataPath))) {
      logger.warn(`[iOS] App data directory not found for snapshot '${snapshotName}'`);
      return;
    }

    if (manifest.appDataBackup?.backupMethod === "none") {
      logger.info("[iOS] Snapshot app data backup method is 'none'; skipping restore");
      return;
    }

    const bundleIds = await this.resolveSnapshotBundleIds(appDataPath, manifest);
    if (bundleIds.length === 0) {
      logger.warn("[iOS] No app bundle IDs found to restore");
      return;
    }

    for (const bundleId of bundleIds) {
      try {
        const containerPath = await this.getAppContainerPath(bundleId);
        if (!containerPath) {
          continue;
        }

        const snapshotBundlePath = path.join(appDataPath, bundleId);
        for (const folder of IOS_APP_DATA_FOLDERS) {
          const sourcePath = path.join(snapshotBundlePath, folder);
          if (!(await this.pathExists(sourcePath))) {
            continue;
          }
          const destinationPath = path.join(containerPath, folder);
          await fs.rm(destinationPath, { recursive: true, force: true });
          await fs.cp(sourcePath, destinationPath, { recursive: true });
        }
      } catch (error) {
        logger.warn(`[iOS] Failed to restore app data for ${bundleId}: ${error}`);
      }
    }
  }

  private async resolveSnapshotBundleIds(
    appDataPath: string,
    manifest: DeviceSnapshotManifest
  ): Promise<string[]> {
    const fromManifest = manifest.appDataBackup?.backedUpPackages;
    if (fromManifest && fromManifest.length > 0) {
      return fromManifest;
    }

    try {
      const entries = await fs.readdir(appDataPath, { withFileTypes: true });
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);
    } catch (error) {
      logger.warn(`[iOS] Failed to read app data bundles: ${error}`);
      return [];
    }
  }

  private async getAppContainerPath(bundleId: string): Promise<string | null> {
    try {
      const command = `get_app_container ${this.quoteArg(this.device.deviceId)} ${this.quoteArg(bundleId)} data`;
      const result = await this.simctl.executeCommand(command);
      const containerPath = result.stdout.trim();
      if (!containerPath) {
        logger.warn(`[iOS] No data container path for ${bundleId}`);
        return null;
      }
      return containerPath;
    } catch (error) {
      logger.warn(`[iOS] Failed to resolve container for ${bundleId}: ${error}`);
      return null;
    }
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  private quoteArg(value: string): string {
    return JSON.stringify(value);
  }
}
