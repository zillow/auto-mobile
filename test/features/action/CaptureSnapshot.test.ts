import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { CaptureSnapshot } from "../../../src/features/action/CaptureSnapshot";
import { BootedDevice } from "../../../src/models";
import { FakeAdbClient } from "../../fakes/FakeAdbClient";
import { FakeTimer } from "../../fakes/FakeTimer";
import { SnapshotStorage } from "../../../src/utils/snapshotStorage";
import { promises as fs } from "fs";
import * as path from "path";
import * as os from "os";

describe("CaptureSnapshot", () => {
  let device: BootedDevice;
  let fakeAdb: FakeAdbClient;
  let fakeTimer: FakeTimer;
  let captureSnapshot: CaptureSnapshot;
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
    testBasePath = await fs.mkdtemp(path.join(os.tmpdir(), "snapshot-test-"));
    storage = new SnapshotStorage(testBasePath);

    // Create CaptureSnapshot instance with fakes
    captureSnapshot = new CaptureSnapshot(device, fakeAdb as any, undefined, fakeTimer);
    (captureSnapshot as any).storage = storage;

    // Setup default command results
    fakeAdb.setCommandResult("shell pm list packages", "package:com.example.app\npackage:com.system.app");
    fakeAdb.setCommandResult("shell pm list packages -3 com.example.app", "package:com.example.app");
    fakeAdb.setCommandResult("shell pm list packages -3 com.system.app", ""); // system app
    fakeAdb.setCommandResult("shell dumpsys package com.example.app", "flags=0x1234 ALLOW_BACKUP");
    fakeAdb.setCommandResult("shell settings list global", "airplane_mode_on=0");
    fakeAdb.setCommandResult("shell settings list secure", "android_id=abc123");
    fakeAdb.setCommandResult("shell settings list system", "screen_brightness=128");
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

  describe("app data backup with timeout", () => {
    it("should backup successfully when user confirms within timeout", async () => {
      // Setup: Create a fake backup file to simulate successful backup
      const snapshotName = "test-snapshot";
      const appDataPath = storage.getAppDataPath(snapshotName);
      await fs.mkdir(appDataPath, { recursive: true });
      const backupFilePath = storage.getBackupFilePath(snapshotName);

      // Mock getForegroundApp to return the test app
      (captureSnapshot as any).getForegroundApp = async () => "com.example.app";

      // Create backup file first to simulate successful backup
      await fs.writeFile(backupFilePath, "backup data", "utf-8");

      // Simulate successful backup
      fakeAdb.setCommandResult(
        `backup -f "${backupFilePath}" -noapk com.example.app`,
        "Success"
      );

      const result = await captureSnapshot.execute({
        snapshotName,
        includeAppData: true,
        includeSettings: false,
        useVmSnapshot: false,
        userApps: "current"
      });

      expect(result.snapshotName).toBe(snapshotName);
      expect(result.manifest.appDataBackup).toBeDefined();
      expect(result.manifest.appDataBackup?.backupMethod).toBe("adb_backup");
      expect(result.manifest.appDataBackup?.backedUpPackages).toContain("com.example.app");

      // Verify timer was used for timeout
      expect(fakeTimer.getPendingTimeoutCount()).toBe(0); // Should be cleared after completion
    });

    it("should handle backup when file is not created", async () => {
      const snapshotName = "test-snapshot-no-file";

      // Mock getForegroundApp to return the test app
      (captureSnapshot as any).getForegroundApp = async () => "com.example.app";

      // Don't create backup file - simulates timeout or failure
      const result = await captureSnapshot.execute({
        snapshotName,
        includeAppData: true,
        includeSettings: false,
        useVmSnapshot: false,
        userApps: "current",
        strictBackupMode: false,
        backupTimeout: 30000
      });

      // Should complete gracefully even without backup file
      expect(result.snapshotName).toBe(snapshotName);
      expect(result.manifest.appDataBackup).toBeDefined();
      expect(result.manifest.appDataBackup?.backedUpPackages?.length).toBe(0);
    });

    it("should use Timer interface with FakeTimer for fast tests", async () => {
      const snapshotName = "test-timer-integration";

      // Mock getForegroundApp to return the test app
      (captureSnapshot as any).getForegroundApp = async () => "com.example.app";

      // Create backup file
      const backupFilePath = storage.getBackupFilePath(snapshotName);
      const appDataPath = storage.getAppDataPath(snapshotName);
      await fs.mkdir(appDataPath, { recursive: true });
      await fs.writeFile(backupFilePath, "backup data", "utf-8");

      // Verify timer was injected properly
      expect((captureSnapshot as any).timer).toBe(fakeTimer);

      // Execute should use the fake timer (instant mode by default)
      const result = await captureSnapshot.execute({
        snapshotName,
        includeAppData: true,
        includeSettings: false,
        useVmSnapshot: false,
        userApps: "current"
      });

      // Should complete successfully with fake timer
      expect(result.snapshotName).toBe(snapshotName);
      expect(result.manifest.appDataBackup?.backupMethod).toBe("adb_backup");
    });

    it("should backup only current foreground app by default", async () => {
      const snapshotName = "test-current-app";

      // Setup getForegroundApp to return a specific app
      (captureSnapshot as any).getForegroundApp = async () => "com.example.app";

      // Create dummy backup file
      const backupFilePath = storage.getBackupFilePath(snapshotName);
      const appDataPath = storage.getAppDataPath(snapshotName);
      await fs.mkdir(appDataPath, { recursive: true });
      await fs.writeFile(backupFilePath, "backup data", "utf-8");

      await captureSnapshot.execute({
        snapshotName,
        includeAppData: true,
        includeSettings: false,
        useVmSnapshot: false,
        userApps: "current"
      });

      // Verify backup command was called with only the foreground app
      expect(fakeAdb.wasCommandExecuted("backup -f")).toBe(true);
      const backupCommand = fakeAdb.getAllCommands().find(cmd => cmd.includes("backup -f"));
      expect(backupCommand).toContain("com.example.app");
      expect(backupCommand).not.toContain("com.system.app");
    });

    it("should backup all user apps when userApps is 'all'", async () => {
      const snapshotName = "test-all-apps";

      // Add more user apps
      fakeAdb.setCommandResult("shell pm list packages",
                               "package:com.example.app1\npackage:com.example.app2\npackage:com.system.app");
      fakeAdb.setCommandResult("shell pm list packages -3 com.example.app1", "package:com.example.app1");
      fakeAdb.setCommandResult("shell pm list packages -3 com.example.app2", "package:com.example.app2");
      fakeAdb.setCommandResult("shell dumpsys package com.example.app1", "flags=0x1234 ALLOW_BACKUP");
      fakeAdb.setCommandResult("shell dumpsys package com.example.app2", "flags=0x1234 ALLOW_BACKUP");

      // Create dummy backup file
      const backupFilePath = storage.getBackupFilePath(snapshotName);
      const appDataPath = storage.getAppDataPath(snapshotName);
      await fs.mkdir(appDataPath, { recursive: true });
      await fs.writeFile(backupFilePath, "backup data", "utf-8");

      await captureSnapshot.execute({
        snapshotName,
        includeAppData: true,
        includeSettings: false,
        useVmSnapshot: false,
        userApps: "all"
      });

      // Verify backup command was called with all user apps
      expect(fakeAdb.wasCommandExecuted("backup -f")).toBe(true);
      const backupCommand = fakeAdb.getAllCommands().find(cmd => cmd.includes("backup -f"));
      expect(backupCommand).toContain("com.example.app1");
      expect(backupCommand).toContain("com.example.app2");
    });

    it("should skip apps with android:allowBackup=false", async () => {
      const snapshotName = "test-skip-nobackup";

      fakeAdb.setCommandResult("shell pm list packages",
                               "package:com.example.app1\npackage:com.example.app2");
      fakeAdb.setCommandResult("shell pm list packages -3 com.example.app1", "package:com.example.app1");
      fakeAdb.setCommandResult("shell pm list packages -3 com.example.app2", "package:com.example.app2");

      // app1 allows backup, app2 doesn't
      fakeAdb.setCommandResult("shell dumpsys package com.example.app1", "flags=0x1234 ALLOW_BACKUP");
      fakeAdb.setCommandResult("shell dumpsys package com.example.app2", "flags=0x1234 ALLOW_BACKUP=false");

      // Create dummy backup file
      const backupFilePath = storage.getBackupFilePath(snapshotName);
      const appDataPath = storage.getAppDataPath(snapshotName);
      await fs.mkdir(appDataPath, { recursive: true });
      await fs.writeFile(backupFilePath, "backup data", "utf-8");

      const result = await captureSnapshot.execute({
        snapshotName,
        includeAppData: true,
        includeSettings: false,
        useVmSnapshot: false,
        userApps: "all"
      });

      // Verify only app1 was backed up
      const backupCommand = fakeAdb.getAllCommands().find(cmd => cmd.includes("backup -f"));
      expect(backupCommand).toContain("com.example.app1");
      expect(backupCommand).not.toContain("com.example.app2");

      // Check manifest contains skipped packages
      expect(result.manifest.appDataBackup?.skippedPackages).toContain("com.example.app2");
    });

    it("should complete in under 100ms with FakeTimer", async () => {
      const snapshotName = "test-fast";

      // Mock getForegroundApp
      (captureSnapshot as any).getForegroundApp = async () => "com.example.app";

      // Create dummy backup file
      const backupFilePath = storage.getBackupFilePath(snapshotName);
      const appDataPath = storage.getAppDataPath(snapshotName);
      await fs.mkdir(appDataPath, { recursive: true });
      await fs.writeFile(backupFilePath, "backup data", "utf-8");

      const startTime = Date.now();

      await captureSnapshot.execute({
        snapshotName,
        includeAppData: true,
        includeSettings: false,
        useVmSnapshot: false,
        userApps: "current"
      });

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100);
    });
  });
});
