import type { FeatureFlagApplier } from "../../src/features/featureFlags/FeatureFlagApplier";
import type { FeatureFlagConfig, FeatureFlagKey } from "../../src/features/featureFlags/FeatureFlagDefinitions";

export class FakeFeatureFlagApplier implements FeatureFlagApplier {
  readonly applied: Array<{ key: FeatureFlagKey; enabled: boolean; config?: FeatureFlagConfig | null }> = [];

  apply(key: FeatureFlagKey, enabled: boolean, config?: FeatureFlagConfig | null): void {
    this.applied.push({ key, enabled, config });
  }
}
