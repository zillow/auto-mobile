import { beforeEach, afterEach, describe, expect, test } from "bun:test";
import type { Kysely } from "kysely";
import type { Database } from "../../src/db/types";
import { DeviceSnapshotRepository } from "../../src/db/deviceSnapshotRepository";
import type { DeviceSnapshotRecord } from "../../src/db/deviceSnapshotRepository";
import { createTestDatabase } from "./testDbHelper";
import type { DeviceSnapshotManifest } from "../../src/models";

function makeManifest(overrides: Partial<DeviceSnapshotManifest> = {}): DeviceSnapshotManifest {
  return {
    snapshotName: "snap-1",
    timestamp: "2024-01-01T00:00:00.000Z",
    deviceId: "emulator-5554",
    deviceName: "Pixel_6",
    platform: "android",
    snapshotType: "vm",
    includeAppData: false,
    includeSettings: false,
    ...overrides,
  };
}

function makeRecord(overrides: Partial<DeviceSnapshotRecord> = {}): DeviceSnapshotRecord {
  const snapshotName = overrides.snapshotName ?? "snap-1";
  return {
    snapshotName,
    deviceId: "emulator-5554",
    deviceName: "Pixel_6",
    platform: "android",
    snapshotType: "vm",
    includeAppData: false,
    includeSettings: false,
    createdAt: "2024-01-01T00:00:00.000Z",
    lastAccessedAt: "2024-01-01T00:00:00.000Z",
    sizeBytes: 1024,
    manifest: makeManifest({ snapshotName }),
    ...overrides,
  };
}

