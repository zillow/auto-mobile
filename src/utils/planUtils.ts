/**
 * Backward compatibility layer for planUtils
 * Re-exports functions from the new focused modules
 *
 * @deprecated Use PlanSerializer and PlanExecutor classes directly instead
 */

import { YamlPlanSerializer } from "./plan/PlanSerializer";
import { DefaultPlanExecutor } from "./plan/PlanExecutor";
import { Plan, PlanExecutionResult } from "../models/Plan";

/**
 * Interface for plan management utilities
 * Provides plan export, import, and execution capabilities
 */
export interface PlanUtils {
  /**
   * Export a plan from logged tool calls in a directory
   * @param logDir Directory containing log files
   * @param planName Name for the exported plan
   * @param outputPath Path where the plan YAML will be written
   * @returns Promise with export result including success status, plan path, content, and step count
   */
  exportPlanFromLogs(
    logDir: string,
    planName: string,
    outputPath: string
  ): Promise<{
    success: boolean;
    planPath?: string;
    planContent?: string;
    stepCount?: number;
    error?: string;
  }>;

  /**
   * Import a plan from YAML content
   * @param yamlContent YAML string containing plan definition
   * @returns Parsed Plan object
   * @throws Error if YAML is invalid or plan structure is incorrect
   */
  importPlanFromYaml(yamlContent: string): Plan;

  /**
   * Execute a plan step by step
   * @param plan Plan to execute
   * @param startStep Starting step index (default 0)
   * @param platform Optional platform parameter to inject into tool calls
   * @returns Promise with execution result including success status, executed steps, and any errors
   */
  executePlan(
    plan: Plan,
    startStep: number,
    platform?: string,
    deviceId?: string,
    sessionUuid?: string,
    signal?: AbortSignal
  ): Promise<PlanExecutionResult>;
}

// Create singleton instances
const serializer = new YamlPlanSerializer();
const executor = new DefaultPlanExecutor();

// Re-export functions for backward compatibility
export const exportPlanFromLogs = serializer.exportPlanFromLogs.bind(serializer);
export const importPlanFromYaml = serializer.importPlanFromYaml.bind(serializer);
export const executePlan = executor.executePlan.bind(executor);
