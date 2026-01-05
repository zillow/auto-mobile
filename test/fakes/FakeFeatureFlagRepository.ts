import type { FeatureFlagConfig, FeatureFlagDefinition, FeatureFlagKey } from "../../src/features/featureFlags/FeatureFlagDefinitions";
import type { FeatureFlagRecord, FeatureFlagRepository } from "../../src/features/featureFlags/FeatureFlagRepository";

export class FakeFeatureFlagRepository implements FeatureFlagRepository {
  private readonly flags = new Map<FeatureFlagKey, FeatureFlagRecord>();

  async ensureFlags(definitions: FeatureFlagDefinition[]): Promise<void> {
    const now = new Date().toISOString();
    for (const definition of definitions) {
      if (!this.flags.has(definition.key)) {
        this.flags.set(definition.key, {
          key: definition.key,
          enabled: definition.defaultValue,
          config: definition.defaultConfig ?? null,
          updatedAt: now,
        });
      }
    }
  }

  async listFlags(): Promise<FeatureFlagRecord[]> {
    return Array.from(this.flags.values());
  }

  async upsertFlag(key: FeatureFlagKey, enabled: boolean, config?: FeatureFlagConfig | null): Promise<void> {
    this.flags.set(key, {
      key,
      enabled,
      config: config ?? this.flags.get(key)?.config ?? null,
      updatedAt: new Date().toISOString(),
    });
  }
}
