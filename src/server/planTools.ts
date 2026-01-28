import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { ActionableError, BootedDevice, ExecutePlanResult } from "../models";
import { importPlanFromYaml, executePlan } from "../utils/planUtils";
import { logger } from "../utils/logger";
import { createStructuredToolResponse } from "../utils/toolUtils";
import { Platform } from "../models";
import { TestExecutionRepository, TestExecutionStatus, TestStepRecord } from "../db/testExecutionRepository";
import { DEVICE_LABEL_DESCRIPTION } from "./toolSchemaHelpers";
import { registerDeviceLabelMap, buildDeviceLabelMap } from "./deviceLabelMapping";
import { PlanSchemaValidator } from "../utils/plan/PlanSchemaValidator";
import { DaemonState } from "../daemon/daemonState";
import { normalizePlanDevices } from "../utils/plan/PlanDevices";
import { ExecutePlanStepDebugInfo } from "../models/ExecutePlanResult";
import { serverConfig } from "../utils/ServerConfig";
import { startVideoRecording, stopVideoRecording } from "./videoRecordingManager";

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
  planContent: z.string().describe("YAML plan content"),
  startStep: z.number().default(0).describe("Start step index (0-based, default: 0)"),
  platform: z.enum(["android", "ios"]).describe("Platform"),
  sessionUuid: z.string().optional().describe("Session UUID for parallel execution"),
  keepScreenAwake: z.boolean().optional().describe("Keep physical Android devices awake during the session (default: true)"),
  deviceId: z.string().optional().describe("Device ID"),
  device: z.string().optional().describe(DEVICE_LABEL_DESCRIPTION),
  devices: z.array(z.string()).optional().describe("Device labels for multi-device plans"),
  deviceAllocationTimeoutMs: z.number().default(300000).describe("Timeout in milliseconds for allocating all devices (default: 300000 = 5 minutes)"),
  abortStrategy: z.enum(["immediate", "finish-current-step"]).default("immediate").describe("Abort strategy: immediate (default) or finish-current-step"),
  testMetadata: testMetadataSchema.optional().describe("Test metadata for timing history"),
  cleanupAppId: z.string().optional().describe("App ID to terminate after execution"),
  cleanupClearAppData: z.boolean().optional().describe("Clear app data on cleanup")
});

const executePlanDebugStepSchema = z.object({
  step: z.string(),
  status: z.enum(["completed", "failed", "skipped"]),
  durationMs: z.number().int(),
  details: z.any().optional()
});

const executePlanDebugSchema = z.object({
  executionTimeMs: z.number().int(),
  steps: z.array(executePlanDebugStepSchema),
  deviceState: z.object({
    currentActivity: z.string().optional(),
    focusedWindow: z.string().optional()
  }).optional()
});

const executePlanResultSchema = z.object({
  success: z.boolean(),
  executedSteps: z.number().int(),
  totalSteps: z.number().int(),
  failedStep: z.object({
    stepIndex: z.number().int(),
    tool: z.string(),
    error: z.string(),
    device: z.string().optional()
  }).optional(),
  error: z.string().optional(),
  platform: z.enum(["android", "ios"]).optional(),
  deviceId: z.string().optional(),
  deviceMapping: z.record(z.string(), z.string()).optional(),
  debug: executePlanDebugSchema.optional()
}).passthrough();

const testExecutionRepository = new TestExecutionRepository();

const getDeviceType = (device: BootedDevice): "emulator" | "simulator" | "device" => {
  if (device.platform === "android") {
    return device.deviceId.startsWith("emulator-") ? "emulator" : "device";
  }
  return device.deviceId.includes("-") && device.deviceId.length > 30 ? "simulator" : "device";
};

