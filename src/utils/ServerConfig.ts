import type {
  AccessibilityAuditConfig,
} from "../models/AccessibilityAudit";

/**
 * Global server configuration state
 * Set once during server initialization
 */
class ServerConfig {
  private static instance: ServerConfig;
  private _uiPerfModeEnabled: boolean = false;
  private _accessibilityAuditConfig: AccessibilityAuditConfig | null = null;

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
}

export const serverConfig = ServerConfig.getInstance();
