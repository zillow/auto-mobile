import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { RestoreSnapshot } from "../../../src/features/action/RestoreSnapshot";
import { BootedDevice } from "../../../src/models";
import { FakeAdbClient } from "../../fakes/FakeAdbClient";
import { FakeTimer } from "../../fakes/FakeTimer";
import { SnapshotStorage, SnapshotManifest } from "../../../src/utils/snapshotStorage";
import { promises as fs } from "fs";
import * as path from "path";
import * as os from "os";

describe("RestoreSnapshot", () => {
  let device: BootedDevice;
  let fakeAdb: FakeAdbClient;
  let fakeTimer: FakeTimer;
  let restoreSnapshot: RestoreSnapshot;
  let storage: SnapshotStorage;
  let testBasePath: string;

  beforeEach(async () => {
    // Create test device
    device = {
      deviceId: "emulator-5554",
      name: "Pixel_5",
      platform: "android",
      isEmulator: true
    };

    // Create fakes
    fakeAdb = new FakeAdbClient();
    fakeTimer = new FakeTimer();

    // Create secure temporary directory for tests
    testBasePath = await fs.mkdtemp(path.join(os.tmpdir(), "snapshot-restore-test-"));
    storage = new SnapshotStorage(testBasePath);

    // Create RestoreSnapshot instance with fakes
    restoreSnapshot = new RestoreSnapshot(device, fakeAdb as any, undefined, fakeTimer);
    (restoreSnapshot as any).storage = storage;

    // Setup default command results
    fakeAdb.setCommandResult("shell pm clear com.example.app", "Success");
    fakeAdb.setCommandResult(
      "shell am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER com.example.app",
      ""
    );
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testBasePath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
    fakeTimer.reset();
  });

  describe("app data restore with timeout", () => {
    it("should restore successfully when user confirms within timeout", async () => {
      const snapshotName = "test-snapshot";

      // Create manifest with backup data
      const manifest: SnapshotManifest = {
        snapshotName,
        timestamp: new Date().toISOString(),
        deviceId: device.deviceId,
        deviceName: device.name,
        platform: "android",
        snapshotType: "adb",
        includeAppData: true,
        includeSettings: false,
        packages: ["com.example.app"],
        appDataBackup: {
          backupFile: "backup.ab",
          backupMethod: "adb_backup",
          totalPackages: 1,
          backedUpPackages: ["com.example.app"],
          skippedPackages: [],
          failedPackages: [],
          backupTimedOut: false
        }
      };

      // Create backup file
      const appDataPath = storage.getAppDataPath(snapshotName);
      await fs.mkdir(appDataPath, { recursive: true });
      const backupFilePath = storage.getBackupFilePath(snapshotName);
      await fs.writeFile(backupFilePath, "backup data", "utf-8");

      // Save manifest
      await storage.saveManifest(manifest);

      // Setup restore command result
      fakeAdb.setCommandResult(`restore "${backupFilePath}"`, "");

      const result = await restoreSnapshot.execute({
        snapshotName,
        useVmSnapshot: false
      });

      expect(result.snapshotType).toBe("adb");
      expect(result.restoredAt).toBeDefined();

      // Verify restore command was called
      expect(fakeAdb.wasCommandExecuted(`restore "${backupFilePath}"`)).toBe(true);

      // Verify timer was used for timeout
      expect(fakeTimer.getPendingTimeoutCount()).toBe(0); // Should be cleared after completion
    });

    it("should handle restore timeout gracefully", async () => {
      const snapshotName = "test-snapshot-timeout";

      // Create manifest with backup data
      const manifest: SnapshotManifest = {
        snapshotName,
        timestamp: new Date().toISOString(),
        deviceId: device.deviceId,
        deviceName: device.name,
        platform: "android",
        snapshotType: "adb",
        includeAppData: true,
        includeSettings: false,
        packages: ["com.example.app"],
        appDataBackup: {
          backupFile: "backup.ab",
          backupMethod: "adb_backup",
          totalPackages: 1,
          backedUpPackages: ["com.example.app"],
          skippedPackages: [],
          failedPackages: [],
          backupTimedOut: false
        }
      };

      // Create backup file
      const appDataPath = storage.getAppDataPath(snapshotName);
      await fs.mkdir(appDataPath, { recursive: true });
      const backupFilePath = storage.getBackupFilePath(snapshotName);
      await fs.writeFile(backupFilePath, "backup data", "utf-8");

      // Save manifest
      await storage.saveManifest(manifest);

      // Override executeCommand for restore to simulate delay
      const originalExecute = fakeAdb.executeCommand.bind(fakeAdb);
      fakeAdb.executeCommand = async (command: string) => {
        if (command.includes("restore")) {
          // Simulate restore taking a long time
          await fakeTimer.sleep(40000); // Longer than default 30s timeout
          return { stdout: "", stderr: "" };
        }
        return originalExecute(command);
      };

      // Start restore in background
      const restorePromise = restoreSnapshot.execute({
        snapshotName,
        useVmSnapshot: false
      });

      // Advance time to trigger timeout
      fakeTimer.advanceTime(30001);

      const result = await restorePromise;

      // Should complete even with timeout (restore is best-effort)
      expect(result.snapshotType).toBe("adb");
      expect(result.restoredAt).toBeDefined();
    });

    it("should skip restore if no backup file exists", async () => {
      const snapshotName = "test-no-backup";

      // Create manifest without backup data
      const manifest: SnapshotManifest = {
        snapshotName,
        timestamp: new Date().toISOString(),
        deviceId: device.deviceId,
        deviceName: device.name,
        platform: "android",
        snapshotType: "adb",
        includeAppData: true,
        includeSettings: false,
        packages: ["com.example.app"],
        appDataBackup: {
          backupMethod: "none",
          totalPackages: 1,
          backedUpPackages: [],
          skippedPackages: [],
          failedPackages: []
        }
      };

      // Create app data directory but no backup file
      const appDataPath = storage.getAppDataPath(snapshotName);
      await fs.mkdir(appDataPath, { recursive: true });

      // Save manifest
      await storage.saveManifest(manifest);

      const result = await restoreSnapshot.execute({
        snapshotName,
        useVmSnapshot: false
      });

      expect(result.snapshotType).toBe("adb");

      // Verify restore command was not called
      expect(fakeAdb.wasCommandExecuted("restore")).toBe(false);
    });

    it("should clear app data before restore", async () => {
      const snapshotName = "test-clear";

      // Create manifest with packages
      const manifest: SnapshotManifest = {
        snapshotName,
        timestamp: new Date().toISOString(),
        deviceId: device.deviceId,
        deviceName: device.name,
        platform: "android",
        snapshotType: "adb",
        includeAppData: true,
        includeSettings: false,
        packages: ["com.example.app1", "com.example.app2"],
        appDataBackup: {
          backupFile: "backup.ab",
          backupMethod: "adb_backup",
          totalPackages: 2,
          backedUpPackages: ["com.example.app1"],
          skippedPackages: [],
          failedPackages: [],
          backupTimedOut: false
        }
      };

      // Create backup file
      const appDataPath = storage.getAppDataPath(snapshotName);
      await fs.mkdir(appDataPath, { recursive: true });
      const backupFilePath = storage.getBackupFilePath(snapshotName);
      await fs.writeFile(backupFilePath, "backup data", "utf-8");

      // Save manifest
      await storage.saveManifest(manifest);

      // Setup clear commands
      fakeAdb.setCommandResult("shell pm clear com.example.app1", "Success");
      fakeAdb.setCommandResult("shell pm clear com.example.app2", "Success");
      fakeAdb.setCommandResult(`restore "${backupFilePath}"`, "");

      await restoreSnapshot.execute({
        snapshotName,
        useVmSnapshot: false
      });

      // Verify pm clear was called for both apps
      expect(fakeAdb.wasCommandExecuted("shell pm clear com.example.app1")).toBe(true);
      expect(fakeAdb.wasCommandExecuted("shell pm clear com.example.app2")).toBe(true);
    });

    it("should restore foreground app after data restore", async () => {
      const snapshotName = "test-foreground";
      const foregroundApp = "com.example.app";

      // Create manifest with foreground app
      const manifest: SnapshotManifest = {
        snapshotName,
        timestamp: new Date().toISOString(),
        deviceId: device.deviceId,
        deviceName: device.name,
        platform: "android",
        snapshotType: "adb",
        includeAppData: true,
        includeSettings: false,
        packages: [foregroundApp],
        foregroundApp,
        appDataBackup: {
          backupFile: "backup.ab",
          backupMethod: "adb_backup",
          totalPackages: 1,
          backedUpPackages: [foregroundApp],
          skippedPackages: [],
          failedPackages: [],
          backupTimedOut: false
        }
      };

      // Create backup file
      const appDataPath = storage.getAppDataPath(snapshotName);
      await fs.mkdir(appDataPath, { recursive: true });
      const backupFilePath = storage.getBackupFilePath(snapshotName);
      await fs.writeFile(backupFilePath, "backup data", "utf-8");

      // Save manifest
      await storage.saveManifest(manifest);

      fakeAdb.setCommandResult(`restore "${backupFilePath}"`, "");

      await restoreSnapshot.execute({
        snapshotName,
        useVmSnapshot: false
      });

      // Verify foreground app was launched
      expect(fakeAdb.wasCommandExecuted(
        `shell am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER ${foregroundApp}`
      )).toBe(true);
    });

    it("should restore VM snapshot with timer sleep", async () => {
      const snapshotName = "test-vm";

      // Create VM snapshot manifest
      const manifest: SnapshotManifest = {
        snapshotName,
        timestamp: new Date().toISOString(),
        deviceId: device.deviceId,
        deviceName: device.name,
        platform: "android",
        snapshotType: "vm",
        includeAppData: true,
        includeSettings: false
      };

      // Save manifest
      await storage.saveManifest(manifest);

      // Setup VM snapshot load command
      fakeAdb.setCommandResult(`emu avd snapshot load ${snapshotName}`, "OK");

      await restoreSnapshot.execute({
        snapshotName,
        useVmSnapshot: true
      });

      // Verify sleep was called for stabilization
      expect(fakeTimer.wasSleepCalled(2000)).toBe(true);

      // Verify VM restore command was called
      expect(fakeAdb.wasCommandExecuted(`emu avd snapshot load ${snapshotName}`)).toBe(true);
    });

    it("should complete in under 100ms with FakeTimer", async () => {
      const snapshotName = "test-fast";

      // Create manifest
      const manifest: SnapshotManifest = {
        snapshotName,
        timestamp: new Date().toISOString(),
        deviceId: device.deviceId,
        deviceName: device.name,
        platform: "android",
        snapshotType: "adb",
        includeAppData: true,
        includeSettings: false,
        packages: ["com.example.app"],
        appDataBackup: {
          backupFile: "backup.ab",
          backupMethod: "adb_backup",
          totalPackages: 1,
          backedUpPackages: ["com.example.app"],
          skippedPackages: [],
          failedPackages: [],
          backupTimedOut: false
        }
      };

      // Create backup file
      const appDataPath = storage.getAppDataPath(snapshotName);
      await fs.mkdir(appDataPath, { recursive: true });
      const backupFilePath = storage.getBackupFilePath(snapshotName);
      await fs.writeFile(backupFilePath, "backup data", "utf-8");

      // Save manifest
      await storage.saveManifest(manifest);

      fakeAdb.setCommandResult(`restore "${backupFilePath}"`, "");

      const startTime = Date.now();

      await restoreSnapshot.execute({
        snapshotName,
        useVmSnapshot: false
      });

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100);
    });
  });
});