// Execute plan from YAML file or content
function convertDebugStepsToRecords(
  debugSteps: ExecutePlanStepDebugInfo[] | undefined
): TestStepRecord[] {
  if (!debugSteps || debugSteps.length === 0) {
    return [];
  }

  return debugSteps.map((step, index) => {
    // Extract tool name from step description like "Execute step N: toolName"
    const toolMatch = step.step.match(/:\s*(\w+)$/);
    const action = toolMatch ? toolMatch[1] : step.step;

    // Extract target from details.params if available
    const details = step.details as { params?: Record<string, unknown>; error?: string } | undefined;
    const params = details?.params;
    let target: string | null = null;
    if (params) {
      // Try to build a target description from common params
      if (params.text) {
        target = `text="${params.text}"`;
      } else if (params.elementId) {
        target = `id="${params.elementId}"`;
      } else if (params.direction) {
        target = `direction=${params.direction}`;
      }
    }

    return {
      stepIndex: index,
      action,
      target,
      status: step.status,
      durationMs: step.durationMs,
      screenName: null, // TODO: Track screen name during execution
      screenshotPath: null, // TODO: Capture screenshots during execution
      errorMessage: details?.error ?? null,
      details: step.details,
    };
  });
}

const executePlanTool = async (device: BootedDevice, params: {
  planContent: string;
  startStep: number;
  platform: Platform;
  sessionUuid?: string;
  keepScreenAwake?: boolean;
  deviceId?: string;
  device?: string;
  devices?: string[];
  deviceAllocationTimeoutMs: number;
  abortStrategy?: "immediate" | "finish-current-step";
  testMetadata?: TestExecutionMetadata;
  cleanupAppId?: string;
  cleanupClearAppData?: boolean;
}, _progress?: unknown, signal?: AbortSignal): Promise<any> => {
  const startTime = Date.now();
  const recordTestExecution = async (
    status: TestExecutionStatus,
    durationMs: number,
    options?: {
      steps?: TestStepRecord[];
      errorMessage?: string;
      videoPath?: string;
    }
  ) => {
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
        errorMessage: options?.errorMessage,
        steps: options?.steps,
        videoPath: options?.videoPath,
      });
    } catch (error) {
      logger.warn(`Failed to record test execution timing: ${error}`);
    }
  };

  try {
    const perfStart = Date.now();
    logger.info("=== Starting executePlanTool ===");
    logger.info(`[PERF +0ms] Device: ${device.platform} (${device.deviceId}), Start Step: ${params.startStep}, SessionUUID: ${params.sessionUuid}`);

    let yamlContent = params.planContent;
    const startStep = params.startStep;

    // Decode base64 if content is base64-encoded
    if (yamlContent.startsWith("base64:")) {
      logger.info(`[PERF +${Date.now() - perfStart}ms] Decoding base64 plan content`);
      const base64Content = yamlContent.substring(7); // Remove "base64:" prefix
      yamlContent = Buffer.from(base64Content, "base64").toString("utf-8");
      logger.info(`[PERF +${Date.now() - perfStart}ms] Base64 content decoded (${yamlContent.length} bytes)`);
    }

    // Validate YAML schema before parsing
    logger.info(`[PERF +${Date.now() - perfStart}ms] Validating plan YAML schema`);
    const validator = new PlanSchemaValidator();
    await validator.loadSchema();
    const validationResult = validator.validateYaml(yamlContent);

    if (!validationResult.valid) {
      const errorMessages = validationResult.errors?.map(err =>
        `${err.field}: ${err.message}${err.line !== undefined ? ` (line ${err.line})` : ""}`
      ).join("\n") || "Unknown validation error";

      throw new ActionableError(
        `Plan YAML validation failed:\n${errorMessages}\n\n` +
        "The plan does not conform to the AutoMobile test plan schema. " +
        "Check the schema at schemas/test-plan.schema.json for details."
      );
    }
    logger.info(`[PERF +${Date.now() - perfStart}ms] Plan YAML schema validation passed`);

    // Parse the plan
    logger.info(`[PERF +${Date.now() - perfStart}ms] Parsing plan from YAML`);
    const plan = importPlanFromYaml(yamlContent);
    logger.info(`[PERF +${Date.now() - perfStart}ms] Plan parsed: '${plan.name}' with ${plan.steps.length} steps`);

    const normalizedPlanDevices = normalizePlanDevices(plan.devices);
    const planDeviceLabels = normalizedPlanDevices.labels;
    const effectiveDeviceLabels = params.devices && params.devices.length > 0
      ? params.devices
      : planDeviceLabels;

    if (params.devices && planDeviceLabels.length > 0) {
      const declared = [...new Set(planDeviceLabels)].sort();
      const provided = [...new Set(params.devices)].sort();
      const sameLength = declared.length === provided.length;
      const sameValues = sameLength && declared.every((label, index) => label === provided[index]);
      if (!sameValues) {
        throw new ActionableError(
          `Devices list does not match plan devices. ` +
          `Plan devices: [${declared.join(", ")}], provided: [${provided.join(", ")}].`
        );
      }
    }

    // Device allocation for multi-device plans
    let deviceMapping: Record<string, string> | undefined;

    if (effectiveDeviceLabels && effectiveDeviceLabels.length > 0) {
      if (!params.sessionUuid) {
        throw new ActionableError("Device labels require a sessionUuid to be provided.");
      }
      if (params.device && !effectiveDeviceLabels.includes(params.device)) {
        throw new ActionableError(
          `Device label '${params.device}' was not declared in devices list: ${effectiveDeviceLabels.join(", ")}`
        );
      }

      // Upfront device allocation for fail-fast behavior
      logger.info(`[PERF +${Date.now() - perfStart}ms] Allocating devices upfront`);

      if (!DaemonState.getInstance().isInitialized()) {
        throw new ActionableError("Multi-device plans require an active daemon session.");
      }

      const devicePool = DaemonState.getInstance().getDevicePool();
      const sessionManager = DaemonState.getInstance().getSessionManager();

      // Build device label map to get session UUIDs
      const labelToSessionMap = buildDeviceLabelMap(effectiveDeviceLabels, params.sessionUuid, params.device);
      const sessionIds = Object.values(labelToSessionMap);

      logger.info(
        `Requesting allocation of ${sessionIds.length} devices for labels: ${Object.keys(labelToSessionMap).join(", ")} ` +
        `(timeout: ${params.deviceAllocationTimeoutMs / 1000}s)`
      );

      // Allocate all devices upfront with shared timeout
      let sessionToDeviceMap: Map<string, string>;
      if (normalizedPlanDevices.hasDefinitions) {
        const definitionMap = new Map(
          normalizedPlanDevices.definitions.map(definition => [definition.label, definition])
        );
        const requests = effectiveDeviceLabels.map(label => {
          const definition = definitionMap.get(label);
          if (!definition) {
            throw new ActionableError(
              `Device definition for label '${label}' not found in plan devices.`
            );
          }
          return {
            sessionId: labelToSessionMap[label],
            criteria: {
              platform: definition.platform,
              simulatorType: definition.simulatorType,
              iosVersion: definition.iosVersion,
            },
          };
        });

        sessionToDeviceMap = await devicePool.assignMultipleDevicesByCriteria(
          requests,
          params.deviceAllocationTimeoutMs
        );
      } else {
        sessionToDeviceMap = await devicePool.assignMultipleDevices(
          sessionIds,
          params.deviceAllocationTimeoutMs,
          params.platform
        );
      }

      // Verify sessions were created in SessionManager for each allocated device
      for (const sessionUuid of sessionToDeviceMap.keys()) {
        // Device was already assigned in assignMultipleDevices via tryAssignDevice
        // which calls sessionManager.createSession, so we just need to verify
        const session = sessionManager.getSession(sessionUuid);
        if (!session) {
          throw new ActionableError(
            `Internal error: Session ${sessionUuid} not found after device allocation`
          );
        }
      }

      // Build the device mapping for the result (label -> deviceId)
      deviceMapping = {};
      for (const [label, sessionUuid] of Object.entries(labelToSessionMap)) {
        const deviceId = sessionToDeviceMap.get(sessionUuid);
        if (!deviceId) {
          throw new ActionableError(
            `Internal error: No device allocated for session ${sessionUuid} (label: ${label})`
          );
        }
        deviceMapping[label] = deviceId;
      }

      // Log the allocation result
      logger.info(`[PERF +${Date.now() - perfStart}ms] Device allocation complete`);
      for (const [label, deviceId] of Object.entries(deviceMapping)) {
        const sessionUuid = labelToSessionMap[label];
        logger.info(`[PERF +${Date.now() - perfStart}ms]   ${label} → ${deviceId} (session: ${sessionUuid})`);
      }

      // Register the device label map (sessions are already created, this just caches the mapping)
      await registerDeviceLabelMap(
        params.sessionUuid,
        effectiveDeviceLabels,
        params.device,
        { keepScreenAwake: params.keepScreenAwake, platform: params.platform }
      );
    } else if (params.device) {
      throw new ActionableError("Device label requires a devices list to be provided.");
    }

    // Start video recording if enabled
    const testVideoRecordingEnabled = serverConfig.isTestVideoRecordingEnabled();
    let videoRecordingId: string | undefined;
    if (testVideoRecordingEnabled) {
      try {
        logger.info(`[PERF +${Date.now() - perfStart}ms] Starting automatic video recording for test`);
        const recording = await startVideoRecording({
          device,
          outputName: `test-${plan.name}-${Date.now()}`,
          maxDurationSeconds: 300, // 5 minutes max
        });
        videoRecordingId = recording.recordingId;
        logger.info(`[PERF +${Date.now() - perfStart}ms] Video recording started: ${videoRecordingId}`);
      } catch (videoError) {
        logger.warn(`[PERF +${Date.now() - perfStart}ms] Failed to start automatic video recording: ${videoError}`);
        // Continue with plan execution even if video recording fails to start
      }
    }

    // Execute the plan with device context, ensuring video recording is stopped in finally block
    let result;
    let videoFilePath: string | undefined;
    try {
      logger.info(`[PERF +${Date.now() - perfStart}ms] Starting plan execution on device ${device.deviceId} (${device.platform})`);
      result = await executePlan(plan, startStep, params.platform, device.deviceId, params.sessionUuid, signal, params.abortStrategy);
      const execDuration = Date.now() - perfStart;
      logger.info(`[PERF +${execDuration}ms] Plan execution completed: ${result.success ? "SUCCESS" : "FAILED"} (${result.executedSteps}/${result.totalSteps} steps)`);
    } finally {
      // Stop video recording regardless of plan execution outcome
      if (videoRecordingId) {
        try {
          logger.info(`[PERF +${Date.now() - perfStart}ms] Stopping automatic video recording: ${videoRecordingId}`);
          const stopResult = await stopVideoRecording(videoRecordingId);
          videoFilePath = stopResult.metadata.filePath;
          logger.info(`[PERF +${Date.now() - perfStart}ms] Video recording stopped successfully: ${videoFilePath}`);
        } catch (videoError) {
          logger.warn(`[PERF +${Date.now() - perfStart}ms] Failed to stop automatic video recording: ${videoError}`);
          // Don't throw - let the original result/error propagate
        }
      }
    }

    // Capture step data and error message for recording
    const steps = convertDebugStepsToRecords(result.debug?.steps);
    const errorMessage = result.failedStep?.error ?? undefined;

    await recordTestExecution(result.success ? "passed" : "failed", Date.now() - startTime, {
      steps,
      errorMessage,
      videoPath: videoFilePath,
    });

    const response: ExecutePlanResult = {
      success: result.success,
      executedSteps: result.executedSteps,
      totalSteps: result.totalSteps,
      failedStep: result.failedStep,
      error: result.failedStep ? result.failedStep.error : undefined,
      platform: device.platform,
      deviceId: device.deviceId,
      deviceMapping
    };

    logger.info(`[PERF +${Date.now() - perfStart}ms] Returning from executePlanTool (deviceId=${device.deviceId})`);
    return createStructuredToolResponse(response);
  } catch (error) {
    logger.error(`[PERF] Failed to execute plan: ${error}`);

    await recordTestExecution("failed", Date.now() - startTime, {
      errorMessage: String(error),
    });

    const response: ExecutePlanResult = {
      success: false,
      executedSteps: 0,
      totalSteps: 0,
      error: `${error}`,
      platform: device.platform,
      deviceId: device.deviceId
    };

    logger.info(`[PERF] Returning error from executePlanTool (deviceId=${device.deviceId})`);
    return createStructuredToolResponse(response);
  }
};

// Register plan tools for daemon-backed MCP servers and CLI usage.
export const registerPlanTools = () => {
  ToolRegistry.registerDeviceAware(
    "executePlan",
    "Execute a series of tool calls from a YAML plan content. Stops execution if any step fails (success: false). Optionally can resume execution from a specific step index.",
    executePlanSchema,
    executePlanTool,
    false,
    false,
    { outputSchema: executePlanResultSchema }
  );
};
