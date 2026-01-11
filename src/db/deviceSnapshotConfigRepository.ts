import { ensureMigrations, getDatabase } from "./database";
import type { DeviceSnapshotConfig } from "../models";
import { logger } from "../utils/logger";

const CONFIG_KEY = "global";

export class DeviceSnapshotConfigRepository {
  async getConfig(): Promise<DeviceSnapshotConfig | null> {
    await ensureMigrations();
    const db = getDatabase();
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
    await ensureMigrations();
    const db = getDatabase();
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
    await ensureMigrations();
    const db = getDatabase();
    await db
      .deleteFrom("device_snapshot_configs")
      .where("key", "=", CONFIG_KEY)
      .execute();
  }
}
