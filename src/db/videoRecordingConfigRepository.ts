import { ensureMigrations, getDatabase } from "./database";
import type { VideoRecordingConfig } from "../models";
import { logger } from "../utils/logger";

const CONFIG_KEY = "global";

export class VideoRecordingConfigRepository {
  async getConfig(): Promise<VideoRecordingConfig | null> {
    await ensureMigrations();
    const db = getDatabase();
    const row = await db
      .selectFrom("video_recording_configs")
      .select(["config_json"])
      .where("key", "=", CONFIG_KEY)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    try {
      return JSON.parse(row.config_json) as VideoRecordingConfig;
    } catch (error) {
      logger.warn(`[VideoRecordingConfigRepository] Failed to parse config JSON: ${error}`);
      return null;
    }
  }

  async setConfig(config: VideoRecordingConfig): Promise<void> {
    await ensureMigrations();
    const db = getDatabase();
    const now = new Date().toISOString();
    const existing = await db
      .selectFrom("video_recording_configs")
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
        .updateTable("video_recording_configs")
        .set(payload)
        .where("key", "=", CONFIG_KEY)
        .execute();
      return;
    }

    await db
      .insertInto("video_recording_configs")
      .values(payload)
      .execute();
  }

  async clearConfig(): Promise<void> {
    await ensureMigrations();
    const db = getDatabase();
    await db
      .deleteFrom("video_recording_configs")
      .where("key", "=", CONFIG_KEY)
      .execute();
  }
}
