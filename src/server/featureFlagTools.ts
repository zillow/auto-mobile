import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { ActionableError } from "../models/ActionableError";
import { createJSONToolResponse } from "../utils/toolUtils";
import { FeatureFlagService } from "../features/featureFlags/FeatureFlagService";
import { FEATURE_FLAG_DEFINITIONS, type FeatureFlagKey } from "../features/featureFlags/FeatureFlagDefinitions";

const featureFlagKeys = FEATURE_FLAG_DEFINITIONS.map(definition => definition.key) as [
  FeatureFlagKey,
  ...FeatureFlagKey[],
];

export const listFeatureFlagsSchema = z.object({});

export const setFeatureFlagSchema = z.object({
  key: z.enum(featureFlagKeys).describe("Feature flag key"),
  enabled: z.boolean().describe("Enable or disable the flag"),
  config: z.record(z.any()).optional().describe("Optional flag configuration"),
});

export function registerFeatureFlagTools(): void {
  const service = FeatureFlagService.getInstance();

  ToolRegistry.register(
    "listFeatureFlags",
    "List AutoMobile feature flags and their current states.",
    listFeatureFlagsSchema,
    async () => {
      try {
        const flags = await service.listFlags();
        return createJSONToolResponse({ flags });
      } catch (error) {
        throw new ActionableError(`Failed to list feature flags: ${error}`);
      }
    }
  );

  ToolRegistry.register(
    "setFeatureFlag",
    "Enable or disable a feature flag.",
    setFeatureFlagSchema,
    async args => {
      const key = args.key as FeatureFlagKey;
      try {
        const flag = await service.setFlag(key, args.enabled, args.config);
        return createJSONToolResponse(flag);
      } catch (error) {
        throw new ActionableError(`Failed to update feature flag: ${error}`);
      }
    }
  );
}
