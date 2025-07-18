import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { ActionableError } from "../models";
import { logger } from "../utils/logger";
import { logToolCall } from "../utils/toolLogger";
import { ConfigurationManager } from "../utils/configurationManager";
import { TestAuthoringManager } from "../utils/testAuthoringManager";
import { DeviceSessionManager } from "../utils/deviceSessionManager";

// Import the tool registry
import { ToolRegistry } from "./toolRegistry";

// Import all tool registration functions
import { registerObserveTools } from "./observeTools";
import { registerInteractionTools } from "./interactionTools";
import { registerAppTools } from "./appTools";
import { registerUtilityTools } from "./utilityTools";
import { registerEmulatorTools } from "./emulatorTools";
import { registerConfigurationTools } from "./configurationTools";
import { registerDeepLinkTools } from "./deepLinkTools";

export const createMcpServer = (): McpServer => {
  // Get configuration, device session, and test authoring managers
  const testAuthoringManager = TestAuthoringManager.getInstance();

  // Register all tool categories
  registerObserveTools();
  registerInteractionTools();
  registerAppTools();
  registerUtilityTools();
  registerEmulatorTools();
  registerConfigurationTools();
  registerDeepLinkTools();

  // Create a new MCP server
  const server = new McpServer({
    name: "AutoMobile",
    version: "0.0.1"
  }, {
    capabilities: {
      resources: {
        templates: {}
      },
      tools: {},
      prompts: {},
      sampling: {}
    }
  });

  // Register all tools with the server
  ToolRegistry.registerWithServer(server);

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

  // Register resources list handler (currently returns empty list since no resources are implemented)
  server.server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: []
    };
  });

  // Register resource templates list handler (currently returns empty list since no templates are implemented)
  // Note: Using runtime access since TypeScript import has issues
  const ListResourceTemplatesRequestSchema = require("@modelcontextprotocol/sdk/types.js").ListResourceTemplatesRequestSchema;
  server.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
    return {
      resourceTemplates: []
    };
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

    // Start test authoring session if enabled and not already active
    if (ConfigurationManager.getInstance().isTestAuthoringEnabled() && !testAuthoringManager.isActive()) {
      const appConfig = ConfigurationManager.getInstance().getServerConfig();
      if (appConfig.appId) {
        await testAuthoringManager.startAuthoringSession(appConfig.appId);
      }
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

    try {
      // Execute the handler with optional progress callback
      const deviceSessionManager = DeviceSessionManager.getInstance();
      const deviceId = deviceSessionManager.ensureDeviceReady();
      let response: any | undefined;
      if (deviceId === undefined) {
        throw new ActionableError("No device available");
      } else {
        response = await tool.handler(parsedParams, progressCallback);
      }

      // Log successful tool call
      await logToolCall(name, parsedParams, {
        success: true,
        data: response
      });

      // Log tool call to test authoring session if active
      if (testAuthoringManager.isActive()) {
        await testAuthoringManager.logToolCall(name, parsedParams, {
          success: true,
          data: response
        });
      }

      return response;
    } catch (error) {
      // Log failed tool call
      await logToolCall(name, parsedParams, {
        success: false,
        error: error instanceof ActionableError ? error.message : `${error}`
      });

      // Log failed tool call to test authoring session if active
      if (testAuthoringManager.isActive()) {
        await testAuthoringManager.logToolCall(name, parsedParams, {
          success: false,
          error: error instanceof ActionableError ? error.message : `${error}`
        });
      }

      if (error instanceof ActionableError) {
        throw error;
      }
      throw new ActionableError(`Failed to execute tool ${name}: ${error}`);
    }
  });

  return server;
};
