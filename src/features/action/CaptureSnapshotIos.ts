import { ActionableError, BootedDevice, DeviceSnapshotManifest } from "../../models";
import type { CaptureSnapshotArgs, CaptureSnapshotResult } from "./CaptureSnapshot";
import { DeviceSnapshotStore, SnapshotPathOptions } from "../../utils/DeviceSnapshotStore";
import { SimCtlClient } from "../../utils/ios-cmdline-tools/SimCtlClient";
import { logger } from "../../utils/logger";
import { promises as fs } from "fs";
import * as path from "path";

const IOS_APP_DATA_FOLDERS = ["Documents", "Library", "tmp"];

export class CaptureSnapshotIos {
  private device: BootedDevice;
  private simctl: SimCtlClient;
  private store: DeviceSnapshotStore;

  constructor(
    device: BootedDevice,
    simctl?: SimCtlClient,
    store: DeviceSnapshotStore = new DeviceSnapshotStore()
  ) {
    if (device.platform !== "ios") {
      throw new ActionableError("Snapshot capture is currently only supported for iOS simulators");
    }

    this.device = device;
    this.simctl = simctl || new SimCtlClient(device);
    this.store = store;
  }

  async execute(args: CaptureSnapshotArgs): Promise<CaptureSnapshotResult> {
    const {
      snapshotName,
      includeAppData = true,
      includeSettings = true,
      useVmSnapshot = true,
      strictBackupMode = false,
      appBundleIds,
    } = args;

    logger.info(`[iOS] Capturing snapshot '${snapshotName}' for simulator ${this.device.deviceId}`);

    if (useVmSnapshot) {
      logger.info("[iOS] useVmSnapshot is ignored; using app container backups for portability");
    }

    const metadata = await this.getDeviceMetadata();
    const pathOptions = this.getPathOptions();

    if (includeSettings) {
      logger.warn("[iOS] includeSettings requested, but settings capture is not supported for iOS app data snapshots");
    }

    const appDataBackup = includeAppData
      ? await this.captureAppData(snapshotName, appBundleIds, strictBackupMode, pathOptions)
      : undefined;

    const manifest: DeviceSnapshotManifest = {
      snapshotName,
      timestamp: new Date().toISOString(),
      deviceId: this.device.deviceId,
      deviceName: this.device.name,
      platform: "ios",
      deviceType: metadata.deviceType,
      osVersion: metadata.osVersion,
      snapshotType: "app_data",
      includeAppData,
      includeSettings: false,
      appDataBackup,
    };

    await this.saveMetadata(snapshotName, manifest, pathOptions);

    logger.info(`[iOS] Snapshot '${snapshotName}' captured successfully (type: ${manifest.snapshotType})`);

    return {
      snapshotName: manifest.snapshotName,
      timestamp: manifest.timestamp,
      snapshotType: manifest.snapshotType,
      manifest,
    };
  }

  private getPathOptions(): SnapshotPathOptions {
    return { platform: "ios", deviceId: this.device.deviceId };
  }

