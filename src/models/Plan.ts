export interface PlanStep {
  tool: string;
  params: Record<string, any>;
  label?: string;
}

export interface Plan {
  name: string;
  description?: string;
  steps: PlanStep[];
  mcpVersion?: string;
  metadata?: {
    createdAt: string;
    version: string;
    experiments?: string[];
    treatments?: Record<string, string>;
    featureFlags?: Record<string, any>;
    generatedFromToolCalls?: boolean;
    [key: string]: any; // Allow additional metadata
  };
}

export interface PlanExecutionResult {
  success: boolean;
  executedSteps: number;
  totalSteps: number;
  failedStep?: {
    stepIndex: number;
    tool: string;
    error: string;
  };
}
