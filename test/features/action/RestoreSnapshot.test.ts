import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { RestoreSnapshot } from "../../../src/features/action/RestoreSnapshot";
import { BootedDevice, DeviceSnapshotManifest } from "../../../src/models";
import { AdbClientFactory } from "../../../src/utils/android-cmdline-tools/AdbClientFactory";
import { FakeAdbClient } from "../../fakes/FakeAdbClient";
import { FakeTimer } from "../../fakes/FakeTimer";
import { DeviceSnapshotStore } from "../../../src/utils/DeviceSnapshotStore";
import { promises as fs } from "fs";
import * as path from "path";
import * as os from "os";

describe("RestoreSnapshot", () => {
  let device: BootedDevice;
  let fakeAdb: FakeAdbClient;
  let fakeAdbFactory: AdbClientFactory;
  let fakeTimer: FakeTimer;
  let restoreSnapshot: RestoreSnapshot;
  let store: DeviceSnapshotStore;
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
    fakeAdbFactory = { create: () => fakeAdb as any };
    fakeTimer = new FakeTimer();
    fakeTimer.enableAutoAdvance();

    // Create secure temporary directory for tests
    testBasePath = await fs.mkdtemp(path.join(os.tmpdir(), "snapshot-restore-test-"));
    store = new DeviceSnapshotStore(testBasePath);

    // Create RestoreSnapshot instance with fakes
    restoreSnapshot = new RestoreSnapshot(device, fakeAdbFactory, undefined, fakeTimer, store);

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

  describe("VM snapshot restore", () => {
    it("should restore VM snapshot for emulator", async () => {
      const snapshotName = "test-vm-restore";

      // Create VM snapshot manifest
      const manifest: DeviceSnapshotManifest = {
        snapshotName,
        timestamp: new Date().toISOString(),
        deviceId: device.deviceId,
        deviceName: device.name,
        platform: "android",
        snapshotType: "vm",
        includeAppData: true,
        includeSettings: false
      };


      // Setup VM snapshot load command
      fakeAdb.setCommandResult(`emu avd snapshot load ${snapshotName}`, "OK");

      const result = await restoreSnapshot.execute({
        snapshotName,
        manifest,
        useVmSnapshot: true
      });

      expect(result.snapshotType).toBe("vm");
      expect(result.restoredAt).toBeDefined();
      expect(fakeAdb.wasCommandExecuted(`emu avd snapshot load ${snapshotName}`)).toBe(true);
      expect(fakeTimer.wasSleepCalled(2000)).toBe(true); // Stabilization sleep
    });

    it("should throw error when VM snapshot load fails with KO", async () => {
      const snapshotName = "test-vm-fail";

      // Create VM snapshot manifest
      const manifest: DeviceSnapshotManifest = {
        snapshotName,
        timestamp: new Date().toISOString(),
        deviceId: device.deviceId,
        deviceName: device.name,
        platform: "android",
        snapshotType: "vm",
        includeAppData: true,
        includeSettings: false
      };


      // Setup VM snapshot load command to fail
      fakeAdb.setCommandResult(`emu avd snapshot load ${snapshotName}`, "", "KO: snapshot load failed");

      await expect(restoreSnapshot.execute({
        snapshotName,
        manifest,
        useVmSnapshot: true
      })).rejects.toThrow("Failed to restore VM snapshot");
    });

    it("should throw error when VM snapshot load fails with KO in stdout", async () => {
      const snapshotName = "test-vm-fail-stdout";

      // Create VM snapshot manifest
      const manifest: DeviceSnapshotManifest = {
        snapshotName,
        timestamp: new Date().toISOString(),
        deviceId: device.deviceId,
        deviceName: device.name,
        platform: "android",
        snapshotType: "vm",
        includeAppData: true,
        includeSettings: false
      };


      // Setup VM snapshot load command to fail (KO in stdout)
      fakeAdb.setCommandResult(`emu avd snapshot load ${snapshotName}`, "KO: snapshot load failed");

      await expect(restoreSnapshot.execute({
        snapshotName,
        manifest,
        useVmSnapshot: true
      })).rejects.toThrow("Failed to restore VM snapshot");
    });

    it("should throw error when VM snapshot load returns no OK response", async () => {
      const snapshotName = "test-vm-empty-response";

      // Create VM snapshot manifest
      const manifest: DeviceSnapshotManifest = {
        snapshotName,
        timestamp: new Date().toISOString(),
        deviceId: device.deviceId,
        deviceName: device.name,
        platform: "android",
        snapshotType: "vm",
        includeAppData: true,
        includeSettings: false
      };


      // Setup VM snapshot load command with empty output
      fakeAdb.setCommandResult(`emu avd snapshot load ${snapshotName}`, "", "");

      await expect(restoreSnapshot.execute({
        snapshotName,
        manifest,
        useVmSnapshot: true
      })).rejects.toThrow("no response from emulator");
    });

    it("should surface offline errors when VM snapshot command fails", async () => {
      const snapshotName = "test-vm-offline";

      // Create VM snapshot manifest
      const manifest: DeviceSnapshotManifest = {
        snapshotName,
        timestamp: new Date().toISOString(),
        deviceId: device.deviceId,
        deviceName: device.name,
        platform: "android",
        snapshotType: "vm",
        includeAppData: true,
        includeSettings: false
      };


      // Setup VM snapshot load command to throw offline error
      fakeAdb.setCommandError(
        `emu avd snapshot load ${snapshotName}`,
        new Error("device offline")
      );

      await expect(restoreSnapshot.execute({
        snapshotName,
        manifest,
        useVmSnapshot: true
      })).rejects.toThrow("offline");
    });

    it("should pass VM snapshot timeout to adb command", async () => {
      const snapshotName = "test-vm-timeout";
      const vmSnapshotTimeoutMs = 15000;

      // Create VM snapshot manifest
      const manifest: DeviceSnapshotManifest = {
        snapshotName,
        timestamp: new Date().toISOString(),
        deviceId: device.deviceId,
        deviceName: device.name,
        platform: "android",
        snapshotType: "vm",
        includeAppData: true,
        includeSettings: false
      };


      // Setup VM snapshot load command
      fakeAdb.setCommandResult(`emu avd snapshot load ${snapshotName}`, "OK");

      await restoreSnapshot.execute({
        snapshotName,
        manifest,
        useVmSnapshot: true,
        vmSnapshotTimeoutMs
      });

      const call = fakeAdb.getCommandCalls().find(
        entry => entry.command === `emu avd snapshot load ${snapshotName}`
      );
      expect(call?.timeoutMs).toBe(vmSnapshotTimeoutMs);
    });

    it("should use ADB restore for VM snapshot when useVmSnapshot is false", async () => {
      const snapshotName = "test-vm-as-adb";

      // Create VM snapshot manifest
      const manifest: DeviceSnapshotManifest = {
        snapshotName,
        timestamp: new Date().toISOString(),
        deviceId: device.deviceId,
        deviceName: device.name,
        platform: "android",
        snapshotType: "vm",
        includeAppData: false,
        includeSettings: false
      };


      const result = await restoreSnapshot.execute({
        snapshotName,
        manifest,
        useVmSnapshot: false
      });

      // Should use ADB restore even for VM snapshot when flag is false
      expect(result.snapshotType).toBe("vm");
      expect(fakeAdb.wasCommandExecuted("emu avd snapshot load")).toBe(false);
    });

    it("should not use VM restore for physical device", async () => {
      const snapshotName = "test-physical-vm";

      // Create physical device
      const physicalDevice: BootedDevice = {
        deviceId: "ABC123DEF",
        name: "Pixel_5_Physical",
        platform: "android",
        isEmulator: false
      };

      const restorePhysical = new RestoreSnapshot(
        physicalDevice,
        fakeAdbFactory,
        undefined,
        fakeTimer,
        store
      );

      // Create VM snapshot manifest (but can't restore on physical device)
      const manifest: DeviceSnapshotManifest = {
        snapshotName,
        timestamp: new Date().toISOString(),
        deviceId: device.deviceId,
        deviceName: device.name,
        platform: "android",
        snapshotType: "vm",
        includeAppData: false,
        includeSettings: false
      };


      const result = await restorePhysical.execute({
        snapshotName,
        manifest,
        useVmSnapshot: true
      });

      // Should use ADB restore for physical device
      expect(result.snapshotType).toBe("vm");
      expect(fakeAdb.wasCommandExecuted("emu avd snapshot load")).toBe(false);
    });
  });

  describe("settings restore", () => {
    it("should restore all settings types", async () => {
      const snapshotName = "test-restore-settings";

      // Create manifest with settings
      const manifest: DeviceSnapshotManifest = {
        snapshotName,
        timestamp: new Date().toISOString(),
        deviceId: device.deviceId,
        deviceName: device.name,
        platform: "android",
        snapshotType: "adb",
        includeAppData: false,
        includeSettings: true,
        settings: {
          global: { airplane_mode_on: "1", wifi_on: "0" },
          secure: { android_id: "xyz789", mock_location: "0" },
          system: { screen_brightness: "200", font_scale: "1.2" }
        }
      };


      // Setup settings restore commands
      fakeAdb.setCommandResult("shell settings put global airplane_mode_on '1'", "");
      fakeAdb.setCommandResult("shell settings put global wifi_on '0'", "");
      fakeAdb.setCommandResult("shell settings put secure android_id 'xyz789'", "");
      fakeAdb.setCommandResult("shell settings put secure mock_location '0'", "");
      fakeAdb.setCommandResult("shell settings put system screen_brightness '200'", "");
      fakeAdb.setCommandResult("shell settings put system font_scale '1.2'", "");

      await restoreSnapshot.execute({
        snapshotName,
        manifest,
        useVmSnapshot: false
      });

      // Verify all settings were restored
      expect(fakeAdb.wasCommandExecuted("shell settings put global airplane_mode_on '1'")).toBe(true);
      expect(fakeAdb.wasCommandExecuted("shell settings put global wifi_on '0'")).toBe(true);
      expect(fakeAdb.wasCommandExecuted("shell settings put secure android_id 'xyz789'")).toBe(true);
      expect(fakeAdb.wasCommandExecuted("shell settings put secure mock_location '0'")).toBe(true);
      expect(fakeAdb.wasCommandExecuted("shell settings put system screen_brightness '200'")).toBe(true);
      expect(fakeAdb.wasCommandExecuted("shell settings put system font_scale '1.2'")).toBe(true);
    });

    it("should handle settings with special characters", async () => {
      const snapshotName = "test-settings-special";

      // Create manifest with settings containing special characters
      const manifest: DeviceSnapshotManifest = {
        snapshotName,
        timestamp: new Date().toISOString(),
        deviceId: device.deviceId,
        deviceName: device.name,
        platform: "android",
        snapshotType: "adb",
        includeAppData: false,
        includeSettings: true,
        settings: {
          global: { test_key: "value with spaces and 'quotes'" },
          secure: {},
          system: {}
        }
      };


      // Setup settings restore command with escaped value
      fakeAdb.setCommandResult("shell settings put global test_key 'value with spaces and '\\''quotes'\\'''", "");

      await restoreSnapshot.execute({
        snapshotName,
        manifest,
        useVmSnapshot: false
      });

      // Verify special characters were escaped properly
      expect(fakeAdb.wasCommandExecuted("shell settings put global test_key")).toBe(true);
    });

    it("should skip empty settings sections", async () => {
      const snapshotName = "test-empty-settings";

      // Create manifest with empty settings
      const manifest: DeviceSnapshotManifest = {
        snapshotName,
        timestamp: new Date().toISOString(),
        deviceId: device.deviceId,
        deviceName: device.name,
        platform: "android",
        snapshotType: "adb",
        includeAppData: false,
        includeSettings: true,
        settings: {
          global: {},
          secure: {},
          system: {}
        }
      };


      await restoreSnapshot.execute({
        snapshotName,
        manifest,
        useVmSnapshot: false
      });

      // Verify no settings commands were called
      expect(fakeAdb.wasCommandExecuted("shell settings put")).toBe(false);
    });

    it("should skip settings restore when includeSettings is false", async () => {
      const snapshotName = "test-no-settings-restore";

      // Create manifest without settings
      const manifest: DeviceSnapshotManifest = {
        snapshotName,
        timestamp: new Date().toISOString(),
        deviceId: device.deviceId,
        deviceName: device.name,
        platform: "android",
        snapshotType: "adb",
        includeAppData: false,
        includeSettings: false
      };


      await restoreSnapshot.execute({
        snapshotName,
        manifest,
        useVmSnapshot: false
      });

      // Verify no settings commands were called
      expect(fakeAdb.wasCommandExecuted("shell settings put")).toBe(false);
    });
  });

  describe("error scenarios", () => {
    it("should throw error for platform mismatch", async () => {
      const snapshotName = "test-platform-mismatch";

      // Create manifest for different platform
      const manifest: DeviceSnapshotManifest = {
        snapshotName,
        timestamp: new Date().toISOString(),
        deviceId: "ios-device",
        deviceName: "iPhone_14",
        platform: "ios",
        snapshotType: "adb",
        includeAppData: false,
        includeSettings: false
      };


      await expect(restoreSnapshot.execute({
        snapshotName,
        manifest,
        useVmSnapshot: false
      })).rejects.toThrow("Snapshot platform 'ios' does not match device platform 'android'");
    });

    it("should throw error for non-Android platform", () => {
      const iosDevice: BootedDevice = {
        deviceId: "ios-device",
        name: "iPhone_14",
        platform: "ios",
        isEmulator: true
      };

      expect(() => new RestoreSnapshot(iosDevice, fakeAdbFactory, undefined, fakeTimer))
        .toThrow("Snapshot restore is currently only supported for Android devices");
    });

    it("should handle app clear failures gracefully", async () => {
      const snapshotName = "test-clear-fail";

      // Create manifest with packages
      const manifest: DeviceSnapshotManifest = {
        snapshotName,
        timestamp: new Date().toISOString(),
        deviceId: device.deviceId,
        deviceName: device.name,
        platform: "android",
        snapshotType: "adb",
        includeAppData: true,
        includeSettings: false,
        packages: ["com.example.app1", "com.example.app2"]
      };


      // Setup clear commands - one succeeds, one fails
      fakeAdb.setCommandResult("shell pm clear com.example.app1", "Success");
      fakeAdb.setCommandResult("shell pm clear com.example.app2", "Failed");

      // Should not throw, just log warnings
      await restoreSnapshot.execute({
        snapshotName,
        manifest,
        useVmSnapshot: false
      });

      expect(fakeAdb.wasCommandExecuted("shell pm clear com.example.app1")).toBe(true);
      expect(fakeAdb.wasCommandExecuted("shell pm clear com.example.app2")).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should not clear app data when includeAppData is false", async () => {
      const snapshotName = "test-no-clear";

      // Create manifest without app data
      const manifest: DeviceSnapshotManifest = {
        snapshotName,
        timestamp: new Date().toISOString(),
        deviceId: device.deviceId,
        deviceName: device.name,
        platform: "android",
        snapshotType: "adb",
        includeAppData: false,
        includeSettings: false,
        packages: ["com.example.app"]
      };


      await restoreSnapshot.execute({
        snapshotName,
        manifest,
        useVmSnapshot: false
      });

      // Verify pm clear was not called
      expect(fakeAdb.wasCommandExecuted("shell pm clear")).toBe(false);
    });

    it("should not clear app data when packages list is empty", async () => {
      const snapshotName = "test-empty-packages";

      // Create manifest with empty packages
      const manifest: DeviceSnapshotManifest = {
        snapshotName,
        timestamp: new Date().toISOString(),
        deviceId: device.deviceId,
        deviceName: device.name,
        platform: "android",
        snapshotType: "adb",
        includeAppData: true,
        includeSettings: false,
        packages: []
      };


      await restoreSnapshot.execute({
        snapshotName,
        manifest,
        useVmSnapshot: false
      });

      // Verify pm clear was not called
      expect(fakeAdb.wasCommandExecuted("shell pm clear")).toBe(false);
    });

    it("should skip foreground app restore when not in manifest", async () => {
      const snapshotName = "test-no-foreground";

      // Create manifest without foreground app
      const manifest: DeviceSnapshotManifest = {
        snapshotName,
        timestamp: new Date().toISOString(),
        deviceId: device.deviceId,
        deviceName: device.name,
        platform: "android",
        snapshotType: "adb",
        includeAppData: false,
        includeSettings: false
      };


      await restoreSnapshot.execute({
        snapshotName,
        manifest,
        useVmSnapshot: false
      });

      // Verify app launch was not called
      expect(fakeAdb.wasCommandExecuted("shell am start")).toBe(false);
    });

    it("should handle missing backup file gracefully", async () => {
      const snapshotName = "test-missing-backup";

      // Create manifest with backup metadata but no actual file
      const manifest: DeviceSnapshotManifest = {
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
          failedPackages: []
        }
      };


      // Should not throw, just skip restore
      const result = await restoreSnapshot.execute({
        snapshotName,
        manifest,
        useVmSnapshot: false
      });

      expect(result.snapshotType).toBe("adb");
      expect(fakeAdb.wasCommandExecuted("restore")).toBe(false);
    });

    it("should skip restore for empty backup file", async () => {
      const snapshotName = "test-empty-backup";

      // Create manifest with backup
      const manifest: DeviceSnapshotManifest = {
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
          failedPackages: []
        }
      };

      // Create empty backup file
      const appDataPath = store.getAppDataPath(snapshotName);
      await fs.mkdir(appDataPath, { recursive: true });
      const backupFilePath = store.getBackupFilePath(snapshotName);
      await fs.writeFile(backupFilePath, "", "utf-8"); // Empty file


      const result = await restoreSnapshot.execute({
        snapshotName,
        manifest,
        useVmSnapshot: false
      });

      expect(result.snapshotType).toBe("adb");
      expect(fakeAdb.wasCommandExecuted("restore")).toBe(false);
    });
  });

  describe("app data restore with timeout", () => {
    it("should restore successfully when user confirms within timeout", async () => {
      const snapshotName = "test-snapshot";

      // Create manifest with backup data
      const manifest: DeviceSnapshotManifest = {
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
      const appDataPath = store.getAppDataPath(snapshotName);
      await fs.mkdir(appDataPath, { recursive: true });
      const backupFilePath = store.getBackupFilePath(snapshotName);
      await fs.writeFile(backupFilePath, "backup data", "utf-8");


      // Setup restore command result
      fakeAdb.setCommandResult(`restore "${backupFilePath}"`, "");

      const result = await restoreSnapshot.execute({
        snapshotName,
        manifest,
        useVmSnapshot: false
      });

      expect(result.snapshotType).toBe("adb");
      expect(result.restoredAt).toBeDefined();

      // Verify restore command was called
      expect(fakeAdb.wasCommandExecuted(`restore "${backupFilePath}"`)).toBe(true);

      // Verify timer was used for timeout
      expect(fakeTimer.getPendingTimeoutCount()).toBe(0); // Should be cleared after completion
    });

    it.skip("should handle restore timeout gracefully", async () => {
      // Use manual time control for this test
      const manualTimer = new FakeTimer();
      restoreSnapshot = new RestoreSnapshot(device, fakeAdbFactory, undefined, manualTimer, store);

      const snapshotName = "test-snapshot-timeout";

      // Create manifest with backup data
      const manifest: DeviceSnapshotManifest = {
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
      const appDataPath = store.getAppDataPath(snapshotName);
      await fs.mkdir(appDataPath, { recursive: true });
      const backupFilePath = store.getBackupFilePath(snapshotName);
      await fs.writeFile(backupFilePath, "backup data", "utf-8");


      // Override executeCommand for restore to simulate delay
      const originalExecute = fakeAdb.executeCommand.bind(fakeAdb);
      fakeAdb.executeCommand = async (command: string) => {
        if (command.includes("restore")) {
          // Simulate restore taking a long time
          await manualTimer.sleep(40000); // Longer than default 30s timeout
          return { stdout: "", stderr: "" };
        }
        return originalExecute(command);
      };

      // Start restore in background
      const restorePromise = restoreSnapshot.execute({
        snapshotName,
        manifest,
        useVmSnapshot: false
      });

      // Wait for the sleep to be registered
      for (let i = 0; i < 50 && manualTimer.getPendingSleepCount() === 0; i += 1) {
        await Promise.resolve();
      }

      // Advance time to trigger timeout and complete the sleep
      manualTimer.advanceTime(50000);

      const result = await restorePromise;

      // Should complete even with timeout (restore is best-effort)
      expect(result.snapshotType).toBe("adb");
      expect(result.restoredAt).toBeDefined();
    });

    it("should skip restore if no backup file exists", async () => {
      const snapshotName = "test-no-backup";

      // Create manifest without backup data
      const manifest: DeviceSnapshotManifest = {
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
      const appDataPath = store.getAppDataPath(snapshotName);
      await fs.mkdir(appDataPath, { recursive: true });


      const result = await restoreSnapshot.execute({
        snapshotName,
        manifest,
        useVmSnapshot: false
      });

      expect(result.snapshotType).toBe("adb");

      // Verify restore command was not called
      expect(fakeAdb.wasCommandExecuted("restore")).toBe(false);
    });

    it("should clear app data before restore", async () => {
      const snapshotName = "test-clear";

      // Create manifest with packages
      const manifest: DeviceSnapshotManifest = {
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
      const appDataPath = store.getAppDataPath(snapshotName);
      await fs.mkdir(appDataPath, { recursive: true });
      const backupFilePath = store.getBackupFilePath(snapshotName);
      await fs.writeFile(backupFilePath, "backup data", "utf-8");


      // Setup clear commands
      fakeAdb.setCommandResult("shell pm clear com.example.app1", "Success");
      fakeAdb.setCommandResult("shell pm clear com.example.app2", "Success");
      fakeAdb.setCommandResult(`restore "${backupFilePath}"`, "");

      await restoreSnapshot.execute({
        snapshotName,
        manifest,
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
      const manifest: DeviceSnapshotManifest = {
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
      const appDataPath = store.getAppDataPath(snapshotName);
      await fs.mkdir(appDataPath, { recursive: true });
      const backupFilePath = store.getBackupFilePath(snapshotName);
      await fs.writeFile(backupFilePath, "backup data", "utf-8");


      fakeAdb.setCommandResult(`restore "${backupFilePath}"`, "");

      await restoreSnapshot.execute({
        snapshotName,
        manifest,
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
      const manifest: DeviceSnapshotManifest = {
        snapshotName,
        timestamp: new Date().toISOString(),
        deviceId: device.deviceId,
        deviceName: device.name,
        platform: "android",
        snapshotType: "vm",
        includeAppData: true,
        includeSettings: false
      };


      // Setup VM snapshot load command
      fakeAdb.setCommandResult(`emu avd snapshot load ${snapshotName}`, "OK");

      await restoreSnapshot.execute({
        snapshotName,
        manifest,
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
      const manifest: DeviceSnapshotManifest = {
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
      const appDataPath = store.getAppDataPath(snapshotName);
      await fs.mkdir(appDataPath, { recursive: true });
      const backupFilePath = store.getBackupFilePath(snapshotName);
      await fs.writeFile(backupFilePath, "backup data", "utf-8");


      fakeAdb.setCommandResult(`restore "${backupFilePath}"`, "");

      const startTime = Date.now();

      await restoreSnapshot.execute({
        snapshotName,
        manifest,
        useVmSnapshot: false
      });

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100);
    });
  });
});
