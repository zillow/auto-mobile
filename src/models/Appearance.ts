export type AppearanceMode = "light" | "dark";

export type AppearanceSyncMode = AppearanceMode | "auto";

export interface AppearanceConfig {
  syncWithHost: boolean;
  defaultMode: AppearanceSyncMode;
  applyOnConnect: boolean;
}

export interface AppearanceConfigInput {
  syncWithHost?: boolean;
  defaultMode?: AppearanceSyncMode | string;
  applyOnConnect?: boolean;
}
