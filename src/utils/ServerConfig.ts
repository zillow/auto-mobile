import type {
  AccessibilityAuditConfig,
} from "../models/AccessibilityAudit";
import type {
  VideoRecordingConfigInput,
  DeviceSnapshotConfigInput,
  AppearanceConfigInput,
} from "../models";

export type PlanExecutionLockScope = "session" | "global";

/**
 * Global server configuration state
 * Set once during server initialization
 */
class ServerConfig {
  private static instance: ServerConfig;
  private _uiPerfModeEnabled: boolean = true;
  private _uiPerfDebugEnabled: boolean = false;
  private _accessibilityAuditConfig: AccessibilityAuditConfig | null = null;
  private _memPerfAuditEnabled: boolean = false;
  private _predictiveUiEnabled: boolean = false;
  private _rawElementSearchEnabled: boolean = false;
  private _planExecutionLockScope: PlanExecutionLockScope = "session";
  private _videoRecordingDefaults: VideoRecordingConfigInput = {};
  private _deviceSnapshotDefaults: DeviceSnapshotConfigInput = {};
  private _appearanceDefaults: AppearanceConfigInput = {};
  private _skipAccessibilityDownload: boolean = false;
  private _testVideoRecordingEnabled: boolean = false;

  private constructor() {}

  static getInstance(): ServerConfig {
    if (!ServerConfig.instance) {
      ServerConfig.instance = new ServerConfig();
    }
    return ServerConfig.instance;
  }

  setUiPerfMode(enabled: boolean): void {
    this._uiPerfModeEnabled = enabled;
  }

  isUiPerfModeEnabled(): boolean {
    return this._uiPerfModeEnabled;
  }

  setUiPerfDebugMode(enabled: boolean): void {
    this._uiPerfDebugEnabled = enabled;
  }

  isUiPerfDebugModeEnabled(): boolean {
    return this._uiPerfDebugEnabled;
  }

  setAccessibilityAuditConfig(config: AccessibilityAuditConfig | null): void {
    this._accessibilityAuditConfig = config;
  }

  getAccessibilityAuditConfig(): AccessibilityAuditConfig | null {
    return this._accessibilityAuditConfig;
  }

  isAccessibilityAuditEnabled(): boolean {
    return this._accessibilityAuditConfig !== null;
  }

  setMemPerfAuditMode(enabled: boolean): void {
    this._memPerfAuditEnabled = enabled;
  }

  isMemPerfAuditEnabled(): boolean {
    return this._memPerfAuditEnabled;
  }

  setPredictiveUiEnabled(enabled: boolean): void {
    this._predictiveUiEnabled = enabled;
  }

  isPredictiveUiEnabled(): boolean {
    return this._predictiveUiEnabled;
  }

  setRawElementSearchEnabled(enabled: boolean): void {
    this._rawElementSearchEnabled = enabled;
  }

  isRawElementSearchEnabled(): boolean {
    return this._rawElementSearchEnabled;
  }

  setPlanExecutionLockScope(scope: PlanExecutionLockScope): void {
    this._planExecutionLockScope = scope;
  }

  getPlanExecutionLockScope(): PlanExecutionLockScope {
    return this._planExecutionLockScope;
  }

  setVideoRecordingDefaults(defaults: VideoRecordingConfigInput): void {
    this._videoRecordingDefaults = { ...defaults };
  }

  getVideoRecordingDefaults(): VideoRecordingConfigInput {
    return { ...this._videoRecordingDefaults };
  }

  setDeviceSnapshotDefaults(defaults: DeviceSnapshotConfigInput): void {
    this._deviceSnapshotDefaults = { ...defaults };
  }

  getDeviceSnapshotDefaults(): DeviceSnapshotConfigInput {
    return { ...this._deviceSnapshotDefaults };
  }

  setAppearanceDefaults(defaults: AppearanceConfigInput): void {
    this._appearanceDefaults = { ...defaults };
  }

  getAppearanceDefaults(): AppearanceConfigInput {
    return { ...this._appearanceDefaults };
  }

  setSkipAccessibilityDownload(skip: boolean): void {
    this._skipAccessibilityDownload = skip;
  }

  isSkipAccessibilityDownloadEnabled(): boolean {
    return this._skipAccessibilityDownload;
  }

  setTestVideoRecordingEnabled(enabled: boolean): void {
    this._testVideoRecordingEnabled = enabled;
  }

  isTestVideoRecordingEnabled(): boolean {
    return this._testVideoRecordingEnabled;
  }
}

export const serverConfig = ServerConfig.getInstance();
