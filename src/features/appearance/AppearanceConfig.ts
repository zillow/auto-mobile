import type { AppearanceConfig, AppearanceConfigInput, AppearanceSyncMode } from "../../models";

export const DEFAULT_APPEARANCE_CONFIG: AppearanceConfig = {
  syncWithHost: true,
  defaultMode: "auto",
  applyOnConnect: true,
};

const APPEARANCE_MODES = new Set<AppearanceSyncMode>(["light", "dark", "auto"]);

export function parseAppearanceConfig(
  input?: AppearanceConfigInput | null
): AppearanceConfig {
  const safeInput: AppearanceConfigInput =
    input && typeof input === "object" ? input : {};

  const defaultMode = parseAppearanceMode(safeInput.defaultMode);
  const syncWithHost = typeof safeInput.syncWithHost === "boolean"
    ? safeInput.syncWithHost
    : DEFAULT_APPEARANCE_CONFIG.syncWithHost;
  const applyOnConnect = typeof safeInput.applyOnConnect === "boolean"
    ? safeInput.applyOnConnect
    : DEFAULT_APPEARANCE_CONFIG.applyOnConnect;

  return {
    syncWithHost,
    defaultMode,
    applyOnConnect,
  };
}

function parseAppearanceMode(mode?: AppearanceSyncMode | string): AppearanceSyncMode {
  if (!mode) {
    return DEFAULT_APPEARANCE_CONFIG.defaultMode;
  }

  const normalized = String(mode).trim().toLowerCase();
  if (APPEARANCE_MODES.has(normalized as AppearanceSyncMode)) {
    return normalized as AppearanceSyncMode;
  }

  return DEFAULT_APPEARANCE_CONFIG.defaultMode;
}
