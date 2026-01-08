import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { ActionableError, BootedDevice, ExecutePlanResult } from "../models";
import { importPlanFromYaml, executePlan } from "../utils/planUtils";
import { logger } from "../utils/logger";
import { createJSONToolResponse } from "../utils/toolUtils";
import { Platform } from "../models";
import { TestExecutionRepository, TestExecutionStatus } from "../db/testExecutionRepository";
import { DEVICE_LABEL_DESCRIPTION } from "./toolSchemaHelpers";
import { registerDeviceLabelMap } from "./deviceLabelMapping";

const testMetadataSchema = z.object({
  testClass: z.string(),
  testMethod: z.string(),
  appVersion: z.string().optional(),
  gitCommit: z.string().optional(),
  targetSdk: z.coerce.number().int().positive().optional(),
  jdkVersion: z.string().optional(),
  jvmTarget: z.string().optional(),
  gradleVersion: z.string().optional(),
  isCi: z.boolean().optional(),
});

type TestExecutionMetadata = z.infer<typeof testMetadataSchema>;

// Execute plan tool schema
const executePlanSchema = z.object({
  planContent: z.string().describe("YAML plan content to execute directly"),
  startStep: z.number().default(0).describe("Step index to start execution from (0-based). If not provided or negative, starts from step 0. Will error if beyond range."),
  platform: z.enum(["android", "ios"]).describe("Target platform"),
  // Framework parameters for device management (optional)
  sessionUuid: z.string().optional().describe("Session UUID for parallel test execution"),
  deviceId: z.string().optional().describe("Specific device ID to use"),
  device: z.string().optional().describe(DEVICE_LABEL_DESCRIPTION),
  devices: z.array(z.string()).optional().describe("Device labels to allocate for multi-device plans (e.g., [\"A\", \"B\"]). Use only when controlling multiple devices."),
  abortStrategy: z.enum(["immediate", "finish-current-step"]).default("immediate").describe("Strategy for aborting when a device fails in multi-device plans. 'immediate': abort all devices immediately (default). 'finish-current-step': let other devices finish their current step before aborting."),
  testMetadata: testMetadataSchema.optional().describe("Optional test metadata for execution timing history"),
  cleanupAppId: z.string().optional().describe("App package ID to terminate after plan execution"),
  cleanupClearAppData: z.boolean().optional().describe("Clear app data during cleanup (Android only)")
});

const testExecutionRepository = new TestExecutionRepository();

const getDeviceType = (device: BootedDevice): "emulator" | "simulator" | "device" => {
  if (device.platform === "android") {
    return device.deviceId.startsWith("emulator-") ? "emulator" : "device";
  }
  return device.deviceId.includes("-") && device.deviceId.length > 30 ? "simulator" : "device";
};

// Execute plan from YAML file or content
const executePlanTool = async (device: BootedDevice, params: {
  planContent: string;
  startStep: number;
  platform: Platform;
  sessionUuid?: string;
  deviceId?: string;
  device?: string;
  devices?: string[];
  abortStrategy?: "immediate" | "finish-current-step";
  testMetadata?: TestExecutionMetadata;
  cleanupAppId?: string;
  cleanupClearAppData?: boolean;
}, _progress?: unknown, signal?: AbortSignal): Promise<any> => {
  const startTime = Date.now();
  const recordTestExecution = async (status: TestExecutionStatus, durationMs: number) => {
    if (!params.testMetadata) {
      return;
    }
    try {
      await testExecutionRepository.recordExecution({
        testClass: params.testMetadata.testClass,
        testMethod: params.testMetadata.testMethod,
        durationMs,
        status,
        timestamp: Date.now(),
        deviceId: device.deviceId,
        deviceName: device.name,
        devicePlatform: device.platform,
        deviceType: getDeviceType(device),
        appVersion: params.testMetadata.appVersion,
        gitCommit: params.testMetadata.gitCommit,
        targetSdk: params.testMetadata.targetSdk,
        jdkVersion: params.testMetadata.jdkVersion,
        jvmTarget: params.testMetadata.jvmTarget,
        gradleVersion: params.testMetadata.gradleVersion,
        isCi: params.testMetadata.isCi,
        sessionUuid: params.sessionUuid,
      });
    } catch (error) {
      logger.warn(`Failed to record test execution timing: ${error}`);
    }
  };

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

    if (params.devices && params.devices.length > 0) {
      if (!params.sessionUuid) {
        throw new ActionableError("Device labels require a sessionUuid to be provided.");
      }
      if (params.device && !params.devices.includes(params.device)) {
        throw new ActionableError(
          `Device label '${params.device}' was not declared in devices list: ${params.devices.join(", ")}`
        );
      }
      await registerDeviceLabelMap(params.sessionUuid, params.devices, params.device);
    } else if (params.device) {
      throw new ActionableError("Device label requires a devices list to be provided.");
    }

    // Execute the plan with device context
    logger.info(`=== Starting plan execution on device ${device.deviceId} ===`);
    const result = await executePlan(plan, startStep, params.platform, device.deviceId, params.sessionUuid, signal, params.abortStrategy);
    logger.info(`Plan execution completed: ${result.success ? "SUCCESS" : "FAILED"} (${result.executedSteps}/${result.totalSteps} steps)`);

    await recordTestExecution(result.success ? "passed" : "failed", Date.now() - startTime);

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

    await recordTestExecution("failed", Date.now() - startTime);

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
