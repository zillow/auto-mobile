import type { AppearanceConfig, AppearanceConfigInput, AppearanceMode } from "../models";
import { AppearanceConfigRepository } from "../db/appearanceConfigRepository";
import { parseAppearanceConfig } from "../features/appearance";
import { serverConfig } from "../utils/ServerConfig";
import { detectHostAppearance } from "../utils/hostAppearance";

const configRepository = new AppearanceConfigRepository();

function mergeConfigInput(
  defaults: AppearanceConfigInput,
  overrides: AppearanceConfigInput
): AppearanceConfigInput {
  return {
    syncWithHost: overrides.syncWithHost ?? defaults.syncWithHost,
    defaultMode: overrides.defaultMode ?? defaults.defaultMode,
    applyOnConnect: overrides.applyOnConnect ?? defaults.applyOnConnect,
  };
}

function configToInput(config: AppearanceConfig): AppearanceConfigInput {
  return {
    syncWithHost: config.syncWithHost,
    defaultMode: config.defaultMode,
    applyOnConnect: config.applyOnConnect,
  };
}

export async function getAppearanceConfig(): Promise<AppearanceConfig> {
  const stored = await configRepository.getConfig();
  if (stored) {
    return parseAppearanceConfig(stored);
  }
  return parseAppearanceConfig(serverConfig.getAppearanceDefaults());
}

export async function updateAppearanceConfig(
  update: AppearanceConfigInput | null
): Promise<AppearanceConfig> {
  if (update === null) {
    await configRepository.clearConfig();
    const defaults = parseAppearanceConfig(serverConfig.getAppearanceDefaults());
    return defaults;
  }

  const current = await getAppearanceConfig();
  const mergedInput = mergeConfigInput(configToInput(current), update);
  const nextConfig = parseAppearanceConfig(mergedInput);
  await configRepository.setConfig(nextConfig);
  return nextConfig;
}

export async function resolveAppearanceMode(
  config?: AppearanceConfig
): Promise<AppearanceMode> {
  const resolvedConfig = config ?? await getAppearanceConfig();
  if (resolvedConfig.syncWithHost || resolvedConfig.defaultMode === "auto") {
    return detectHostAppearance();
  }

  return resolvedConfig.defaultMode === "dark" ? "dark" : "light";
}
