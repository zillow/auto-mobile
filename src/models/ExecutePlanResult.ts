export interface ExecutePlanStepDebugInfo {
  step: string;
  status: "completed" | "failed" | "skipped";
  durationMs: number;
  details?: any;
}

export interface ExecutePlanDebugInfo {
  executionTimeMs: number;
  steps: ExecutePlanStepDebugInfo[];
  deviceState?: {
    currentActivity?: string;
    focusedWindow?: string;
  };
}

export interface ExecutePlanResult {
  success: boolean;
  executedSteps: number;
  totalSteps: number;
  failedStep?: {
    stepIndex: number;
    tool: string;
    error: string;
  };
  error?: string;
  platform?: "android" | "ios";
  deviceId?: string; // The device ID that executed the plan (e.g., "emulator-5554" or "7B3A3792-DB53-4654-BA94-27A1D305C3B7")
  deviceMapping?: Record<string, string>; // Maps device labels to device IDs (e.g., {"A": "emulator-5554", "B": "emulator-5556"})
  debug?: ExecutePlanDebugInfo;
}
