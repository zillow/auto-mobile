export interface AppConfig {
  appId: string;
  sourceDir: string;
  platform: "android" | "ios";
}

export interface ActivityInfo {
  className: string;
  packageName: string;
  fullClassName: string;
  sourceFile: string;
}

export interface FragmentInfo {
  className: string;
  packageName: string;
  fullClassName: string;
  sourceFile: string;
  associatedActivity?: string;
}

export interface ViewInfo {
  className: string;
  packageName: string;
  fullClassName: string;
  sourceFile: string;
  associatedActivity?: string;
  associatedFragment?: string;
}

export interface ComposableInfo {
  className: string;
  packageName: string;
  fullClassName: string;
  sourceFile: string;
  associatedActivity?: string;
  associatedFragment?: string;
}

export interface SourceIndexResult {
  activities: Map<string, ActivityInfo>;
  fragments: Map<string, FragmentInfo>;
  views: Map<string, ViewInfo>;
  composables: Map<string, ComposableInfo>;
  lastIndexed: number;
}

export interface AddAppConfigResult {
  success: boolean;
  appId: string;
  sourceDir: string;
  error?: string;
}
