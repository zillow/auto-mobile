import { beforeEach, afterEach, describe, expect, test } from "bun:test";
import type { Kysely } from "kysely";
import type { Database } from "../../src/db/types";
import { AppearanceConfigRepository } from "../../src/db/appearanceConfigRepository";
import { createTestDatabase } from "./testDbHelper";

describe("AppearanceConfigRepository", () => {
  let db: Kysely<Database>;
  let repo: AppearanceConfigRepository;

  beforeEach(async () => {
    db = await createTestDatabase();
    repo = new AppearanceConfigRepository(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  test("getConfig returns null when no config exists", async () => {
    const config = await repo.getConfig();
    expect(config).toBeNull();
  });

  test("setConfig and getConfig round-trip", async () => {
    const config = { theme: "dark", fontSize: 14 };
    await repo.setConfig(config as any);

    const result = await repo.getConfig();
    expect(result).toEqual(config);
  });

  test("setConfig updates existing config", async () => {
    await repo.setConfig({ theme: "light" } as any);
    await repo.setConfig({ theme: "dark" } as any);

    const result = await repo.getConfig();
    expect(result).toEqual({ theme: "dark" });
  });

  test("clearConfig removes the config", async () => {
    await repo.setConfig({ theme: "dark" } as any);
    await repo.clearConfig();

    const result = await repo.getConfig();
    expect(result).toBeNull();
  });

  test("clearConfig is safe when no config exists", async () => {
    await repo.clearConfig();
    const result = await repo.getConfig();
    expect(result).toBeNull();
  });
});
