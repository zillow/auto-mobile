import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { ActionableError } from "../models";
import { logger } from "../utils/logger";

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
import { registerDaemonTools } from "./daemonTools";
import { registerPlanTools } from "./planTools";
import { registerDoctorTools } from "./doctorTools";

// Import resource registration functions
import { registerObservationResources } from "./observationResources";
import { registerBootedDeviceResources } from "./bootedDeviceResources";
import { registerDeviceImageResources } from "./deviceImageResources";
import { registerAppResources } from "./appResources";

export interface McpServerOptions {
  debug?: boolean;
}

export const createMcpServer = (options: McpServerOptions = {}): McpServer => {
  // Get configuration and device session managers

  // Register all tool categories
  registerObserveTools();
  registerInteractionTools();
  registerAppTools();
  registerUtilityTools();
  registerDeviceTools();
  registerDeepLinkTools();
  registerNavigationTools();
  registerDaemonTools();
  registerPlanTools();
  registerDoctorTools();

  // Register all resources
  registerObservationResources();
  registerBootedDeviceResources();
  registerDeviceImageResources();
  registerAppResources();

  // Only register debug tools when --debug flag is passed
  if (options.debug) {
    registerDebugTools();
  }

  // Create a new MCP server
  const server = new McpServer({
    name: "AutoMobile",
    version: "0.0.1"
  }, {
    capabilities: {
      resources: {},
      tools: {},
      prompts: {}
    }
  });

  // Register all tools with the server
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

    // Parse and validate the parameters
    let parsedParams;
    try {
      parsedParams = tool.schema.parse(toolParams);
    } catch (error) {
      throw new ActionableError(`Invalid parameters for tool ${name}: ${error}`);
    }

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

    return await tool.handler(parsedParams, progressCallback);
  });

  return server;
};
