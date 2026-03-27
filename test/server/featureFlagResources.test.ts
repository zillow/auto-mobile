import { describe, expect, test, beforeEach } from "bun:test";
import { ResourceRegistry } from "../../src/server/resourceRegistry";
import { registerFeatureFlagResources } from "../../src/server/featureFlagResources";
import { FeatureFlagService } from "../../src/features/featureFlags/FeatureFlagService";
import type { FeatureFlagRepository, FeatureFlagRecord } from "../../src/features/featureFlags/FeatureFlagRepository";
import type { FeatureFlagDefinition, FeatureFlagConfig } from "../../src/features/featureFlags/FeatureFlagDefinitions";
import type { FeatureFlagApplier } from "../../src/features/featureFlags/FeatureFlagApplier";

class FakeFeatureFlagRepository implements FeatureFlagRepository {
  private flags: FeatureFlagRecord[] = [];

  async ensureFlags(_definitions: FeatureFlagDefinition[]): Promise<void> {}

  async listFlags(): Promise<FeatureFlagRecord[]> {
    return this.flags;
  }

  async upsertFlag(key: string, enabled: boolean, config?: FeatureFlagConfig | null): Promise<void> {
    const existing = this.flags.find(f => f.key === key);
    if (existing) {
      existing.enabled = enabled;
      if (config !== undefined) {existing.config = config ?? undefined;}
    } else {
      this.flags.push({ key, enabled, config: config ?? undefined });
    }
  }
}

class NoOpApplier implements FeatureFlagApplier {
  apply(_key: string, _enabled: boolean, _config?: FeatureFlagConfig | null): void {}
}

describe("featureFlagResources", () => {
  beforeEach(() => {
    // Reset ResourceRegistry by re-registering
    registerFeatureFlagResources();
  });

  test("ai-recovery resource returns correct default config", async () => {
    const repo = new FakeFeatureFlagRepository();
    const service = new FeatureFlagService(repo, new NoOpApplier());
    // Patch the singleton for this test
    const original = FeatureFlagService.getInstance;
    FeatureFlagService.getInstance = () => service;

    try {
      const template = ResourceRegistry.matchTemplate("automobile:config/feature-flags/ai-recovery");
      expect(template).toBeDefined();

      const result = await template!.template.handler(template!.params);
      expect(result.uri).toBe("automobile:config/feature-flags/ai-recovery");
      expect(result.mimeType).toBe("application/json");

      const body = JSON.parse(result.text!);
      expect(body.key).toBe("ai-recovery");
      expect(body.enabled).toBe(true);
      expect(body.config).toEqual({ maxToolCalls: 5 });
    } finally {
      FeatureFlagService.getInstance = original;
    }
  });

  test("unknown key returns error", async () => {
    const repo = new FakeFeatureFlagRepository();
    const service = new FeatureFlagService(repo, new NoOpApplier());
    const original = FeatureFlagService.getInstance;
    FeatureFlagService.getInstance = () => service;

    try {
      const template = ResourceRegistry.matchTemplate("automobile:config/feature-flags/nonexistent");
      expect(template).toBeDefined();

      await expect(template!.template.handler(template!.params)).rejects.toThrow("Unknown feature flag: nonexistent");
    } finally {
      FeatureFlagService.getInstance = original;
    }
  });
});
