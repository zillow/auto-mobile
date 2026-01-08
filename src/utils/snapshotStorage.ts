import { promises as fs } from "fs";
import * as path from "path";
import * as os from "os";
import { logger } from "./logger";

export interface SnapshotManifest {
  snapshotName: string;
  timestamp: string;
  deviceId: string;
  deviceName: string;
  platform: string;
  snapshotType: "vm" | "adb";
  includeAppData: boolean;
  includeSettings: boolean;
  packages?: string[];
  foregroundApp?: string;
  settings?: {
    global?: Record<string, string>;
    secure?: Record<string, string>;
    system?: Record<string, string>;
  };
}

export interface SnapshotListItem {
  snapshotName: string;
  timestamp: string;
  deviceId: string;
  deviceName: string;
  snapshotType: "vm" | "adb";
  size?: string;
}

/**
 * Manages snapshot storage in ~/.automobile/snapshots/
 */
export class SnapshotStorage {
  private basePath: string;

  constructor(customBasePath?: string) {
    this.basePath = customBasePath || path.join(os.homedir(), ".automobile", "snapshots");
  }

  /**
   * Ensure the snapshots directory exists
   */
  async ensureSnapshotsDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.basePath, { recursive: true });
    } catch (error) {
      logger.error(`Failed to create snapshots directory: ${error}`);
      throw error;
    }
  }

  /**
   * Get the path for a specific snapshot
   */
  getSnapshotPath(snapshotName: string): string {
    return path.join(this.basePath, snapshotName);
  }

  /**
   * Get the path for a snapshot manifest file
   */
  getManifestPath(snapshotName: string): string {
    return path.join(this.getSnapshotPath(snapshotName), "manifest.json");
  }

  /**
   * Save a snapshot manifest
   */
  async saveManifest(manifest: SnapshotManifest): Promise<void> {
    await this.ensureSnapshotsDirectory();
    const snapshotDir = this.getSnapshotPath(manifest.snapshotName);
    await fs.mkdir(snapshotDir, { recursive: true });

    const manifestPath = this.getManifestPath(manifest.snapshotName);
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
    logger.info(`Saved snapshot manifest to: ${manifestPath}`);
  }

  /**
   * Load a snapshot manifest
   */
  async loadManifest(snapshotName: string): Promise<SnapshotManifest> {
    const manifestPath = this.getManifestPath(snapshotName);
    try {
      const content = await fs.readFile(manifestPath, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to load snapshot manifest '${snapshotName}': ${error}`);
    }
  }

  /**
   * Check if a snapshot exists
   */
  async snapshotExists(snapshotName: string): Promise<boolean> {
    try {
      const manifestPath = this.getManifestPath(snapshotName);
      await fs.access(manifestPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all snapshots, optionally filtered by device ID
   */
  async listSnapshots(deviceId?: string): Promise<SnapshotListItem[]> {
    await this.ensureSnapshotsDirectory();

    try {
      const entries = await fs.readdir(this.basePath, { withFileTypes: true });
      const snapshots: SnapshotListItem[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          try {
            const manifest = await this.loadManifest(entry.name);

            // Filter by device ID if specified
            if (deviceId && manifest.deviceId !== deviceId) {
              continue;
            }

            // Calculate snapshot size
            const snapshotPath = this.getSnapshotPath(entry.name);
            const size = await this.getDirectorySize(snapshotPath);

            snapshots.push({
              snapshotName: manifest.snapshotName,
              timestamp: manifest.timestamp,
              deviceId: manifest.deviceId,
              deviceName: manifest.deviceName,
              snapshotType: manifest.snapshotType,
              size: this.formatBytes(size)
            });
          } catch (error) {
            logger.warn(`Failed to read snapshot '${entry.name}': ${error}`);
          }
        }
      }

      // Sort by timestamp (newest first)
      snapshots.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return snapshots;
    } catch (error) {
      logger.error(`Failed to list snapshots: ${error}`);
      return [];
    }
  }

  /**
   * Delete a snapshot
   */
  async deleteSnapshot(snapshotName: string): Promise<void> {
    const snapshotPath = this.getSnapshotPath(snapshotName);
    try {
      await fs.rm(snapshotPath, { recursive: true, force: true });
      logger.info(`Deleted snapshot: ${snapshotName}`);
    } catch (error) {
      throw new Error(`Failed to delete snapshot '${snapshotName}': ${error}`);
    }
  }

  /**
   * Generate a unique snapshot name based on timestamp
   */
  generateSnapshotName(deviceName?: string): string {
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .split(".")[0]; // Remove milliseconds

    if (deviceName) {
      // Sanitize device name for filesystem
      const sanitized = deviceName.replace(/[^a-zA-Z0-9-_]/g, "_");
      return `${sanitized}_${timestamp}`;
    }

    return `snapshot_${timestamp}`;
  }

  /**
   * Get the total size of a directory in bytes
   */
  private async getDirectorySize(dirPath: string): Promise<number> {
    let size = 0;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          size += await this.getDirectorySize(fullPath);
        } else {
          const stats = await fs.stat(fullPath);
          size += stats.size;
        }
      }
    } catch (error) {
      logger.debug(`Failed to get directory size for ${dirPath}: ${error}`);
    }

    return size;
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) {return "0 B";}

    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }

  /**
   * Get app data backup path within a snapshot
   */
  getAppDataPath(snapshotName: string): string {
    return path.join(this.getSnapshotPath(snapshotName), "app_data");
  }

  /**
   * Get settings backup path within a snapshot
   */
  getSettingsPath(snapshotName: string): string {
    return path.join(this.getSnapshotPath(snapshotName), "settings.json");
  }
}
