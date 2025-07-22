import fs from "fs/promises";
import path from "path";
import yaml from "js-yaml";
import { Plan, PlanStep, PlanExecutionResult } from "../models/Plan";
import { logger } from "./logger";
import { ToolRegistry } from "../server/toolRegistry";
import { ActionableError } from "../models";

// Tools that should be omitted from plans
const OMITTED_TOOLS = new Set([
  "startDevice",
  "killEmulator",
  "listDeviceImages",
  "checkRunningEmulators",
  "listDevices",
  "setActiveDevice"
]);

// Check if a tool call should be included in the plan
const shouldIncludeInPlan = (toolName: string, isLastObserve: boolean): boolean => {
  if (OMITTED_TOOLS.has(toolName)) {
    return false;
  }

  // Include all non-observe tools
  if (toolName !== "observe") {
    return true;
  }

  // For observe calls, only include the last one
  return isLastObserve;
};

// Export a plan from logged tool calls
export const exportPlanFromLogs = async (
  logDir: string,
  planName: string,
  outputPath: string
): Promise<{ success: boolean; planPath?: string; planContent?: string; stepCount?: number; error?: string }> => {
  try {
    // Read all log files in the directory
    const files = await fs.readdir(logDir);
    const logFiles = files.filter(f => f.endsWith(".json")).sort();

    if (logFiles.length === 0) {
      return { success: false, error: "No log files found" };
    }

    // Collect all successful tool calls
    const allToolCalls: Array<{
      timestamp: string;
      tool: string;
      params: Record<string, any>;
      result: { success: boolean; data?: any; error?: string };
    }> = [];

    for (const logFile of logFiles) {
      try {
        const logPath = path.join(logDir, logFile);
        const content = await fs.readFile(logPath, "utf-8");

        // Handle both single JSON objects and newline-delimited JSON
        const lines = content.trim().split("\n").filter(line => line.trim());

        for (const line of lines) {
          try {
            const logEntry = JSON.parse(line.trim());
            if (logEntry.result?.success) {
              allToolCalls.push(logEntry);
            }
          } catch (parseError) {
            logger.warn(`Failed to parse line in ${logFile}: ${parseError}`);
          }
        }
      } catch (error) {
        logger.warn(`Failed to read log file ${logFile}: ${error}`);
      }
    }

    if (allToolCalls.length === 0) {
      return { success: false, error: "No successful tool calls found in logs" };
    }

    // Sort by timestamp
    allToolCalls.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Find the last observe call
    let lastObserveIndex = -1;
    for (let i = allToolCalls.length - 1; i >= 0; i--) {
      if (allToolCalls[i].tool === "observe") {
        lastObserveIndex = i;
        break;
      }
    }

    // Filter tools and create plan steps
    const planSteps: PlanStep[] = [];

    for (let i = 0; i < allToolCalls.length; i++) {
      const toolCall = allToolCalls[i];
      const isLastObserve = i === lastObserveIndex;

      if (shouldIncludeInPlan(toolCall.tool, isLastObserve)) {
        planSteps.push({
          tool: toolCall.tool,
          params: toolCall.params
        });
      }
    }

    // Create the plan
    const plan: Plan = {
      name: planName,
      description: `Exported plan with ${planSteps.length} steps`,
      steps: planSteps,
      metadata: {
        createdAt: new Date().toISOString(),
        version: "1.0.0"
      }
    };

    // Convert to YAML
    const yamlContent = yaml.dump(plan, {
      indent: 2,
      lineWidth: -1,
      noRefs: true
    });

    // Write to file
    await fs.writeFile(outputPath, yamlContent, "utf-8");
    logger.info(`Plan exported to ${outputPath}`);

    return {
      success: true,
      planPath: outputPath,
      planContent: yamlContent,
      stepCount: planSteps.length
    };

  } catch (error) {
    logger.error(`Failed to export plan: ${error}`);
    return { success: false, error: `${error}` };
  }
};

