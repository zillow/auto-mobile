import { ResourceRegistry } from "./resourceRegistry";
import { FeatureFlagService } from "../features/featureFlags/FeatureFlagService";
import type { FeatureFlagKey } from "../features/featureFlags/FeatureFlagDefinitions";
import { FEATURE_FLAG_DEFINITIONS } from "../features/featureFlags/FeatureFlagDefinitions";

const TEMPLATE_URI = "automobile:config/feature-flags/{key}";

export function registerFeatureFlagResources(): void {
  const validKeys = new Set(FEATURE_FLAG_DEFINITIONS.map(d => d.key));

  ResourceRegistry.registerTemplate(
    TEMPLATE_URI,
    "Feature flag configuration",
    "Read feature flag state and configuration by key",
    "application/json",
    async (params: Record<string, string>) => {
      const key = params.key;
      if (!key || !validKeys.has(key as FeatureFlagKey)) {
        throw new Error(`Unknown feature flag: ${key}`);
      }

      const service = FeatureFlagService.getInstance();
      const flags = await service.listFlags();
      const flag = flags.find(f => f.key === key);

      if (!flag) {
        throw new Error(`Feature flag not found: ${key}`);
      }

      const body = {
        key: flag.key,
        enabled: flag.enabled,
        config: flag.config ?? null,
      };

      return {
        uri: `automobile:config/feature-flags/${key}`,
        mimeType: "application/json",
        text: JSON.stringify(body),
      };
    }
  );
}
