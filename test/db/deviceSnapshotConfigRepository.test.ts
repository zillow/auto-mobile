import { beforeEach, afterEach, describe, expect, test } from "bun:test";
import type { Kysely } from "kysely";
import type { Database } from "../../src/db/types";
import { DeviceSnapshotConfigRepository } from "../../src/db/deviceSnapshotConfigRepository";
import { createTestDatabase } from "./testDbHelper";

describe("DeviceSnapshotConfigRepository", () => {
  let db: Kysely<Database>;
  let repo: DeviceSnapshotConfigRepository;

  beforeEach(async () => {
    db = await createTestDatabase();
    repo = new DeviceSnapshotConfigRepository(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  test("getConfig returns null when no config exists", async () => {
    const config = await repo.getConfig();
    expect(config).toBeNull();
  });

  test("setConfig and getConfig round-trip", async () => {
    const config = { autoCapture: true, interval: 5000 };
    await repo.setConfig(config as any);

    const result = await repo.getConfig();
    expect(result).toEqual(config);
  });

  test("setConfig updates existing config", async () => {
    await repo.setConfig({ autoCapture: true } as any);
    await repo.setConfig({ autoCapture: false } as any);

    const result = await repo.getConfig();
    expect(result).toEqual({ autoCapture: false });
  });

  test("clearConfig removes the config", async () => {
    await repo.setConfig({ autoCapture: true } as any);
    await repo.clearConfig();

    const result = await repo.getConfig();
    expect(result).toBeNull();
  });
});
