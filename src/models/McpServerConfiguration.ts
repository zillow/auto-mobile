export interface McpServerConfig {
  mode?: "exploration" | "testAuthoring";
  appId?: string | null;
  deviceId?: string | null;
}

export interface ConfigureMcpServerResult {
  success: boolean;
  message: string;
  currentConfig: McpServerConfig;
}
