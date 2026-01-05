import { ensureMigrations, getDatabase } from "../../db/database";
import type { FeatureFlagConfig, FeatureFlagDefinition, FeatureFlagKey } from "./FeatureFlagDefinitions";

export interface FeatureFlagRecord {
  key: FeatureFlagKey;
  enabled: boolean;
  config: FeatureFlagConfig | null;
  updatedAt: string;
}

export interface FeatureFlagRepository {
  ensureFlags(definitions: FeatureFlagDefinition[]): Promise<void>;
  listFlags(): Promise<FeatureFlagRecord[]>;
  upsertFlag(key: FeatureFlagKey, enabled: boolean, config?: FeatureFlagConfig | null): Promise<void>;
}

export class SqliteFeatureFlagRepository implements FeatureFlagRepository {
  async ensureFlags(definitions: FeatureFlagDefinition[]): Promise<void> {
    await ensureMigrations();
    const db = getDatabase();
    const existing = await db
      .selectFrom("feature_flags")
      .select(["key"])
      .execute();

    const existingKeys = new Set(existing.map(row => row.key));
    const now = new Date().toISOString();
    const missing = definitions.filter(definition => !existingKeys.has(definition.key));

    if (missing.length === 0) {
      return;
    }

    await db
      .insertInto("feature_flags")
      .values(
        missing.map(definition => ({
          key: definition.key,
          enabled: definition.defaultValue ? 1 : 0,
          config_json: definition.defaultConfig ? JSON.stringify(definition.defaultConfig) : null,
          updated_at: now,
        }))
      )
      .execute();
  }

  async listFlags(): Promise<FeatureFlagRecord[]> {
    await ensureMigrations();
    const db = getDatabase();
    const rows = await db
      .selectFrom("feature_flags")
      .select(["key", "enabled", "config_json", "updated_at"])
      .execute();

    return rows.map(row => ({
      key: row.key as FeatureFlagKey,
      enabled: row.enabled === 1,
      config: row.config_json ? JSON.parse(row.config_json) : null,
      updatedAt: row.updated_at,
    }));
  }

  async upsertFlag(key: FeatureFlagKey, enabled: boolean, config?: FeatureFlagConfig | null): Promise<void> {
    await ensureMigrations();
    const db = getDatabase();
    const now = new Date().toISOString();
    const existing = await db
      .selectFrom("feature_flags")
      .select(["key"])
      .where("key", "=", key)
      .executeTakeFirst();

    if (existing) {
      const updatePayload: Record<string, unknown> = {
        enabled: enabled ? 1 : 0,
        updated_at: now,
      };
      if (config !== undefined) {
        updatePayload.config_json = config ? JSON.stringify(config) : null;
      }
      await db
        .updateTable("feature_flags")
        .set(updatePayload)
        .where("key", "=", key)
        .execute();
      return;
    }

    await db
      .insertInto("feature_flags")
      .values({
        key,
        enabled: enabled ? 1 : 0,
        config_json: config ? JSON.stringify(config) : null,
        updated_at: now,
      })
      .execute();
  }
}
