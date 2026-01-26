import {
  Plan,
  PlanExecutionResult,
  DeviceExecutionResult,
  AbortStrategy,
  DEFAULT_ABORT_STRATEGY,
} from "../../models/Plan";
import { logger } from "../logger";
import { ToolRegistry } from "../../server/toolRegistry";
import { ActionableError } from "../../models";
import { isDebugModeEnabled } from "../debug";
import { ExecutePlanStepDebugInfo } from "../../models/ExecutePlanResult";
import { throwIfAborted } from "../toolUtils";
import { PlanPartitioner, TrackedStep } from "./PlanPartitioner";
import { DaemonState } from "../../daemon/daemonState";

/**
 * Interface for plan execution
 * Handles execution of plan steps sequentially or in parallel (multi-device)
 */
export interface PlanExecutor {
  /**
   * Execute a plan step by step
   * @param plan Plan to execute
   * @param startStep Starting step index (default 0)
   * @param platform Optional platform parameter to inject into tool calls
   * @param deviceId Optional device ID to inject into tool calls for device targeting
   * @param sessionUuid Optional session UUID to inject into tool calls for parallel execution
   * @param signal Optional abort signal for cancellation
   * @param abortStrategy Strategy for aborting when a device fails (default: "immediate")
   * @returns Promise with execution result including success status, executed steps, and any errors
   */
  executePlan(
    plan: Plan,
    startStep: number,
    platform?: string,
    deviceId?: string,
    sessionUuid?: string,
    signal?: AbortSignal,
    abortStrategy?: AbortStrategy,
  ): Promise<PlanExecutionResult>;
}

/**
 * Default plan execution implementation
 * Executes plan steps sequentially or in parallel (multi-device)
 */
export class DefaultPlanExecutor implements PlanExecutor {
  /**
   * Execute a plan step by step
   * @param plan Plan to execute
   * @param startStep Starting step index (default 0)
   * @param platform Optional platform parameter to inject into tool calls
   * @param deviceId Optional device ID to inject into tool calls for device targeting
   * @param sessionUuid Optional session UUID to inject into tool calls for parallel execution
   * @param signal Optional abort signal for cancellation
   * @param abortStrategy Strategy for aborting when a device fails (default: "immediate")
   * @returns Promise with execution result including success status, executed steps, and any errors
   */
  async executePlan(
    plan: Plan,
    startStep: number,
    platform?: string,
    deviceId?: string,
    sessionUuid?: string,
    signal?: AbortSignal,
    abortStrategy: AbortStrategy = DEFAULT_ABORT_STRATEGY
  ): Promise<PlanExecutionResult> {
    // Check if this is a multi-device plan
    const partitionedPlan = PlanPartitioner.partition(plan);

    if (partitionedPlan) {
      // Multi-device parallel execution
      return this.executeParallel(
        plan,
        partitionedPlan,
        startStep,
        platform,
        deviceId,
        sessionUuid,
        signal,
        abortStrategy
      );
    } else {
      // Single-device sequential execution
      return this.executeSequential(
        plan,
        startStep,
        platform,
        deviceId,
        sessionUuid,
        signal
      );
    }
  }

