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

    await this.validateSnapshotCompatibility(manifest);
    await this.restoreAppData(snapshotName, manifest);

    logger.info(`[iOS] Snapshot '${snapshotName}' restored successfully`);

    return {
      snapshotType: manifest.snapshotType,
      restoredAt: new Date().toISOString(),
    };
  }

  private getPathOptions(deviceId?: string): SnapshotPathOptions {
    return { platform: "ios", deviceId: deviceId ?? this.device.deviceId };
  }

  private async restoreAppData(
    snapshotName: string,
    manifest: DeviceSnapshotManifest
  ): Promise<void> {
    if (!manifest.includeAppData) {
      logger.info("[iOS] Snapshot does not include app data; skipping restore");
      return;
    }

    const manifestPathOptions = this.getPathOptions(manifest.deviceId);
    let appDataPath = this.store.getAppDataPath(snapshotName, manifestPathOptions);

    if (!(await this.pathExists(appDataPath))) {
      const fallbackPathOptions = this.getPathOptions(this.device.deviceId);
      if (manifest.deviceId && manifest.deviceId !== this.device.deviceId) {
        const fallbackPath = this.store.getAppDataPath(snapshotName, fallbackPathOptions);
        if (await this.pathExists(fallbackPath)) {
          logger.info(
            `[iOS] App data not found for '${manifest.deviceId}', using current device path '${this.device.deviceId}'`
          );
          appDataPath = fallbackPath;
        } else {
          logger.warn(`[iOS] App data directory not found for snapshot '${snapshotName}'`);
          return;
        }
      } else {
        logger.warn(`[iOS] App data directory not found for snapshot '${snapshotName}'`);
        return;
      }
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

    const installedBundles = await this.getInstalledBundleIds();
    if (installedBundles.size > 0) {
      const missingBundles = bundleIds.filter(bundleId => !installedBundles.has(bundleId));
      if (missingBundles.length > 0) {
        throw new ActionableError(
          `App(s) not installed on simulator: ${missingBundles.join(", ")}. Please reinstall and retry restore.`
        );
      }
    } else {
      logger.warn("[iOS] Unable to verify installed apps; proceeding with restore");
    }

    for (const bundleId of bundleIds) {
      try {
        await this.terminateAppIfRunning(bundleId);
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

  private async validateSnapshotCompatibility(manifest: DeviceSnapshotManifest): Promise<void> {
    if (!manifest.osVersion) {
      logger.warn("[iOS] Snapshot OS version missing; skipping compatibility check");
      return;
    }

    const deviceOsVersion = await this.getDeviceOsVersion();
    if (!deviceOsVersion) {
      logger.warn("[iOS] Unable to read simulator OS version; skipping compatibility check");
      return;
    }

    const snapshotVersion = this.parseOsVersion(manifest.osVersion);
    const targetVersion = this.parseOsVersion(deviceOsVersion);

    if (!snapshotVersion || !targetVersion) {
      logger.warn("[iOS] Unable to parse OS versions for compatibility check; proceeding");
      return;
    }

    if (snapshotVersion.major !== targetVersion.major) {
      throw new ActionableError(
        `Snapshot iOS version '${manifest.osVersion}' is incompatible with simulator iOS '${deviceOsVersion}'. ` +
        `Please restore on an iOS ${snapshotVersion.major}.x simulator.`
      );
    }
  }

  private async getDeviceOsVersion(): Promise<string | undefined> {
    try {
      const deviceInfo = await this.simctl.getDeviceInfo(this.device.deviceId);
      if (!deviceInfo) {
        return undefined;
      }

      let osVersion: string | undefined = deviceInfo.os_version;
      if (!osVersion && deviceInfo.runtime) {
        const runtimes = await this.simctl.getRuntimes();
        const runtime = runtimes.find(entry => entry.identifier === deviceInfo.runtime);
        osVersion = runtime?.version || runtime?.name;
      }

      return osVersion;
    } catch (error) {
      logger.warn(`[iOS] Failed to read simulator OS version: ${error}`);
      return undefined;
    }
  }

  private parseOsVersion(version: string): { major: number; minor?: number } | null {
    const runtimeMatch = version.match(/iOS[-\s_]?(\d+)(?:[.\-_](\d+))?/i);
    const match = runtimeMatch ?? version.match(/(\d+)(?:\.(\d+))?/);
    if (!match) {
      return null;
    }

    const major = Number(match[1]);
    if (!Number.isFinite(major)) {
      return null;
    }

    const minorValue = match[2];
    const minor = minorValue !== undefined ? Number(minorValue) : undefined;
    return Number.isFinite(minor) || minor === undefined ? { major, minor } : { major };
  }

  private async getInstalledBundleIds(): Promise<Set<string>> {
    try {
      const apps = await this.simctl.listApps(this.device.deviceId);
      const bundleIds = apps
        .map((app: any) => app.bundleId || app.CFBundleIdentifier)
        .filter((value: string | undefined) => typeof value === "string" && value.length > 0);
      return new Set(bundleIds);
    } catch (error) {
      logger.warn(`[iOS] Failed to list installed apps: ${error}`);
      return new Set();
    }
  }

  private async terminateAppIfRunning(bundleId: string): Promise<void> {
    try {
      await this.simctl.terminateApp(bundleId, this.device.deviceId);
    } catch (error) {
      logger.warn(`[iOS] Failed to terminate ${bundleId} before restore: ${error}`);
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
