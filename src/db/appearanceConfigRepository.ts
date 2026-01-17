import { ensureMigrations, getDatabase } from "./database";
import type { AppearanceConfig } from "../models";
import { logger } from "../utils/logger";

const CONFIG_KEY = "global";

export class AppearanceConfigRepository {
  async getConfig(): Promise<AppearanceConfig | null> {
    await ensureMigrations();
    const db = getDatabase();
    const row = await db
      .selectFrom("appearance_configs")
      .select(["config_json"])
      .where("key", "=", CONFIG_KEY)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    try {
      return JSON.parse(row.config_json) as AppearanceConfig;
    } catch (error) {
      logger.warn(`[AppearanceConfigRepository] Failed to parse config JSON: ${error}`);
      return null;
    }
  }

  async setConfig(config: AppearanceConfig): Promise<void> {
    await ensureMigrations();
    const db = getDatabase();
    const now = new Date().toISOString();
    const existing = await db
      .selectFrom("appearance_configs")
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
        .updateTable("appearance_configs")
        .set(payload)
        .where("key", "=", CONFIG_KEY)
        .execute();
      return;
    }

    await db
      .insertInto("appearance_configs")
      .values(payload)
      .execute();
  }

  async clearConfig(): Promise<void> {
    await ensureMigrations();
    const db = getDatabase();
    await db
      .deleteFrom("appearance_configs")
      .where("key", "=", CONFIG_KEY)
      .execute();
  }
}