  /**
   * Execute a single-device plan sequentially (original implementation).
   */
  private async executeSequential(
    plan: Plan,
    startStep: number,
    platform?: string,
    deviceId?: string,
    sessionUuid?: string,
    signal?: AbortSignal
  ): Promise<PlanExecutionResult> {
    let executedSteps = 0;
    const debugMode = isDebugModeEnabled();
    const startTime = Date.now();
    // Always capture step data for test recording, not just in debug mode
    const debugSteps: ExecutePlanStepDebugInfo[] = [];

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
        throwIfAborted(signal);
        const step = plan.steps[i];
        const stepStartTime = debugMode ? Date.now() : 0;
        const stepLabel = step.label || step.params?.label || JSON.stringify(step.params).substring(0, 50);
        logger.info(`[PLAN_STEP_${i + 1}/${plan.steps.length}] Tool: ${step.tool}, Label: ${stepLabel}`);

        // Get the registered tool
        const tool = ToolRegistry.getTool(step.tool);
        if (!tool) {
          logger.info(`Could not find tool: ${step.tool}`);

          debugSteps.push({
            step: `Execute step ${i + 1}: ${step.tool}`,
            status: "failed",
            durationMs: Date.now() - stepStartTime,
            details: {
              error: `Unknown tool: ${step.tool}`
            }
          });

          return {
            success: false,
            executedSteps,
            totalSteps: plan.steps.length,
            failedStep: {
              stepIndex: i,
              tool: step.tool,
              error: `Unknown tool: ${step.tool}`
            },
            debug: {
              executionTimeMs: Date.now() - startTime,
              steps: debugSteps
            }
          };
        }

        try {
          // Inject platform, deviceId, and sessionUuid into tool call params for device-aware tools
          const enhancedParams = { ...step.params };

          if (tool.requiresDevice) {
            // Inject platform if provided and not already set
            if (platform && !enhancedParams.platform) {
              enhancedParams.platform = platform;
            }

            // Inject deviceId if provided and not already set - BUT only if session-based routing won't work
            // We suppress deviceId injection when BOTH conditions are met:
            // 1. sessionUuid is present (for session-based routing)
            // 2. daemon is initialized (so session routing will actually work in ToolRegistry)
            // If daemon is not initialized, we still inject deviceId to preserve device targeting,
            // preventing fallback to auto-selection which may target the wrong device.
            const shouldSuppressDeviceId = sessionUuid && DaemonState.getInstance().isInitialized();
            if (deviceId && !shouldSuppressDeviceId && !enhancedParams.deviceId && !enhancedParams.device) {
              enhancedParams.deviceId = deviceId;
              logger.info(`[PlanExecutor] Injecting deviceId ${deviceId} into ${step.tool}`);
            }

            // Inject sessionUuid if provided and not already set - this enables session-based device routing
            if (sessionUuid && !enhancedParams.sessionUuid) {
              enhancedParams.sessionUuid = sessionUuid;
              logger.info(`[PlanExecutor] Injecting sessionUuid ${sessionUuid} into ${step.tool}`);
            }
          }

          // Parse and validate the parameters
          const parsedParams = tool.schema.parse(enhancedParams);

          // Execute the tool
          logger.info(`[PLAN_STEP_${i + 1}] Calling ${step.tool} with params: ${JSON.stringify(parsedParams).substring(0, 200)}`);
          const response = await tool.handler(parsedParams, undefined, signal);
          logger.info(`[PLAN_STEP_${i + 1}] ${step.tool} completed. Response success: ${response?.success !== false ? "true" : "FALSE"}`);

          // Check if the response indicates failure
          if (response && typeof response === "object" && "success" in response && response.success === false) {
            logger.error(`[PLAN_STEP_${i + 1}] FAILED: ${step.tool} - ${response.error || "Unknown error"}`);
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

            return {
              success: false,
              executedSteps,
              totalSteps: plan.steps.length,
              failedStep: {
                stepIndex: i,
                tool: step.tool,
                error: "error" in response ? String(response.error) : "Tool execution failed"
              },
              debug: {
                executionTimeMs: Date.now() - startTime,
                steps: debugSteps
              }
            };
          }

          debugSteps.push({
            step: `Execute step ${i + 1}: ${step.tool}`,
            status: "completed",
            durationMs: Date.now() - stepStartTime,
            details: {
              params: step.params
            }
          });

          executedSteps++;
          logger.info(`[PLAN_STEP_${i + 1}] Successfully completed. Total executed: ${executedSteps}/${plan.steps.length}`);
        } catch (error) {
          logger.error(`[PLAN_STEP_${i + 1}] EXCEPTION in ${step.tool}: ${error}`);
          debugSteps.push({
            step: `Execute step ${i + 1}: ${step.tool}`,
            status: "failed",
            durationMs: Date.now() - stepStartTime,
            details: {
              params: step.params,
              error: `${error}`
            }
          });

          return {
            success: false,
            executedSteps,
            totalSteps: plan.steps.length,
            failedStep: {
              stepIndex: i,
              tool: step.tool,
              error: `${error}`
            },
            debug: {
              executionTimeMs: Date.now() - startTime,
              steps: debugSteps
            }
          };
        }
      }

