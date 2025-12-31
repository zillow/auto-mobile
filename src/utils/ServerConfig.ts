/**
 * Global server configuration state
 * Set once during server initialization
 */
class ServerConfig {
  private static instance: ServerConfig;
  private _uiPerfModeEnabled: boolean = false;

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
}

export const serverConfig = ServerConfig.getInstance();
