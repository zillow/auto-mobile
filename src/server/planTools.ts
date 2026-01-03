import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { BootedDevice, ExecutePlanResult } from "../models";
import { importPlanFromYaml, executePlan } from "../utils/planUtils";
import { logger } from "../utils/logger";
import { createJSONToolResponse } from "../utils/toolUtils";
import { Platform } from "../models";

// Execute plan tool schema
const executePlanSchema = z.object({
  planContent: z.string().describe("YAML plan content to execute directly"),
  startStep: z.number().default(0).describe("Step index to start execution from (0-based). If not provided or negative, starts from step 0. Will error if beyond range."),
  platform: z.enum(["android", "ios"]).describe("Target platform"),
  // Framework parameters for device management (optional)
  sessionUuid: z.string().optional().describe("Session UUID for parallel test execution"),
  deviceId: z.string().optional().describe("Specific device ID to use")
});

// Execute plan from YAML file or content
const executePlanTool = async (device: BootedDevice, params: {
  planContent: string;
  startStep: number;
  platform: Platform;
  sessionUuid?: string;
  deviceId?: string;
}): Promise<any> => {
  try {
    logger.info("=== Starting executePlanTool ===");
    logger.info(`Device: ${device.platform} (${device.deviceId}), Start Step: ${params.startStep}, SessionUUID: ${params.sessionUuid}`);

    let yamlContent = params.planContent;
    const startStep = params.startStep;

    // Decode base64 if content is base64-encoded
    if (yamlContent.startsWith("base64:")) {
      logger.info("=== Decoding base64 plan content ===");
      const base64Content = yamlContent.substring(7); // Remove "base64:" prefix
      yamlContent = Buffer.from(base64Content, "base64").toString("utf-8");
      logger.info(`Base64 content decoded (${yamlContent.length} bytes)`);
    }

    // Parse the plan
    logger.info("=== Parsing plan from YAML ===");
    const plan = importPlanFromYaml(yamlContent);
    logger.info(`Plan parsed successfully: '${plan.name}' with ${plan.steps.length} steps`);

    // Execute the plan with device context
    logger.info(`=== Starting plan execution on device ${device.deviceId} ===`);
    const result = await executePlan(plan, startStep, params.platform, device.deviceId, params.sessionUuid);
    logger.info(`Plan execution completed: ${result.success ? "SUCCESS" : "FAILED"} (${result.executedSteps}/${result.totalSteps} steps)`);

    const response: ExecutePlanResult = {
      success: result.success,
      executedSteps: result.executedSteps,
      totalSteps: result.totalSteps,
      failedStep: result.failedStep,
      error: result.failedStep ? result.failedStep.error : undefined,
      platform: device.platform
    };

    logger.info("=== Returning from executePlanTool ===");
    return createJSONToolResponse(response);
  } catch (error) {
    logger.error("=== Failed to execute plan ===", error);

    const response: ExecutePlanResult = {
      success: false,
      executedSteps: 0,
      totalSteps: 0,
      error: `${error}`,
      platform: device.platform
    };

    logger.info("=== Returning error from executePlanTool ===");
    return createJSONToolResponse(response);
  }
};

// Register plan tools. Note that only AutoMobile CLI includes this since we do not execute plans in MCP mode.
export const registerPlanTools = () => {
  ToolRegistry.registerDeviceAware(
    "executePlan",
    "Execute a series of tool calls from a YAML plan content. Stops execution if any step fails (success: false). Optionally can resume execution from a specific step index.",
    executePlanSchema,
    executePlanTool
  );
};
