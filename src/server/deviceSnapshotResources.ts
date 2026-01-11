import { ResourceRegistry, type ResourceContent } from "./resourceRegistry";
import { getDeviceSnapshotConfig, listDeviceSnapshots } from "./deviceSnapshotManager";
import { DEVICE_SNAPSHOT_RESOURCE_URIS } from "./deviceSnapshotResourceUris";
import { logger } from "../utils/logger";

async function getSnapshotArchive(): Promise<ResourceContent> {
  try {
    const { snapshots, count, totalSizeBytes } = await listDeviceSnapshots();
    const config = await getDeviceSnapshotConfig();

    return {
      uri: DEVICE_SNAPSHOT_RESOURCE_URIS.ARCHIVE,
      mimeType: "application/json",
      text: JSON.stringify({
        snapshots,
        count,
        totalSizeBytes,
        maxArchiveSizeMb: config.maxArchiveSizeMb,
      }, null, 2),
    };
  } catch (error) {
    logger.error(`[DeviceSnapshotResources] Failed to list snapshots: ${error}`);
    return {
      uri: DEVICE_SNAPSHOT_RESOURCE_URIS.ARCHIVE,
      mimeType: "application/json",
      text: JSON.stringify({
        error: `Failed to list snapshots: ${error}`,
      }, null, 2),
    };
  }
}

export function registerDeviceSnapshotResources(): void {
  ResourceRegistry.register(
    DEVICE_SNAPSHOT_RESOURCE_URIS.ARCHIVE,
    "Device Snapshot Archive",
    "Metadata list for captured device snapshots.",
    "application/json",
    getSnapshotArchive
  );

  logger.info("[DeviceSnapshotResources] Registered device snapshot resources");
}
