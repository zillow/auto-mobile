import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { ZodError } from "zod";
import { ActionableError } from "../models";
import { logger } from "../utils/logger";
import { executionTracker } from "./executionTracker";
import { runWithAbortSignal } from "../utils/AbortContext";
import { createDefaultPlanExecutionLock, type PlanExecutionLock } from "./PlanExecutionLock";

// Import the tool registry
import { ToolRegistry } from "./toolRegistry";

// Import the resource registry
import { ResourceRegistry } from "./resourceRegistry";

// Import all tool registration functions
import { registerObserveTools } from "./observeTools";
import { registerInteractionTools } from "./interactionTools";
import { registerAppTools } from "./appTools";
import { registerUtilityTools } from "./utilityTools";
import { registerDeviceTools } from "./deviceTools";
import { registerDeepLinkTools } from "./deepLinkTools";
import { registerDebugTools } from "./debugTools";
import { registerNavigationTools } from "./navigationTools";
import { registerNotificationTools } from "./notificationTools";
import { registerDaemonTools } from "./daemonTools";
import { registerPlanTools } from "./planTools";
import { registerDoctorTools } from "./doctorTools";
import { registerFeatureFlagTools } from "./featureFlagTools";
import { registerCriticalSectionTools } from "./criticalSectionTools";
import { registerVideoRecordingTools } from "./videoRecordingTools";
import { registerSnapshotTools } from "./snapshotTools";
import { registerBiometricTools } from "./biometricTools";
import { getMcpServerVersion } from "../utils/mcpVersion";

// Import resource registration functions
import { registerObservationResources } from "./observationResources";
import { registerBootedDeviceResources } from "./bootedDeviceResources";
import { registerDeviceImageResources } from "./deviceImageResources";
import { registerAppResources } from "./appResources";
import { registerNavigationResources } from "./navigationResources";
import { registerTestTimingResources } from "./testTimingResources";
import { registerPerformanceResources } from "./performanceResources";
import { registerVideoRecordingResources } from "./videoRecordingResources";
import { FeatureFlagService } from "../features/featureFlags/FeatureFlagService";
import { startupBenchmark } from "../utils/startupBenchmark";

export interface McpServerOptions {
  debug?: boolean;
  sessionContext?: { sessionId?: string };
  planExecutionLock?: PlanExecutionLock;
  daemonMode?: boolean;
}

function formatToolParamError(toolName: string, error: unknown): string {
  if (!(error instanceof ZodError)) {
    return String(error);
  }

  const issues = error.issues.map(issue => {
    const path = issue.path.length ? issue.path.join(".") : "parameters";
    if (issue.code === "invalid_type") {
      return `${path} expected ${issue.expected}, received ${issue.received}`;
    }
    return `${path} ${issue.message}`;
  });

  const hints: string[] = [];
  if (toolName === "swipeOn" || toolName === "tapOn") {
    const containerIssue = error.issues.find(issue => issue.path[0] === "container");
    if (containerIssue) {
      hints.push("container must be an object like { \"elementId\": \"<id>\" } or { \"text\": \"<text>\" }");
    }
  }

  const issueSummary = issues.join("; ");
  const hintSummary = hints.length > 0 ? ` Hint: ${hints.join(" ")}` : "";
  return `${issueSummary}${hintSummary}`;
}

