export interface PlanStep {
  tool: string;
  params: Record<string, any>;
  label?: string;
}

export interface Plan {
  name: string;
  description?: string;
  devices?: string[];
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
    device?: string; // Device label for multi-device plans
  };
  perDeviceResults?: Map<string, DeviceExecutionResult>; // For multi-device plans
}

export interface DeviceExecutionResult {
  device: string;
  success: boolean;
  executedSteps: number;
  totalSteps: number;
  executionTimeMs?: number;
  failedStep?: {
    stepIndex: number; // Index in plan
    trackIndex: number; // Index in device track
    tool: string;
    error: string;
  };
}

export type AbortStrategy = "immediate" | "finish-current-step";
export const DEFAULT_ABORT_STRATEGY: AbortStrategy = "immediate";
