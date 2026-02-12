import { beforeEach, afterEach, describe, expect, test } from "bun:test";
import type { Kysely } from "kysely";
import type { Database } from "../../src/db/types";
import { VideoRecordingConfigRepository } from "../../src/db/videoRecordingConfigRepository";
import { createTestDatabase } from "./testDbHelper";

describe("VideoRecordingConfigRepository", () => {
  let db: Kysely<Database>;
  let repo: VideoRecordingConfigRepository;

  beforeEach(async () => {
    db = await createTestDatabase();
    repo = new VideoRecordingConfigRepository(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  test("getConfig returns null when no config exists", async () => {
    const config = await repo.getConfig();
    expect(config).toBeNull();
  });

  test("setConfig and getConfig round-trip", async () => {
    const config = { enabled: true, quality: "high" };
    await repo.setConfig(config as any);

    const result = await repo.getConfig();
    expect(result).toEqual(config);
  });

  test("setConfig updates existing config", async () => {
    await repo.setConfig({ enabled: true } as any);
    await repo.setConfig({ enabled: false } as any);

    const result = await repo.getConfig();
    expect(result).toEqual({ enabled: false });
  });

  test("clearConfig removes the config", async () => {
    await repo.setConfig({ enabled: true } as any);
    await repo.clearConfig();

    const result = await repo.getConfig();
    expect(result).toBeNull();
  });
});