export const createMcpServer = (options: McpServerOptions = {}): McpServer => {
  // Plan execution lock with per-session scope to prevent interference during executePlan
  // Each test thread gets its own sessionUuid, enabling parallel execution on different devices
  const planExecutionLock = options.planExecutionLock ?? createDefaultPlanExecutionLock();
  const daemonMode = options.daemonMode ?? false;
  void FeatureFlagService.getInstance()
    .initialize()
    .catch(error => {
      logger.warn(`Failed to initialize feature flags: ${error}`);
    });
  // Get configuration and device session managers

  // Register all tool categories
  startupBenchmark.startPhase("toolRegistration");
  registerObserveTools();
  registerInteractionTools();
  registerAppTools();
  registerUtilityTools();
  registerDeviceTools();
  registerDeepLinkTools();
  registerNavigationTools();
  registerNotificationTools();
  registerDaemonTools();
  if (daemonMode) {
    registerPlanTools();
    registerCriticalSectionTools();
  }
  registerDoctorTools();
  registerFeatureFlagTools();
  registerVideoRecordingTools();
  registerSnapshotTools();
  registerBiometricTools();
  registerDebugTools();
  startupBenchmark.endPhase("toolRegistration");

  // Register all resources
  startupBenchmark.startPhase("resourceRegistration");
  registerObservationResources();
  registerBootedDeviceResources();
  registerDeviceImageResources();
  registerAppResources();
  registerNavigationResources();
  registerTestTimingResources();
  registerPerformanceResources();
  registerVideoRecordingResources();
  startupBenchmark.endPhase("resourceRegistration");

  // Create a new MCP server
  startupBenchmark.startPhase("sdkInitialization");
  const server = new McpServer({
    name: "AutoMobile",
    version: getMcpServerVersion()
  }, {
    capabilities: {
      resources: {},
      tools: {},
      prompts: {}
    }
  });
  startupBenchmark.endPhase("sdkInitialization");

  // Register all tools with the server
  startupBenchmark.startPhase("serverHandlerRegistration");
  ToolRegistry.registerWithServer(server);

  // Register all resources with the server
  ResourceRegistry.registerWithServer(server);

  // Register tool definitions using the lower-level interface
  server.server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: ToolRegistry.getToolDefinitions()
    };
  });

  // Add ping handler as per MCP specification
  // Note: Using runtime access since TypeScript import has issues
  const PingRequestSchema = require("@modelcontextprotocol/sdk/types.js").PingRequestSchema;
  server.server.setRequestHandler(PingRequestSchema, async () => {
    return {};
  });

  // Register prompts list handler (currently returns empty list since no prompts are implemented)
  // Note: Using runtime access since TypeScript import has issues
  const ListPromptsRequestSchema = require("@modelcontextprotocol/sdk/types.js").ListPromptsRequestSchema;
  server.server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: []
    };
  });

  server.server.setRequestHandler(CallToolRequestSchema, async request => {
    logger.info("Request: ", request);

    // Extract tool name and arguments from the request
    const name = request.params.name;
    const toolParams = request.params.arguments || {};

    // Check if name is undefined
    if (!name) {
      throw new ActionableError("Tool name is missing in the request");
    }

    // Get the registered tool
    const tool = ToolRegistry.getTool(name);
    if (!tool) {
      throw new ActionableError(`Unknown tool: ${name}`);
    }

    const sessionId = options.sessionContext?.sessionId;
    const rawSessionUuid =
      toolParams &&
      typeof toolParams === "object" &&
      "sessionUuid" in toolParams
        ? (toolParams as { sessionUuid?: string }).sessionUuid
        : undefined;
    const sessionUuid = typeof rawSessionUuid === "string" ? rawSessionUuid : undefined;

    // Check if tool call should be blocked due to active executePlan in this session
    const decision = planExecutionLock.evaluate({
      toolName: name,
      sessionId,
      sessionUuid,
    });
    if (decision.blocked) {
      logger.warn(
        `[MCP] Rejecting tool ${name} due to active executePlan (scope=${decision.scope}, sessionId=${sessionId ?? "none"}, sessionUuid=${sessionUuid ?? "none"})`
      );
      throw new ActionableError(decision.reason ?? "plan execution in progress");
    }

    // Parse and validate the parameters
    let parsedParams;
    try {
      parsedParams = tool.schema.parse(toolParams);
    } catch (error) {
      throw new ActionableError(`Invalid parameters for tool ${name}: ${formatToolParamError(name, error)}`);
    }

    const execution = executionTracker.startExecution(name, sessionId, sessionUuid);

    // Create progress callback if tool supports progress
    const progressCallback = tool.supportsProgress
      ? async (progress: number, total?: number, message?: string) => {
        try {
          await server.server.notification({
            method: "notifications/progress",
            params: {
              progressToken: `${name}-${Date.now()}`,
              progress,
              total,
              ...(message && { message })
            }
          });
        } catch (error) {
          // Log progress notification errors but don't fail the tool execution
          logger.warn(`Failed to send progress notification: ${error}`);
        }
      }
      : undefined;

    try {
      return await runWithAbortSignal(
        execution.abortController.signal,
        () => tool.handler(parsedParams, progressCallback, execution.abortController.signal)
      );
    } finally {
      executionTracker.endExecution(execution.id);
    }
  });
  startupBenchmark.endPhase("serverHandlerRegistration");

  return server;
};