  private async captureAppData(
    snapshotName: string,
    appBundleIds: string[] | undefined,
    strictBackupMode: boolean,
    pathOptions: SnapshotPathOptions
  ): Promise<DeviceSnapshotManifest["appDataBackup"]> {
    logger.info("[iOS] Capturing app data containers");

    const appDataPath = this.store.getAppDataPath(snapshotName, pathOptions);
    await fs.mkdir(appDataPath, { recursive: true });

    if (!appBundleIds || appBundleIds.length === 0) {
      logger.warn("[iOS] No appBundleIds provided; skipping app data capture");
    }

    const { bundleIds, skippedBundles, totalBundles } =
      await this.resolveBundleIds(appBundleIds);

    if (bundleIds.length === 0) {
      logger.warn("[iOS] No app bundle IDs available for backup");
      return {
        backupMethod: "none",
        totalPackages: totalBundles,
        backedUpPackages: [],
        skippedPackages: skippedBundles,
        failedPackages: [],
      };
    }

    const backedUpPackages: string[] = [];
    const failedPackages: string[] = [];

    for (const bundleId of bundleIds) {
      try {
        logger.info(`[iOS] Backing up app data: ${bundleId}`);
        const containerPath = await this.getAppContainerPath(bundleId);
        if (!containerPath) {
          failedPackages.push(bundleId);
          continue;
        }

        await this.copyAppContainer(containerPath, appDataPath, bundleId);
        backedUpPackages.push(bundleId);
      } catch (error) {
        logger.warn(`[iOS] Failed to backup app data for ${bundleId}: ${error}`);
        failedPackages.push(bundleId);
      }
    }

    if (strictBackupMode && failedPackages.length > 0) {
      throw new ActionableError(
        `Failed to backup app data for ${failedPackages.length} app(s): ${failedPackages.join(", ")}`
      );
    }

    return {
      backupMethod: "simctl_copy",
      totalPackages: totalBundles,
      backedUpPackages,
      skippedPackages: skippedBundles,
      failedPackages,
    };
  }

  private async resolveBundleIds(appBundleIds?: string[]): Promise<{
    bundleIds: string[];
    skippedBundles: string[];
    totalBundles: number;
  }> {
    if (!appBundleIds || appBundleIds.length === 0) {
      return {
        bundleIds: [],
        skippedBundles: [],
        totalBundles: 0,
      };
    }

    const sanitized = Array.from(
      new Set(appBundleIds.map(value => value.trim()).filter(Boolean))
    );
    const bundleIds = sanitized.filter(bundleId => !bundleId.startsWith("com.apple."));
    const skippedBundles = sanitized.filter(bundleId => !bundleIds.includes(bundleId));

    return {
      bundleIds,
      skippedBundles,
      totalBundles: sanitized.length,
    };
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

  private async copyAppContainer(
    containerPath: string,
    appDataPath: string,
    bundleId: string
  ): Promise<void> {
    const targetRoot = path.join(appDataPath, bundleId);
    await fs.mkdir(targetRoot, { recursive: true });

    for (const folder of IOS_APP_DATA_FOLDERS) {
      const sourcePath = path.join(containerPath, folder);
      const destinationPath = path.join(targetRoot, folder);
      if (await this.pathExists(sourcePath)) {
        await fs.cp(sourcePath, destinationPath, { recursive: true });
      }
    }
  }

  private async getDeviceMetadata(): Promise<{ deviceType?: string; osVersion?: string }> {
    try {
      const deviceInfo = await this.simctl.getDeviceInfo(this.device.deviceId);
      if (!deviceInfo) {
        return {};
      }

      const deviceType = deviceInfo.deviceTypeIdentifier ?? deviceInfo.model;
      let osVersion: string | undefined = deviceInfo.os_version;

      if (!osVersion && deviceInfo.runtime) {
        const runtimes = await this.simctl.getRuntimes();
        const runtime = runtimes.find(entry => entry.identifier === deviceInfo.runtime);
        osVersion = runtime?.version || runtime?.name;
      }

      return { deviceType, osVersion };
    } catch (error) {
      logger.warn(`[iOS] Failed to read simulator metadata: ${error}`);
      return {};
    }
  }

  private async saveMetadata(
    snapshotName: string,
    manifest: DeviceSnapshotManifest,
    pathOptions: SnapshotPathOptions
  ): Promise<void> {
    const snapshotDir = this.store.getSnapshotPathWithOptions(snapshotName, pathOptions);
    await fs.mkdir(snapshotDir, { recursive: true });
    const metadataPath = this.store.getMetadataPath(snapshotName, pathOptions);
    await fs.writeFile(metadataPath, JSON.stringify(manifest, null, 2), "utf-8");
    logger.info(`[iOS] Wrote metadata to ${metadataPath}`);
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
