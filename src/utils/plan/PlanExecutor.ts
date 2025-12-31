import { Plan, PlanExecutionResult } from "../../models/Plan";
import { logger } from "../logger";
import { ToolRegistry } from "../../server/toolRegistry";
import { ActionableError } from "../../models";
import { isDebugModeEnabled } from "../debug";
import { ExecutePlanStepDebugInfo } from "../../models/ExecutePlanResult";

/**
 * Interface for plan execution
 * Handles execution of plan steps sequentially
 */
export interface PlanExecutor {
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
  ): Promise<PlanExecutionResult>;
}

/**
 * Default plan execution implementation
 * Executes plan steps sequentially using the tool registry
 */
export class DefaultPlanExecutor implements PlanExecutor {
  /**
   * Execute a plan step by step
   * @param plan Plan to execute
   * @param startStep Starting step index (default 0)
   * @param platform Optional platform parameter to inject into tool calls
   * @returns Promise with execution result including success status, executed steps, and any errors
   */
  async executePlan(
    plan: Plan,
    startStep: number,
    platform?: string
  ): Promise<PlanExecutionResult> {
    let executedSteps = 0;
    const debugMode = isDebugModeEnabled();
    const startTime = debugMode ? Date.now() : 0;
    const debugSteps: ExecutePlanStepDebugInfo[] = debugMode ? [] : [];

    try {
      // Validate and normalize startStep
      if (startStep < 0) {
        startStep = 0;
      } else if (plan.steps.length > 0 && startStep >= plan.steps.length) {
        throw new ActionableError(`Start step index ${startStep} is out of bounds. Plan has ${plan.steps.length} steps (valid range: 0-${plan.steps.length - 1})`);
      }

      // Handle empty plans
      if (plan.steps.length === 0) {
        logger.info("Plan has no steps to execute");
        return {
          success: true,
          executedSteps: 0,
          totalSteps: 0
        };
      }

      logger.info(`Starting plan execution from step ${startStep}`);

      for (let i = startStep; i < plan.steps.length; i++) {
        const step = plan.steps[i];
        const stepStartTime = debugMode ? Date.now() : 0;
        logger.info(`Executing step ${i + 1}/${plan.steps.length}: ${step.tool}`);

        // Get the registered tool
        const tool = ToolRegistry.getTool(step.tool);
        if (!tool) {
          logger.info(`Could not find tool: ${step.tool}`);

          if (debugMode) {
            debugSteps.push({
              step: `Execute step ${i + 1}: ${step.tool}`,
              status: "failed",
              durationMs: Date.now() - stepStartTime,
              details: {
                error: `Unknown tool: ${step.tool}`
              }
            });
          }

          return {
            success: false,
            executedSteps,
            totalSteps: plan.steps.length,
            failedStep: {
              stepIndex: i,
              tool: step.tool,
              error: `Unknown tool: ${step.tool}`
            },
            ...(debugMode ? {
              debug: {
                executionTimeMs: Date.now() - startTime,
                steps: debugSteps
              }
            } : {})
          };
        }

        try {
          // Inject platform parameter into tool call params if the tool requires a device and platform is provided
          const enhancedParams = { ...step.params };

          if (tool.requiresDevice && platform && !enhancedParams.platform) {
            enhancedParams.platform = platform;
          }

          // Parse and validate the parameters
          const parsedParams = tool.schema.parse(enhancedParams);

          // Execute the tool
          const response = await tool.handler(parsedParams);

          // Check if the response indicates failure
          if (response && typeof response === "object" && "success" in response && response.success === false) {
            if (debugMode) {
              debugSteps.push({
                step: `Execute step ${i + 1}: ${step.tool}`,
                status: "failed",
                durationMs: Date.now() - stepStartTime,
                details: {
                  params: step.params,
                  error: "error" in response ? String(response.error) : "Tool execution failed",
                  // Include debug info from tool response if available
                  ...(response.debug ? { toolDebug: response.debug } : {})
                }
              });
            }

            return {
              success: false,
              executedSteps,
              totalSteps: plan.steps.length,
              failedStep: {
                stepIndex: i,
                tool: step.tool,
                error: "error" in response ? String(response.error) : "Tool execution failed"
              },
              ...(debugMode ? {
                debug: {
                  executionTimeMs: Date.now() - startTime,
                  steps: debugSteps
                }
              } : {})
            };
          }

          if (debugMode) {
            debugSteps.push({
              step: `Execute step ${i + 1}: ${step.tool}`,
              status: "completed",
              durationMs: Date.now() - stepStartTime,
              details: {
                params: step.params
              }
            });
          }

          executedSteps++;
        } catch (error) {
          if (debugMode) {
            debugSteps.push({
              step: `Execute step ${i + 1}: ${step.tool}`,
              status: "failed",
              durationMs: Date.now() - stepStartTime,
              details: {
                params: step.params,
                error: `${error}`
              }
            });
          }

          return {
            success: false,
            executedSteps,
            totalSteps: plan.steps.length,
            failedStep: {
              stepIndex: i,
              tool: step.tool,
              error: `${error}`
            },
            ...(debugMode ? {
              debug: {
                executionTimeMs: Date.now() - startTime,
                steps: debugSteps
              }
            } : {})
          };
        }
      }

      logger.info(`Plan execution completed successfully: ${executedSteps}/${plan.steps.length} steps`);
      return {
        success: true,
        executedSteps,
        totalSteps: plan.steps.length,
        ...(debugMode ? {
          debug: {
            executionTimeMs: Date.now() - startTime,
            steps: debugSteps
          }
        } : {})
      };

    } catch (error) {
      logger.error(`Plan execution failed: ${error}`);

      if (debugMode) {
        debugSteps.push({
          step: "Plan execution error",
          status: "failed",
          durationMs: Date.now() - startTime,
          details: {
            error: `${error}`
          }
        });
      }

      return {
        success: false,
        executedSteps,
        totalSteps: plan.steps.length,
        failedStep: {
          stepIndex: -1,
          tool: "unknown",
          error: `${error}`
        },
        ...(debugMode ? {
          debug: {
            executionTimeMs: Date.now() - startTime,
            steps: debugSteps
          }
        } : {})
      };
    }
  }
}
