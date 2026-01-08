import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { SnapshotStorage, SnapshotManifest } from "../../src/utils/snapshotStorage";
import { promises as fs } from "fs";
import * as path from "path";
import * as os from "os";

describe("SnapshotStorage", () => {
  let storage: SnapshotStorage;
  let testBasePath: string;

  beforeEach(async () => {
    // Create a temporary directory for tests
    testBasePath = path.join(os.tmpdir(), `snapshot-test-${Date.now()}`);
    storage = new SnapshotStorage(testBasePath);
    await storage.ensureSnapshotsDirectory();
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testBasePath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("generateSnapshotName", () => {
    it("should generate a snapshot name with timestamp", () => {
      const name = storage.generateSnapshotName();
      expect(name).toMatch(/^snapshot_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/);
    });

    it("should include device name when provided", () => {
      const name = storage.generateSnapshotName("Pixel_5");
      expect(name).toMatch(/^Pixel_5_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/);
    });

    it("should sanitize device names with special characters", () => {
      const name = storage.generateSnapshotName("Pixel 5 (API 30)");
      expect(name).toMatch(/^Pixel_5__API_30__\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/);
    });
  });

  describe("saveManifest and loadManifest", () => {
    it("should save and load a manifest", async () => {
      const manifest: SnapshotManifest = {
        snapshotName: "test-snapshot",
        timestamp: new Date().toISOString(),
        deviceId: "emulator-5554",
        deviceName: "Pixel_5",
        platform: "android",
        snapshotType: "vm",
        includeAppData: true,
        includeSettings: true
      };

      await storage.saveManifest(manifest);
      const loaded = await storage.loadManifest("test-snapshot");

      expect(loaded).toEqual(manifest);
    });

    it("should throw error when loading non-existent manifest", async () => {
      await expect(storage.loadManifest("non-existent")).rejects.toThrow();
    });
  });

  describe("snapshotExists", () => {
    it("should return true for existing snapshot", async () => {
      const manifest: SnapshotManifest = {
        snapshotName: "existing-snapshot",
        timestamp: new Date().toISOString(),
        deviceId: "emulator-5554",
        deviceName: "Pixel_5",
        platform: "android",
        snapshotType: "adb",
        includeAppData: false,
        includeSettings: true
      };

      await storage.saveManifest(manifest);
      const exists = await storage.snapshotExists("existing-snapshot");

      expect(exists).toBe(true);
    });

    it("should return false for non-existent snapshot", async () => {
      const exists = await storage.snapshotExists("non-existent");
      expect(exists).toBe(false);
    });
  });

  describe("listSnapshots", () => {
    it("should list all snapshots", async () => {
      const manifest1: SnapshotManifest = {
        snapshotName: "snapshot-1",
        timestamp: new Date("2024-01-01").toISOString(),
        deviceId: "emulator-5554",
        deviceName: "Pixel_5",
        platform: "android",
        snapshotType: "vm",
        includeAppData: true,
        includeSettings: true
      };

      const manifest2: SnapshotManifest = {
        snapshotName: "snapshot-2",
        timestamp: new Date("2024-01-02").toISOString(),
        deviceId: "emulator-5556",
        deviceName: "Pixel_6",
        platform: "android",
        snapshotType: "adb",
        includeAppData: true,
        includeSettings: false
      };

      await storage.saveManifest(manifest1);
      await storage.saveManifest(manifest2);

      const snapshots = await storage.listSnapshots();

      expect(snapshots).toHaveLength(2);
      // Should be sorted by timestamp (newest first)
      expect(snapshots[0].snapshotName).toBe("snapshot-2");
      expect(snapshots[1].snapshotName).toBe("snapshot-1");
    });

    it("should filter snapshots by device ID", async () => {
      const manifest1: SnapshotManifest = {
        snapshotName: "snapshot-1",
        timestamp: new Date().toISOString(),
        deviceId: "emulator-5554",
        deviceName: "Pixel_5",
        platform: "android",
        snapshotType: "vm",
        includeAppData: true,
        includeSettings: true
      };

      const manifest2: SnapshotManifest = {
        snapshotName: "snapshot-2",
        timestamp: new Date().toISOString(),
        deviceId: "emulator-5556",
        deviceName: "Pixel_6",
        platform: "android",
        snapshotType: "adb",
        includeAppData: true,
        includeSettings: false
      };

      await storage.saveManifest(manifest1);
      await storage.saveManifest(manifest2);

      const snapshots = await storage.listSnapshots("emulator-5554");

      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].deviceId).toBe("emulator-5554");
    });

    it("should return empty array when no snapshots exist", async () => {
      const snapshots = await storage.listSnapshots();
      expect(snapshots).toEqual([]);
    });
  });

  describe("deleteSnapshot", () => {
    it("should delete a snapshot", async () => {
      const manifest: SnapshotManifest = {
        snapshotName: "to-delete",
        timestamp: new Date().toISOString(),
        deviceId: "emulator-5554",
        deviceName: "Pixel_5",
        platform: "android",
        snapshotType: "vm",
        includeAppData: true,
        includeSettings: true
      };

      await storage.saveManifest(manifest);
      expect(await storage.snapshotExists("to-delete")).toBe(true);

      await storage.deleteSnapshot("to-delete");
      expect(await storage.snapshotExists("to-delete")).toBe(false);
    });

    it("should not throw when deleting non-existent snapshot", async () => {
      // deleteSnapshot uses force: true, so it shouldn't throw
      await storage.deleteSnapshot("non-existent");
      // If we get here without error, the test passes
      expect(true).toBe(true);
    });
  });

  describe("getSnapshotPath", () => {
    it("should return correct path", () => {
      const snapshotPath = storage.getSnapshotPath("test-snapshot");
      expect(snapshotPath).toBe(path.join(testBasePath, "test-snapshot"));
    });
  });

  describe("getManifestPath", () => {
    it("should return correct manifest path", () => {
      const manifestPath = storage.getManifestPath("test-snapshot");
      expect(manifestPath).toBe(path.join(testBasePath, "test-snapshot", "manifest.json"));
    });
  });

  describe("getAppDataPath", () => {
    it("should return correct app data path", () => {
      const appDataPath = storage.getAppDataPath("test-snapshot");
      expect(appDataPath).toBe(path.join(testBasePath, "test-snapshot", "app_data"));
    });
  });

  describe("getSettingsPath", () => {
    it("should return correct settings path", () => {
      const settingsPath = storage.getSettingsPath("test-snapshot");
      expect(settingsPath).toBe(path.join(testBasePath, "test-snapshot", "settings.json"));
    });
  });
});
