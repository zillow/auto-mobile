import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DeviceSnapshotStore } from "../../src/utils/DeviceSnapshotStore";
import { promises as fs } from "fs";
import * as path from "path";
import * as os from "os";

describe("DeviceSnapshotStore", () => {
  let store: DeviceSnapshotStore;
  let testBasePath: string;

  beforeEach(async () => {
    testBasePath = await fs.mkdtemp(path.join(os.tmpdir(), "snapshot-store-test-"));
    store = new DeviceSnapshotStore(testBasePath);
    await store.ensureSnapshotsDirectory();
  });

  afterEach(async () => {
    try {
      await fs.rm(testBasePath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("generateSnapshotName", () => {
    it("should generate a snapshot name with timestamp", () => {
      const name = store.generateSnapshotName();
      expect(name).toMatch(/^snapshot_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/);
    });

    it("should include device name when provided", () => {
      const name = store.generateSnapshotName("Pixel_5");
      expect(name).toMatch(/^Pixel_5_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/);
    });

    it("should sanitize device names with special characters", () => {
      const name = store.generateSnapshotName("Pixel 5 (API 30)");
      expect(name).toMatch(/^Pixel_5__API_30__\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/);
    });
  });

  it("should return correct snapshot paths", () => {
    expect(store.getSnapshotPath("test-snapshot"))
      .toBe(path.join(testBasePath, "test-snapshot"));
    expect(store.getSettingsPath("test-snapshot"))
      .toBe(path.join(testBasePath, "test-snapshot", "settings.json"));
    expect(store.getAppDataPath("test-snapshot"))
      .toBe(path.join(testBasePath, "test-snapshot", "app_data"));
    expect(store.getBackupFilePath("test-snapshot"))
      .toBe(path.join(testBasePath, "test-snapshot", "app_data", "backup.ab"));
  });

  it("should detect snapshot directories", async () => {
    const snapshotName = "snapshot-exists";
    expect(await store.snapshotDirectoryExists(snapshotName)).toBe(false);

    await fs.mkdir(store.getSnapshotPath(snapshotName), { recursive: true });
    expect(await store.snapshotDirectoryExists(snapshotName)).toBe(true);
  });

  it("should delete snapshot data", async () => {
    const snapshotName = "snapshot-delete";
    await fs.mkdir(store.getSnapshotPath(snapshotName), { recursive: true });
    expect(await store.snapshotDirectoryExists(snapshotName)).toBe(true);

    await store.deleteSnapshotData(snapshotName);
    expect(await store.snapshotDirectoryExists(snapshotName)).toBe(false);
  });

  it("should compute snapshot size", async () => {
    const snapshotName = "snapshot-size";
    const snapshotDir = store.getSnapshotPath(snapshotName);
    await fs.mkdir(snapshotDir, { recursive: true });
    const filePath = path.join(snapshotDir, "sample.txt");
    await fs.writeFile(filePath, "hello");

    const size = await store.getSnapshotSizeBytes(snapshotName);
    expect(size).toBe(5);
  });
});
