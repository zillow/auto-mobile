import { PlanUtils } from "../../src/utils/interfaces/PlanUtils";
import { Plan, PlanExecutionResult } from "../../src/models/Plan";

/**
 * Fake implementation of PlanUtils for testing
 * Allows configuring responses for each method and asserting method calls
 */
export class FakePlanUtils implements PlanUtils {
  // Configuration state
  private exportPlanResults: Map<
    string,
    {
      success: boolean;
      planPath?: string;
      planContent?: string;
      stepCount?: number;
      error?: string;
    }
  > = new Map();
  private importPlanResults: Map<string, Plan> = new Map();
  private executePlanResults: Map<string, PlanExecutionResult> = new Map();

  // Captured data from method calls
  private capturedPlans: Plan[] = [];
  private capturedExecutionRequests: Array<{
    plan: Plan;
    startStep: number;
    platform?: string;
  }> = [];

  // Call tracking
  private methodCalls: Map<string, Array<Record<string, unknown>>> = new Map();

  /**
   * Configure export plan result
   */
  setExportPlanResult(
    logDir: string,
    result: {
      success: boolean;
      planPath?: string;
      planContent?: string;
      stepCount?: number;
      error?: string;
    }
  ): void {
    this.exportPlanResults.set(logDir, result);
  }

  /**
   * Configure import plan result
   */
  setImportPlanResult(yamlContent: string, plan: Plan): void {
    this.importPlanResults.set(yamlContent, plan);
  }

  /**
   * Configure execute plan result
   */
  setExecutePlanResult(
    planName: string,
    result: PlanExecutionResult
  ): void {
    this.executePlanResults.set(planName, result);
  }

  /**
   * Set default export plan result (used when specific config not found)
   */
  setDefaultExportPlanResult(result: {
    success: boolean;
    planPath?: string;
    planContent?: string;
    stepCount?: number;
    error?: string;
  }): void {
    this.exportPlanResults.set("__default__", result);
  }

  /**
   * Set default execute plan result (used when specific config not found)
   */
  setDefaultExecutePlanResult(result: PlanExecutionResult): void {
    this.executePlanResults.set("__default__", result);
  }

  /**
   * Get list of captured plans from import calls
   */
  getCapturedPlans(): Plan[] {
    return [...this.capturedPlans];
  }

  /**
   * Get list of captured execution requests
   */
  getCapturedExecutionRequests(): Array<{
    plan: Plan;
    startStep: number;
    platform?: string;
  }> {
    return [...this.capturedExecutionRequests];
  }

  /**
   * Get list of method calls for a specific method (for test assertions)
   */
  getMethodCalls(methodName: string): Array<Record<string, unknown>> {
    return this.methodCalls.get(methodName) || [];
  }

  /**
   * Check if a method was called
   */
  wasMethodCalled(methodName: string): boolean {
    const calls = this.methodCalls.get(methodName);
    return calls ? calls.length > 0 : false;
  }

  /**
   * Get count of method calls
   */
  getMethodCallCount(methodName: string): number {
    const calls = this.methodCalls.get(methodName);
    return calls ? calls.length : 0;
  }

  /**
   * Clear all call history and captured data
   */
  clearCallHistory(): void {
    this.methodCalls.clear();
    this.capturedPlans = [];
    this.capturedExecutionRequests = [];
  }

  /**
   * Record a method call with parameters
   */
  private recordCall(methodName: string, params: Record<string, unknown>): void {
    if (!this.methodCalls.has(methodName)) {
      this.methodCalls.set(methodName, []);
    }
    this.methodCalls.get(methodName)!.push(params);
  }

  // Implementation of PlanUtils interface

  async exportPlanFromLogs(
    logDir: string,
    planName: string,
    outputPath: string
  ): Promise<{
    success: boolean;
    planPath?: string;
    planContent?: string;
    stepCount?: number;
    error?: string;
  }> {
    this.recordCall("exportPlanFromLogs", { logDir, planName, outputPath });

    // Check for specific result first, then fall back to default
    const result =
      this.exportPlanResults.get(logDir) ||
      this.exportPlanResults.get("__default__");

    if (result) {
      return result;
    }

    // Default sensible response
    return {
      success: true,
      planPath: outputPath,
      planContent: `name: ${planName}\ndescription: Mock exported plan\nsteps: []`,
      stepCount: 0
    };
  }

  importPlanFromYaml(yamlContent: string): Plan {
    this.recordCall("importPlanFromYaml", { yamlContentLength: yamlContent.length });

    // Check for specific result first
    const result = this.importPlanResults.get(yamlContent);
    if (result) {
      this.capturedPlans.push(result);
      return result;
    }

    // Default sensible response
    const defaultPlan: Plan = {
      name: "Mock Plan",
      description: "Mock imported plan",
      steps: [],
      metadata: {
        createdAt: new Date().toISOString(),
        version: "1.0.0"
      }
    };

    this.capturedPlans.push(defaultPlan);
    return defaultPlan;
  }

  async executePlan(
    plan: Plan,
    startStep: number,
    platform?: string
  ): Promise<PlanExecutionResult> {
    this.recordCall("executePlan", {
      planName: plan.name,
      startStep,
      platform,
      stepCount: plan.steps.length
    });

    // Capture the execution request
    this.capturedExecutionRequests.push({ plan, startStep, platform });

    // Check for specific result first, then fall back to default
    const result =
      this.executePlanResults.get(plan.name) ||
      this.executePlanResults.get("__default__");

    if (result) {
      return result;
    }

    // Default sensible response: successful execution
    return {
      success: true,
      executedSteps: Math.max(0, plan.steps.length - startStep),
      totalSteps: plan.steps.length
    };
  }
}
