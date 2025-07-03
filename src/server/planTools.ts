import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { ExecutePlanResult } from "../models";
import { importPlanFromYaml, executePlan } from "../utils/planUtils";
import { logger } from "../utils/logger";
import { createJSONToolResponse } from "../utils/toolUtils";

// Execute plan tool schema
const executePlanSchema = z.object({
  planContent: z.string().describe("YAML plan content to execute directly"),
  startStep: z.number().default(0).describe("Step index to start execution from (0-based). If not provided or negative, starts from step 0. Will error if beyond range.")
});

// Execute plan from YAML file or content
const executePlanTool = async (params: { planContent: string; startStep: number }): Promise<any> => {
  try {
    logger.info("=== Starting executePlanTool ===");
    const yamlContent = params.planContent;
    const startStep = params.startStep;

    // Parse the plan
    logger.info("=== Parsing plan from YAML ===");
    const plan = importPlanFromYaml(yamlContent);
    logger.info("=== Plan parsed successfully ===");

    logger.info(`Executing plan '${plan.name}' with ${plan.steps.length} steps`);

    // Execute the plan
    logger.info("=== Starting plan execution ===");
    const result = await executePlan(plan, startStep);
    logger.info("=== Plan execution completed ===");

    const response: ExecutePlanResult = {
      success: result.success,
      executedSteps: result.executedSteps,
      totalSteps: result.totalSteps,
      failedStep: result.failedStep,
      error: result.failedStep ? result.failedStep.error : undefined
    };


    logger.info("=== Creating JSON response ===");
    const jsonResponse = createJSONToolResponse(response);
    logger.info("=== Returning from executePlanTool ===");
    return jsonResponse;
  } catch (error) {
    logger.info("=== Failed to execute plan ===");
    const response: ExecutePlanResult = {
      success: false,
      executedSteps: 0,
      totalSteps: 0,
      error: `${error}`
    };
    const jsonResponse = createJSONToolResponse(response);
    logger.info("=== Returning error from executePlanTool ===");
    return jsonResponse;
  }
};

// Register plan tools. Note that only AutoMobile CLI includes this since we do not execute plans in MCP mode.
export const registerPlanTools = () => {
  ToolRegistry.register(
    "executePlan",
    "Execute a series of tool calls from a YAML plan content. Stops execution if any step fails (success: false). Optionally can resume execution from a specific step index.",
    executePlanSchema,
    executePlanTool
  );
};