      logger.info(`Plan execution completed successfully: ${executedSteps}/${plan.steps.length} steps`);
      return {
        success: true,
        executedSteps,
        totalSteps: plan.steps.length,
        debug: {
          executionTimeMs: Date.now() - startTime,
          steps: debugSteps
        }
      };

    } catch (error) {
      logger.error(`Plan execution failed: ${error}`);

      debugSteps.push({
        step: "Plan execution error",
        status: "failed",
        durationMs: Date.now() - startTime,
        details: {
          error: `${error}`
        }
      });

      return {
        success: false,
        executedSteps,
        totalSteps: plan.steps.length,
        failedStep: {
          stepIndex: -1,
          tool: "unknown",
          error: `${error}`
        },
        debug: {
          executionTimeMs: Date.now() - startTime,
          steps: debugSteps
        }
      };
    }
  }

  /**
   * Execute a multi-device plan with parallel device tracks.
   */
  private async executeParallel(
    plan: Plan,
    partitionedPlan: ReturnType<typeof PlanPartitioner.partition> & { devices: string[] },
    startStep: number,
    platform?: string,
    deviceId?: string,
    sessionUuid?: string,
    signal?: AbortSignal,
    abortStrategy: AbortStrategy = DEFAULT_ABORT_STRATEGY
  ): Promise<PlanExecutionResult> {
    const debugMode = isDebugModeEnabled();

    logger.info(
      `[PARALLEL_EXEC] Starting parallel execution for ${partitionedPlan.devices.length} devices`
    );

    // Create an abort controller for internal cancellation
    const internalAbortController = new AbortController();
    const combinedSignal = signal
      ? this.createCombinedSignal(signal, internalAbortController.signal)
      : internalAbortController.signal;

    // Track per-device results
    const perDeviceResults = new Map<string, DeviceExecutionResult>();
    let firstFailure:
      | {
          device: string;
          stepIndex: number;
          tool: string;
          error: string;
        }
      | undefined;

    // Execute each device track in parallel
    const devicePromises = partitionedPlan.devices.map(async device => {
      const deviceStartTime = debugMode ? Date.now() : 0;
      const track = partitionedPlan.deviceTracks.get(device)!;

      logger.info(
        `[PARALLEL_EXEC][${device}] Starting device track with ${track.length} steps`
      );

      try {
        const result = await this.executeDeviceTrack(
          device,
          track,
          startStep,
          platform,
          deviceId,
          sessionUuid,
          combinedSignal
        );

        const deviceResult: DeviceExecutionResult = {
          device,
          success: result.success,
          executedSteps: result.executedSteps,
          totalSteps: track.length,
          executionTimeMs: debugMode ? Date.now() - deviceStartTime : undefined,
          failedStep: result.failedStep
            ? {
              stepIndex: result.failedStep.stepIndex,
              trackIndex: result.failedStep.trackIndex,
              tool: result.failedStep.tool,
              error: result.failedStep.error,
            }
            : undefined,
        };

        perDeviceResults.set(device, deviceResult);

        if (!result.success) {
          logger.error(
            `[PARALLEL_EXEC][${device}] Device track failed at step ${result.failedStep?.stepIndex}`
          );

          // Record first failure
          if (!firstFailure && result.failedStep) {
            firstFailure = {
              device,
              stepIndex: result.failedStep.stepIndex,
              tool: result.failedStep.tool,
              error: result.failedStep.error,
            };
          }

          // Trigger abort based on strategy
          if (abortStrategy === "immediate") {
            logger.info(
              `[PARALLEL_EXEC] Aborting all devices immediately due to failure on ${device}`
            );
            internalAbortController.abort();
          }
          // For "finish-current-step", we just let other devices finish naturally
        }

        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`[PARALLEL_EXEC][${device}] Unexpected error: ${errorMessage}`);

        const deviceResult: DeviceExecutionResult = {
          device,
          success: false,
          executedSteps: 0,
          totalSteps: track.length,
          executionTimeMs: debugMode ? Date.now() - deviceStartTime : undefined,
          failedStep: {
            stepIndex: -1,
            trackIndex: -1,
            tool: "unknown",
            error: errorMessage,
          },
        };

        perDeviceResults.set(device, deviceResult);

        if (!firstFailure) {
          firstFailure = {
            device,
            stepIndex: -1,
            tool: "unknown",
            error: errorMessage,
          };
        }

        if (abortStrategy === "immediate") {
          internalAbortController.abort();
        }

        return {
          success: false,
          executedSteps: 0,
          totalSteps: track.length,
          failedStep: {
            stepIndex: -1,
            trackIndex: -1,
            tool: "unknown",
            error: errorMessage,
          },
        };
      }
    });

    // Wait for all devices to complete
    const results = await Promise.all(devicePromises);

    // Calculate total executed steps across all devices
    const totalExecutedSteps = results.reduce((sum, r) => sum + r.executedSteps, 0);
    const totalSteps = results.reduce((sum, r) => sum + r.totalSteps, 0);
    const allSucceeded = results.every(r => r.success);

    logger.info(
      `[PARALLEL_EXEC] Parallel execution completed. Success: ${allSucceeded}, Total steps: ${totalExecutedSteps}/${totalSteps}`
    );

    // Log per-device timing in debug mode or on failure
    if (debugMode || !allSucceeded) {
      logger.info(`[PARALLEL_EXEC] Per-device results:`);
      for (const [device, result] of perDeviceResults.entries()) {
        const timing = result.executionTimeMs ? ` (${result.executionTimeMs}ms)` : "";
        const status = result.success ? "SUCCESS" : "FAILED";
        logger.info(
          `[PARALLEL_EXEC]   ${device}: ${status} - ${result.executedSteps}/${result.totalSteps} steps${timing}`
        );
        if (result.failedStep) {
          logger.error(
            `[PARALLEL_EXEC]   ${device}: Failed at plan step ${result.failedStep.stepIndex} (track step ${result.failedStep.trackIndex}): ${result.failedStep.error}`
          );
        }
      }
    }

    return {
      success: allSucceeded,
      executedSteps: totalExecutedSteps,
      totalSteps,
      failedStep: firstFailure
        ? {
          stepIndex: firstFailure.stepIndex,
          tool: firstFailure.tool,
          error: firstFailure.error,
          device: firstFailure.device,
        }
        : undefined,
      perDeviceResults,
    };
  }

  /**
   * Execute a single device track.
   */
  private async executeDeviceTrack(
    device: string,
    track: TrackedStep[],
    startStep: number,
    platform?: string,
    deviceId?: string,
    sessionUuid?: string,
    signal?: AbortSignal
  ): Promise<{
    success: boolean;
    executedSteps: number;
    totalSteps: number;
    failedStep?: {
      stepIndex: number;
      trackIndex: number;
      tool: string;
      error: string;
    };
  }> {
    let executedSteps = 0;

    try {
      for (let trackIndex = 0; trackIndex < track.length; trackIndex++) {
        const trackedStep = track[trackIndex];
        const step = trackedStep.step;
        const planIndex = trackedStep.planIndex;

        // Skip steps before startStep
        if (planIndex < startStep) {
          continue;
        }

        // Check for abort
        throwIfAborted(signal);

        const stepLabel =
          step.label || step.params?.label || JSON.stringify(step.params).substring(0, 50);
        logger.info(
          `[PARALLEL_EXEC][${device}] Step ${trackIndex + 1}/${track.length} (plan step ${planIndex}): ${step.tool}, Label: ${stepLabel}`
        );

        // Get the registered tool
        const tool = ToolRegistry.getTool(step.tool);
        if (!tool) {
          logger.error(`[PARALLEL_EXEC][${device}] Unknown tool: ${step.tool}`);
          return {
            success: false,
            executedSteps,
            totalSteps: track.length,
            failedStep: {
              stepIndex: planIndex,
              trackIndex,
              tool: step.tool,
              error: `Unknown tool: ${step.tool}`,
            },
          };
        }

        try {
          // Inject device context
          const enhancedParams = { ...step.params };

          if (tool.requiresDevice) {
            if (platform && !enhancedParams.platform) {
              enhancedParams.platform = platform;
            }
            // Only inject deviceId if session-based routing won't work (see detailed comment in executeSequential)
            const shouldSuppressDeviceId = sessionUuid && DaemonState.getInstance().isInitialized();
            if (deviceId && !shouldSuppressDeviceId && !enhancedParams.deviceId && !enhancedParams.device) {
              enhancedParams.deviceId = deviceId;
            }
            if (sessionUuid && !enhancedParams.sessionUuid) {
              enhancedParams.sessionUuid = sessionUuid;
            }
          }

          // Parse and validate parameters
          const parsedParams = tool.schema.parse(enhancedParams);

          // Execute the tool
          logger.debug(
            `[PARALLEL_EXEC][${device}] Executing ${step.tool} with params: ${JSON.stringify(parsedParams).substring(0, 200)}`
          );
          const response = await tool.handler(parsedParams, undefined, signal);

          // Check if response indicates failure
          if (
            response &&
            typeof response === "object" &&
            "success" in response &&
            response.success === false
          ) {
            const errorMsg = "error" in response ? String(response.error) : "Tool execution failed";
            logger.error(`[PARALLEL_EXEC][${device}] Tool failed: ${errorMsg}`);

            return {
              success: false,
              executedSteps,
              totalSteps: track.length,
              failedStep: {
                stepIndex: planIndex,
                trackIndex,
                tool: step.tool,
                error: errorMsg,
              },
            };
          }

          executedSteps++;
          logger.debug(
            `[PARALLEL_EXEC][${device}] Step completed successfully. Executed: ${executedSteps}/${track.length}`
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error(`[PARALLEL_EXEC][${device}] Step execution error: ${errorMessage}`);

          return {
            success: false,
            executedSteps,
            totalSteps: track.length,
            failedStep: {
              stepIndex: planIndex,
              trackIndex,
              tool: step.tool,
              error: errorMessage,
            },
          };
        }
      }

      logger.info(
        `[PARALLEL_EXEC][${device}] Device track completed successfully: ${executedSteps}/${track.length} steps`
      );

      return {
        success: true,
        executedSteps,
        totalSteps: track.length,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[PARALLEL_EXEC][${device}] Track execution error: ${errorMessage}`);

      return {
        success: false,
        executedSteps,
        totalSteps: track.length,
        failedStep: {
          stepIndex: -1,
          trackIndex: -1,
          tool: "unknown",
          error: errorMessage,
        },
      };
    }
  }

  /**
   * Creates a combined abort signal from two signals.
   */
  private createCombinedSignal(signal1: AbortSignal, signal2: AbortSignal): AbortSignal {
    const controller = new AbortController();

    const abort = () => controller.abort();

    if (signal1.aborted || signal2.aborted) {
      controller.abort();
    } else {
      signal1.addEventListener("abort", abort);
      signal2.addEventListener("abort", abort);
    }

    return controller.signal;
  }
}
