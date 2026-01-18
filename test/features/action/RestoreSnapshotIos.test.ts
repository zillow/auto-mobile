import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import { RestoreSnapshotIos } from "../../../src/features/action/RestoreSnapshotIos";
import type { BootedDevice, DeviceSnapshotManifest } from "../../../src/models";
import { DeviceSnapshotStore } from "../../../src/utils/DeviceSnapshotStore";
import { FakeSimCtlClient } from "../../fakes/FakeSimCtlClient";

describe("RestoreSnapshotIos", () => {
  let device: BootedDevice;
  let simctl: FakeSimCtlClient;
  let store: DeviceSnapshotStore;
  let testBasePath: string;

  beforeEach(async () => {
    device = {
      deviceId: "ios-device-1",
      name: "iPhone 15",
      platform: "ios",
    };

    simctl = new FakeSimCtlClient();
    testBasePath = await fs.mkdtemp(path.join(os.tmpdir(), "snapshot-ios-restore-"));
    store = new DeviceSnapshotStore(testBasePath);
  });

  afterEach(async () => {
    try {
      await fs.rm(testBasePath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("restores app data using fallback device path", async () => {
    const snapshotName = "restore-snapshot";
    const bundleId = "com.example.app";
    const appDataPath = store.getAppDataPath(snapshotName, {
      platform: "ios",
      deviceId: device.deviceId,
    });
    await fs.mkdir(path.join(appDataPath, bundleId, "Documents"), { recursive: true });
    await fs.writeFile(path.join(appDataPath, bundleId, "Documents", "data.txt"), "new-data");

    const containerRoot = path.join(testBasePath, "containers", bundleId);
    await fs.mkdir(path.join(containerRoot, "Documents"), { recursive: true });
    await fs.writeFile(path.join(containerRoot, "Documents", "data.txt"), "old-data");

    simctl.setContainerPath(bundleId, containerRoot);
    simctl.setInstalledApps([{ bundleId }]);

    const manifest: DeviceSnapshotManifest = {
      snapshotName,
      timestamp: new Date().toISOString(),
      deviceId: "other-device",
      deviceName: device.name,
      platform: "ios",
      snapshotType: "app_data",
      includeAppData: true,
      includeSettings: false,
      appDataBackup: {
        backupMethod: "simctl_copy",
        backedUpPackages: [bundleId],
      },
    };

    const restoreSnapshot = new RestoreSnapshotIos(
      device,
      simctl as any,
      store
    );

    await restoreSnapshot.execute({
      snapshotName,
      manifest,
      useVmSnapshot: false,
    });

    const restored = await fs.readFile(
      path.join(containerRoot, "Documents", "data.txt"),
      "utf-8"
    );
    expect(restored).toBe("new-data");
    expect(simctl.getMethodCalls("terminateApp")).toHaveLength(1);
  });

  it("throws when required app is not installed", async () => {
    const snapshotName = "missing-app";
    const appDataPath = store.getAppDataPath(snapshotName, {
      platform: "ios",
      deviceId: device.deviceId,
    });
    await fs.mkdir(appDataPath, { recursive: true });
    simctl.setInstalledApps([{ bundleId: "com.example.other" }]);

    const restoreSnapshot = new RestoreSnapshotIos(
      device,
      simctl as any,
      store
    );

    const manifest: DeviceSnapshotManifest = {
      snapshotName,
      timestamp: new Date().toISOString(),
      deviceId: device.deviceId,
      deviceName: device.name,
      platform: "ios",
      snapshotType: "app_data",
      includeAppData: true,
      includeSettings: false,
      appDataBackup: {
        backupMethod: "simctl_copy",
        backedUpPackages: ["com.example.missing"],
      },
    };

    await expect(restoreSnapshot.execute({
      snapshotName,
      manifest,
      useVmSnapshot: false,
    })).rejects.toThrow("App(s) not installed");
  });

  it("throws on major iOS version mismatch", async () => {
    const restoreSnapshot = new RestoreSnapshotIos(
      device,
      simctl as any,
      store
    );

    simctl.setDeviceInfo(device.deviceId, {
      udid: device.deviceId,
      name: device.name,
      state: "Booted",
      isAvailable: true,
      runtime: "com.apple.CoreSimulator.SimRuntime.iOS-17-0",
    });
    simctl.setRuntimes([{
      bundlePath: "/runtime",
      buildversion: "A123",
      runtimeRoot: "/runtime/root",
      identifier: "com.apple.CoreSimulator.SimRuntime.iOS-17-0",
      version: "17.0",
      isAvailable: true,
      name: "iOS 17.0",
    }]);

    const manifest: DeviceSnapshotManifest = {
      snapshotName: "version-mismatch",
      timestamp: new Date().toISOString(),
      deviceId: device.deviceId,
      deviceName: device.name,
      platform: "ios",
      snapshotType: "app_data",
      includeAppData: true,
      includeSettings: false,
      osVersion: "iOS 16.4",
      appDataBackup: {
        backupMethod: "simctl_copy",
        backedUpPackages: ["com.example.app"],
      },
    };

    await expect(restoreSnapshot.execute({
      snapshotName: "version-mismatch",
      manifest,
      useVmSnapshot: false,
    })).rejects.toThrow("incompatible");
  });

  it("skips restore when backup method is none", async () => {
    const snapshotName = "no-backup";
    const appDataPath = store.getAppDataPath(snapshotName, {
      platform: "ios",
      deviceId: device.deviceId,
    });
    await fs.mkdir(appDataPath, { recursive: true });

    const restoreSnapshot = new RestoreSnapshotIos(
      device,
      simctl as any,
      store
    );

    const manifest: DeviceSnapshotManifest = {
      snapshotName,
      timestamp: new Date().toISOString(),
      deviceId: device.deviceId,
      deviceName: device.name,
      platform: "ios",
      snapshotType: "app_data",
      includeAppData: true,
      includeSettings: false,
      appDataBackup: {
        backupMethod: "none",
      },
    };

    await restoreSnapshot.execute({
      snapshotName,
      manifest,
      useVmSnapshot: false,
    });

    expect(simctl.getMethodCalls("executeCommand")).toHaveLength(0);
    expect(simctl.getMethodCalls("terminateApp")).toHaveLength(0);
  });
});
