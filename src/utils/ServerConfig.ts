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
  private _accessibilityAuditConfig: AccessibilityAuditConfig | null = null;
  private _memPerfAuditEnabled: boolean = false;
  private _predictiveUiEnabled: boolean = false;
  private _rawElementSearchEnabled: boolean = false;
  private _planExecutionLockScope: PlanExecutionLockScope = "session";
  private _videoRecordingDefaults: VideoRecordingConfigInput = {};
  private _deviceSnapshotDefaults: DeviceSnapshotConfigInput = {};
  private _appearanceDefaults: AppearanceConfigInput = {};
  private _skipCtrlProxyDownload: boolean = false;
  private _dismissKeyboardAfterInput: boolean = false;
  private _mcpRecordingEnabled: boolean = false;

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

  setSkipCtrlProxyDownload(skip: boolean): void {
    this._skipCtrlProxyDownload = skip;
  }

  isSkipCtrlProxyDownloadEnabled(): boolean {
    return this._skipCtrlProxyDownload;
  }

  setDismissKeyboardAfterInput(enabled: boolean): void {
    this._dismissKeyboardAfterInput = enabled;
  }

  isDismissKeyboardAfterInputEnabled(): boolean {
    return this._dismissKeyboardAfterInput;
  }

  setMcpRecordingEnabled(enabled: boolean): void {
    this._mcpRecordingEnabled = enabled;
  }

  isMcpRecordingEnabled(): boolean {
    return this._mcpRecordingEnabled;
  }

}

export const serverConfig = ServerConfig.getInstance();