describe("DeviceSnapshotRepository", () => {
  let db: Kysely<Database>;
  let repo: DeviceSnapshotRepository;

  beforeEach(async () => {
    db = await createTestDatabase();
    repo = new DeviceSnapshotRepository(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  test("insertSnapshot and getSnapshot round-trip", async () => {
    const record = makeRecord();
    await repo.insertSnapshot(record);

    const result = await repo.getSnapshot("snap-1");
    expect(result).not.toBeNull();
    expect(result!.snapshotName).toBe("snap-1");
    expect(result!.deviceId).toBe("emulator-5554");
    expect(result!.deviceName).toBe("Pixel_6");
    expect(result!.platform).toBe("android");
    expect(result!.snapshotType).toBe("vm");
    expect(result!.includeAppData).toBe(false);
    expect(result!.includeSettings).toBe(false);
    expect(result!.sizeBytes).toBe(1024);
    expect(result!.manifest.snapshotName).toBe("snap-1");
  });

  test("getSnapshot returns null for unknown snapshot", async () => {
    const result = await repo.getSnapshot("nonexistent");
    expect(result).toBeNull();
  });

  test("listSnapshots returns all snapshots", async () => {
    await repo.insertSnapshot(makeRecord({ snapshotName: "snap-1" }));
    await repo.insertSnapshot(makeRecord({ snapshotName: "snap-2" }));

    const results = await repo.listSnapshots();
    expect(results).toHaveLength(2);
  });

  test("listSnapshots filters by deviceId", async () => {
    await repo.insertSnapshot(makeRecord({ snapshotName: "snap-1", deviceId: "device-A" }));
    await repo.insertSnapshot(makeRecord({ snapshotName: "snap-2", deviceId: "device-B" }));

    const results = await repo.listSnapshots({ deviceId: "device-A" });
    expect(results).toHaveLength(1);
    expect(results[0].deviceId).toBe("device-A");
  });

  test("listSnapshots filters by platform", async () => {
    await repo.insertSnapshot(makeRecord({ snapshotName: "snap-1", platform: "android" }));
    await repo.insertSnapshot(makeRecord({ snapshotName: "snap-2", platform: "ios" }));

    const results = await repo.listSnapshots({ platform: "ios" });
    expect(results).toHaveLength(1);
    expect(results[0].platform).toBe("ios");
  });

  test("listSnapshots filters by snapshotType", async () => {
    await repo.insertSnapshot(makeRecord({ snapshotName: "snap-1", snapshotType: "vm" }));
    await repo.insertSnapshot(makeRecord({ snapshotName: "snap-2", snapshotType: "adb" }));

    const results = await repo.listSnapshots({ snapshotType: "adb" });
    expect(results).toHaveLength(1);
    expect(results[0].snapshotType).toBe("adb");
  });

  test("listSnapshots orders by lastAccessedAt", async () => {
    await repo.insertSnapshot(
      makeRecord({ snapshotName: "snap-old", lastAccessedAt: "2024-01-01T00:00:00.000Z" })
    );
    await repo.insertSnapshot(
      makeRecord({ snapshotName: "snap-new", lastAccessedAt: "2024-06-01T00:00:00.000Z" })
    );

    const descResults = await repo.listSnapshots({ orderByLastAccessed: "desc" });
    expect(descResults[0].snapshotName).toBe("snap-new");

    const ascResults = await repo.listSnapshots({ orderByLastAccessed: "asc" });
    expect(ascResults[0].snapshotName).toBe("snap-old");
  });

  test("listSnapshots orders by createdAt", async () => {
    await repo.insertSnapshot(
      makeRecord({ snapshotName: "snap-old", createdAt: "2024-01-01T00:00:00.000Z" })
    );
    await repo.insertSnapshot(
      makeRecord({ snapshotName: "snap-new", createdAt: "2024-06-01T00:00:00.000Z" })
    );

    const descResults = await repo.listSnapshots({ orderByCreatedAt: "desc" });
    expect(descResults[0].snapshotName).toBe("snap-new");
  });

  test("listSnapshots respects limit", async () => {
    await repo.insertSnapshot(makeRecord({ snapshotName: "snap-1" }));
    await repo.insertSnapshot(makeRecord({ snapshotName: "snap-2" }));
    await repo.insertSnapshot(makeRecord({ snapshotName: "snap-3" }));

    const results = await repo.listSnapshots({ limit: 2 });
    expect(results).toHaveLength(2);
  });

  test("updateSnapshot modifies fields", async () => {
    await repo.insertSnapshot(makeRecord());

    await repo.updateSnapshot("snap-1", {
      deviceName: "Pixel_7",
      sizeBytes: 2048,
    });

    const result = await repo.getSnapshot("snap-1");
    expect(result!.deviceName).toBe("Pixel_7");
    expect(result!.sizeBytes).toBe(2048);
  });

  test("updateSnapshot with empty update is a no-op", async () => {
    await repo.insertSnapshot(makeRecord());
    await repo.updateSnapshot("snap-1", {});

    const result = await repo.getSnapshot("snap-1");
    expect(result!.snapshotName).toBe("snap-1");
  });

  test("touchSnapshot updates lastAccessedAt", async () => {
    await repo.insertSnapshot(makeRecord());

    await repo.touchSnapshot("snap-1", "2025-01-01T00:00:00.000Z");

    const result = await repo.getSnapshot("snap-1");
    expect(result!.lastAccessedAt).toBe("2025-01-01T00:00:00.000Z");
  });

  test("deleteSnapshot removes the snapshot and returns true", async () => {
    await repo.insertSnapshot(makeRecord());

    const deleted = await repo.deleteSnapshot("snap-1");
    expect(deleted).toBe(true);

    const result = await repo.getSnapshot("snap-1");
    expect(result).toBeNull();
  });

  test("deleteSnapshot returns false for nonexistent snapshot", async () => {
    const deleted = await repo.deleteSnapshot("nonexistent");
    expect(deleted).toBe(false);
  });

  test("updateSnapshot can update manifest", async () => {
    await repo.insertSnapshot(makeRecord());

    const updatedManifest = makeManifest({ osVersion: "14" });
    await repo.updateSnapshot("snap-1", { manifest: updatedManifest });

    const result = await repo.getSnapshot("snap-1");
    expect(result!.manifest.osVersion).toBe("14");
  });

  test("updateSnapshot can update boolean fields", async () => {
    await repo.insertSnapshot(makeRecord({ includeAppData: false, includeSettings: false }));

    await repo.updateSnapshot("snap-1", { includeAppData: true, includeSettings: true });

    const result = await repo.getSnapshot("snap-1");
    expect(result!.includeAppData).toBe(true);
    expect(result!.includeSettings).toBe(true);
  });
});