// Import a plan from YAML content
export const importPlanFromYaml = (yamlContent: string): Plan => {
  try {
    logger.info("=== Starting importPlanFromYaml ===");
    logger.info("Parsing YAML content:", yamlContent.substring(0, 200) + "...");

    let rawPlan: any;
    try {
      rawPlan = yaml.load(yamlContent) as any;
      logger.info("Raw plan loaded successfully");
    } catch (yamlError) {
      throw new Error(`YAML parsing failed: ${yamlError}`);
    }

    logger.info("Raw plan loaded:", JSON.stringify(rawPlan, null, 2));

    // Handle both legacy and new field names
    const planName = rawPlan.name || rawPlan.planName;
    const steps = rawPlan.steps;

    // Validate basic structure
    if (!planName || !steps || !Array.isArray(steps)) {
      throw new Error("Invalid plan structure: missing name/planName or steps");
    }

    logger.info(`Processing ${steps.length} steps`);

    // Normalize steps - convert 'command' to 'tool' if needed
    let normalizedSteps: PlanStep[];
    try {
      normalizedSteps = steps.map((step: any, index: number) => {
        logger.info(`Processing step ${index}:`, JSON.stringify(step, null, 2));

        const toolName = step.tool || step.command;

        if (!toolName || typeof toolName !== "string") {
          throw new Error(`Invalid step at index ${index}: missing or invalid tool/command name`);
        }

        // Create normalized step - start with empty params object
        const normalizedStep: PlanStep = {
          tool: toolName,
          params: {}
        };

        // Copy all properties except tool, command, and label into params
        Object.keys(step).forEach(key => {
          if (key !== "tool" && key !== "command" && key !== "label") {
            normalizedStep.params[key] = step[key];
          }
        });

        logger.info(`Normalized step ${index}:`, JSON.stringify(normalizedStep, null, 2));
        return normalizedStep;
      });
    } catch (stepError) {
      throw new Error(`Step processing failed: ${stepError}`);
    }

    logger.info("=== Plan creation ===");

    const plan: Plan = {
      name: planName,
      description: rawPlan.description || `Plan with ${normalizedSteps.length} steps`,
      steps: normalizedSteps,
      metadata: rawPlan.metadata || {
        createdAt: new Date().toISOString(),
        version: "1.0.0"
      }
    };

    return plan;
  } catch (error) {
    throw new Error(`Failed to parse plan YAML: ${error}`);
  }
};

// Execute a plan
export const executePlan = async (plan: Plan, startStep: number): Promise<PlanExecutionResult> => {
  let executedSteps = 0;

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
      logger.info(`Executing step ${i + 1}/${plan.steps.length}: ${step.tool}`);

      // Get the registered tool
      const tool = ToolRegistry.getTool(step.tool);
      if (!tool) {
        logger.info("Could not find tool: ${step.tool}");
        return {
          success: false,
          executedSteps,
          totalSteps: plan.steps.length,
          failedStep: {
            stepIndex: i,
            tool: step.tool,
            error: `Unknown tool: ${step.tool}`
          }
        };
      }

      try {
        // Parse and validate the parameters
        const parsedParams = tool.schema.parse(step.params);

        // Execute the tool
        const response = await tool.handler(parsedParams);

        // Check if the response indicates failure
        if (response && typeof response === "object" && "success" in response && response.success === false) {
          return {
            success: false,
            executedSteps,
            totalSteps: plan.steps.length,
            failedStep: {
              stepIndex: i,
              tool: step.tool,
              error: "error" in response ? String(response.error) : "Tool execution failed"
            }
          };
        }

        executedSteps++;
      } catch (error) {
        return {
          success: false,
          executedSteps,
          totalSteps: plan.steps.length,
          failedStep: {
            stepIndex: i,
            tool: step.tool,
            error: `${error}`
          }
        };
      }
    }

    logger.info(`Plan execution completed successfully: ${executedSteps}/${plan.steps.length} steps`);
    return {
      success: true,
      executedSteps,
      totalSteps: plan.steps.length
    };

  } catch (error) {
    logger.error(`Plan execution failed: ${error}`);
    return {
      success: false,
      executedSteps,
      totalSteps: plan.steps.length,
      failedStep: {
        stepIndex: -1,
        tool: "unknown",
        error: `${error}`
      }
    };
  }
};
