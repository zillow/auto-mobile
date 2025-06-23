export interface McpServerConfig {
  androidProjectPath?: string;
  androidAppId?: string;
  userCredentialFile?: string;
  mode?: "exploration" | "testAuthoring";
  experiments?: Experiment[];
  treatments?: Record<string, AbTestTreatment>;
}

export interface AbTestTreatment {
  experimentId: string;
  treatmentId: string;
  parameters: Record<string, any>;
  featureOverrides?: Record<string, any>;
}

export interface Experiment {
  id: string;
  name: string;
  description?: string;
}

export interface ExperimentContext {
  activeExperimentIds: string[];
  treatments: Record<string, string>;
  featureFlags: Record<string, any>;
}

export interface ConfigureMcpServerResult {
  success: boolean;
  message: string;
  currentConfig: McpServerConfig;
}
