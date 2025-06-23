export interface ExportPlanResult {
  success: boolean;
  planPath?: string;
  planContent?: string;
  stepCount?: number;
  error?: string;
}
