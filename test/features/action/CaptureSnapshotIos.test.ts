import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import { CaptureSnapshotIos } from "../../../src/features/action/CaptureSnapshotIos";
import type { BootedDevice } from "../../../src/models";
import { DeviceSnapshotStore } from "../../../src/utils/DeviceSnapshotStore";
import { FakeSimCtlClient } from "../../fakes/FakeSimCtlClient";

describe("CaptureSnapshotIos", () => {
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
    testBasePath = await fs.mkdtemp(path.join(os.tmpdir(), "snapshot-ios-capture-"));
    store = new DeviceSnapshotStore(testBasePath);
  });

  afterEach(async () => {
    try {
      await fs.rm(testBasePath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("captures app data and writes metadata", async () => {
    const snapshotName = "ios-snapshot";
    const bundleId = "com.example.app";
    const containerRoot = path.join(testBasePath, "containers", bundleId);
    const documentsPath = path.join(containerRoot, "Documents");
    await fs.mkdir(documentsPath, { recursive: true });
    await fs.writeFile(path.join(documentsPath, "data.txt"), "hello");

    simctl.setContainerPath(bundleId, containerRoot);
    simctl.setDeviceInfo(device.deviceId, {
      udid: device.deviceId,
      name: "iPhone 15",
      state: "Booted",
      isAvailable: true,
      deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-15",
      os_version: "17.2",
    });

    const captureSnapshot = new CaptureSnapshotIos(
      device,
      simctl as any,
      store
    );

    const result = await captureSnapshot.execute({
      snapshotName,
      includeAppData: true,
      includeSettings: true,
      appBundleIds: [bundleId, "com.apple.Preferences", ` ${bundleId} `],
    });

    const pathOptions = { platform: "ios", deviceId: device.deviceId } as const;
    const metadataPath = store.getMetadataPath(snapshotName, pathOptions);
    const metadataJson = await fs.readFile(metadataPath, "utf-8");
    const parsed = JSON.parse(metadataJson) as typeof result.manifest;

    expect(result.manifest.includeSettings).toBe(false);
    expect(result.manifest.deviceType).toBe("com.apple.CoreSimulator.SimDeviceType.iPhone-15");
    expect(result.manifest.osVersion).toBe("17.2");
    expect(parsed.snapshotName).toBe(snapshotName);
    expect(parsed.platform).toBe("ios");
    expect(parsed.appDataBackup?.backedUpPackages).toEqual([bundleId]);
    expect(parsed.appDataBackup?.skippedPackages).toEqual(["com.apple.Preferences"]);
    expect(parsed.appDataBackup?.totalPackages).toBe(2);

    const appDataPath = store.getAppDataPath(snapshotName, pathOptions);
    const copiedFile = await fs.readFile(
      path.join(appDataPath, bundleId, "Documents", "data.txt"),
      "utf-8"
    );
    expect(copiedFile).toBe("hello");
  });

  it("fails when strictBackupMode is enabled and app data backup fails", async () => {
    const captureSnapshot = new CaptureSnapshotIos(
      device,
      simctl as any,
      store
    );

    await expect(captureSnapshot.execute({
      snapshotName: "strict-backup",
      includeAppData: true,
      strictBackupMode: true,
      appBundleIds: ["com.example.missing"],
    })).rejects.toThrow("Failed to backup app data");
  });

  it("marks backup as none when no bundle IDs are provided", async () => {
    const captureSnapshot = new CaptureSnapshotIos(
      device,
      simctl as any,
      store
    );

    const result = await captureSnapshot.execute({
      snapshotName: "no-bundles",
      includeAppData: true,
      appBundleIds: [],
    });

    expect(result.manifest.appDataBackup?.backupMethod).toBe("none");
    expect(result.manifest.appDataBackup?.totalPackages).toBe(0);
  });
});
