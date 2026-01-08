import type {
  AccessibilityAuditConfig,
} from "../models/AccessibilityAudit";
import type { VideoRecordingConfigInput } from "../models/VideoRecording";

export type PlanExecutionLockScope = "session" | "global";

/**
 * Global server configuration state
 * Set once during server initialization
 */
class ServerConfig {
  private static instance: ServerConfig;
  private _uiPerfModeEnabled: boolean = false;
  private _uiPerfDebugEnabled: boolean = false;
  private _accessibilityAuditConfig: AccessibilityAuditConfig | null = null;
  private _memPerfAuditEnabled: boolean = false;
  private _strictAwaitEnabled: boolean = false;
  private _predictiveUiEnabled: boolean = false;
  private _planExecutionLockScope: PlanExecutionLockScope = "session";
  private _videoRecordingDefaults: VideoRecordingConfigInput = {};

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

  setStrictAwaitEnabled(enabled: boolean): void {
    this._strictAwaitEnabled = enabled;
  }

  isStrictAwaitEnabled(): boolean {
    return this._strictAwaitEnabled;
  }

  setPredictiveUiEnabled(enabled: boolean): void {
    this._predictiveUiEnabled = enabled;
  }

  isPredictiveUiEnabled(): boolean {
    return this._predictiveUiEnabled;
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
}

export const serverConfig = ServerConfig.getInstance();
