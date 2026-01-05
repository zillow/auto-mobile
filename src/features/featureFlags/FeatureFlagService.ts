import type { FeatureFlagConfig, FeatureFlagDefinition, FeatureFlagKey } from "./FeatureFlagDefinitions";
import { FEATURE_FLAG_DEFINITIONS } from "./FeatureFlagDefinitions";
import type { FeatureFlagRepository } from "./FeatureFlagRepository";
import { SqliteFeatureFlagRepository } from "./FeatureFlagRepository";
import type { FeatureFlagApplier } from "./FeatureFlagApplier";
import { DefaultFeatureFlagApplier } from "./FeatureFlagApplier";

export interface FeatureFlagState {
  key: FeatureFlagKey;
  label: string;
  description: string;
  enabled: boolean;
  config?: FeatureFlagConfig | null;
}

export class FeatureFlagService {
  private static instance: FeatureFlagService | null = null;
  private readonly definitionByKey: Map<FeatureFlagKey, FeatureFlagDefinition>;
  private initialized = false;
  private flagsByKey = new Map<FeatureFlagKey, boolean>();
  private configsByKey = new Map<FeatureFlagKey, FeatureFlagConfig | null>();

  static getInstance(): FeatureFlagService {
    if (!FeatureFlagService.instance) {
      FeatureFlagService.instance = new FeatureFlagService(
        new SqliteFeatureFlagRepository(),
        new DefaultFeatureFlagApplier()
      );
    }
    return FeatureFlagService.instance;
  }

  constructor(
    private readonly repository: FeatureFlagRepository,
    private readonly applier: FeatureFlagApplier,
    private readonly definitions: FeatureFlagDefinition[] = FEATURE_FLAG_DEFINITIONS
  ) {
    this.definitionByKey = new Map(
      definitions.map(definition => [definition.key, definition])
    );
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.repository.ensureFlags(this.definitions);
    const records = await this.repository.listFlags();
    const recordByKey = new Map(records.map(record => [record.key, record]));

    for (const definition of this.definitions) {
      const record = recordByKey.get(definition.key);
      const enabled = record ? record.enabled : definition.defaultValue;
      const config =
        record?.config ??
        definition.defaultConfig ??
        null;
      this.flagsByKey.set(definition.key, enabled);
      this.configsByKey.set(definition.key, config);
      this.applier.apply(definition.key, enabled, config);
    }

    this.initialized = true;
  }

  async listFlags(): Promise<FeatureFlagState[]> {
    await this.initialize();
    return this.definitions.map(definition => ({
      key: definition.key,
      label: definition.label,
      description: definition.description,
      enabled: this.flagsByKey.get(definition.key) ?? definition.defaultValue,
      config: this.configsByKey.get(definition.key) ?? definition.defaultConfig ?? null,
    }));
  }

  async setFlag(key: FeatureFlagKey, enabled: boolean, config?: FeatureFlagConfig | null): Promise<FeatureFlagState> {
    await this.initialize();
    const definition = this.definitionByKey.get(key);
    if (!definition) {
      throw new Error(`Unknown feature flag: ${key}`);
    }

    const nextConfig =
      config !== undefined
        ? config
        : this.configsByKey.get(key) ?? definition.defaultConfig ?? null;

    await this.repository.upsertFlag(key, enabled, config);
    this.flagsByKey.set(key, enabled);
    if (config !== undefined) {
      this.configsByKey.set(key, nextConfig);
    }
    this.applier.apply(key, enabled, nextConfig);

    return {
      key: definition.key,
      label: definition.label,
      description: definition.description,
      enabled,
      config: nextConfig,
    };
  }

  async setFlagConfig(key: FeatureFlagKey, config: FeatureFlagConfig | null): Promise<FeatureFlagState> {
    await this.initialize();
    const definition = this.definitionByKey.get(key);
    if (!definition) {
      throw new Error(`Unknown feature flag: ${key}`);
    }

    const enabled = this.flagsByKey.get(key) ?? definition.defaultValue;
    await this.repository.upsertFlag(key, enabled, config);
    this.configsByKey.set(key, config);
    this.applier.apply(key, enabled, config);

    return {
      key: definition.key,
      label: definition.label,
      description: definition.description,
      enabled,
      config,
    };
  }
}
