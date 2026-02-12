import type { Kysely } from "kysely";
import { ensureMigrations, getDatabase } from "./database";
import type { DeviceSnapshotConfig } from "../models";
import type { Database } from "./types";
import { logger } from "../utils/logger";

const CONFIG_KEY = "global";

export class DeviceSnapshotConfigRepository {
  private db: Kysely<Database> | null;

  constructor(db?: Kysely<Database>) {
    this.db = db ?? null;
  }

  private async getDb(): Promise<Kysely<Database>> {
    if (this.db) {
      return this.db;
    }
    await ensureMigrations();
    return getDatabase();
  }

  async getConfig(): Promise<DeviceSnapshotConfig | null> {
    const db = await this.getDb();
    const row = await db
      .selectFrom("device_snapshot_configs")
      .select(["config_json"])
      .where("key", "=", CONFIG_KEY)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    try {
      return JSON.parse(row.config_json) as DeviceSnapshotConfig;
    } catch (error) {
      logger.warn(`[DeviceSnapshotConfigRepository] Failed to parse config JSON: ${error}`);
      return null;
    }
  }

  async setConfig(config: DeviceSnapshotConfig): Promise<void> {
    const db = await this.getDb();
    const now = new Date().toISOString();
    const existing = await db
      .selectFrom("device_snapshot_configs")
      .select(["key"])
      .where("key", "=", CONFIG_KEY)
      .executeTakeFirst();

    const payload = {
      key: CONFIG_KEY,
      config_json: JSON.stringify(config),
      updated_at: now,
    };

    if (existing) {
      await db
        .updateTable("device_snapshot_configs")
        .set(payload)
        .where("key", "=", CONFIG_KEY)
        .execute();
      return;
    }

    await db
      .insertInto("device_snapshot_configs")
      .values(payload)
      .execute();
  }

  async clearConfig(): Promise<void> {
    const db = await this.getDb();
    await db
      .deleteFrom("device_snapshot_configs")
      .where("key", "=", CONFIG_KEY)
      .execute();
  }
}
