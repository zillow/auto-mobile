import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { DeviceSessionManager } from "../utils/deviceSessionManager";
import { ActionableError, BootedDevice, SomePlatform } from "../models";
import { ConfigurationManager } from "../utils/configurationManager";
import { TestAuthoringManager } from "../utils/testAuthoringManager";

// Progress notification interface
export interface ProgressCallback {
  (progress: number, total?: number, message?: string): Promise<void>;
}

// Interface for tool handlers
export interface ToolHandler<T = any> {
  (args: T, progress?: ProgressCallback): Promise<any>; // Using any since the actual type varies between text and image responses
}

// Interface for device-aware tool handlers
export interface DeviceAwareToolHandler<T = any> {
    (device: BootedDevice, args: T, progress?: ProgressCallback): Promise<any>;
}

// Interface for a registered tool
export interface RegisteredTool {
  name: string;
  description: string;
  schema: any;
  handler: ToolHandler;
  supportsProgress?: boolean;
    requiresDevice?: boolean;
    deviceAwareHandler?: DeviceAwareToolHandler;
}

// The registry that holds all tools
class ToolRegistryClass {
  private tools: Map<string, RegisteredTool> = new Map();
  private deviceSessionManager: DeviceSessionManager;

  constructor() {
    this.deviceSessionManager = DeviceSessionManager.getInstance();
  }

  // Register a new tool
  register(
    name: string,
    description: string,
    schema: any,
    handler: ToolHandler,
    supportsProgress: boolean = false
  ): void {
    this.tools.set(name, { name, description, schema, handler, supportsProgress, requiresDevice: false });
  }

  // Register a device-aware tool
  registerDeviceAware(
    name: string,
    description: string,
    schema: any,
    handler: DeviceAwareToolHandler,
    supportsProgress: boolean = false
  ): void {
    // Create a wrapper that handles device ID injection
    const wrappedHandler: ToolHandler = async (args: any, progress?: ProgressCallback) => {
      // Check if args contains a deviceId
      const providedDeviceId = args.deviceId;
      // Extract platform from args, default to "android" for backward compatibility
      const platform: SomePlatform = args.platform || "either";

      // Ensure device is ready and get the device ID
      const device = await this.deviceSessionManager.ensureDeviceReady(platform, providedDeviceId);

      const testAuthoringManager = TestAuthoringManager.getInstance();

      // Start test authoring session if enabled and not already active
      if (ConfigurationManager.getInstance().isTestAuthoringEnabled(device) && !testAuthoringManager.isActive()) {
        const deviceConfig = ConfigurationManager.getInstance().getConfigForDevice(device);
        if (deviceConfig && deviceConfig.testAuthoring) {
          const appId = deviceConfig.testAuthoring.appId;
          const appConfig = ConfigurationManager.getInstance().getConfigForApp(appId);
          if (appConfig && appConfig.appId) {
            await testAuthoringManager.startAuthoringSession(
              device,
              appConfig.appId,
              deviceConfig.testAuthoring.description
            );
          }
        }
      }
      try {
        let response: any | undefined;
        if (device !== undefined) {
          response = await handler(device, args, progress);
        }

        // Log tool call to test authoring session if active
        if (testAuthoringManager.isActive()) {
          await testAuthoringManager.logToolCall(device, name, args, {
            success: true,
            data: response
          });
        }

        return response;
      } catch (error) {
        // Log failed tool call to test authoring session if active
        if (testAuthoringManager.isActive()) {
          await testAuthoringManager.logToolCall(device, name, args, {
            success: false,
            error: error instanceof ActionableError ? error.message : `${error}`
          });
        }

        if (error instanceof ActionableError) {
          throw error;
        }
        throw new ActionableError(`Failed to execute tool ${name}: ${error}`);
      }
    };

    this.tools.set(name, {
      name,
      description,
      schema,
      handler: wrappedHandler,
      supportsProgress,
      requiresDevice: true,
      deviceAwareHandler: handler
    });
  }

  // Get all registered tools
  getAllTools(): RegisteredTool[] {
    return Array.from(this.tools.values());
  }

  // Get a specific tool by name
  getTool(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  // Register all tools with an MCP server
  registerWithServer(server: McpServer): void {
    this.tools.forEach(tool => {
      // Create a wrapper that adapts our ToolHandler to the MCP server's expected signature
      const wrappedHandler = async (args: any, extra: any) => {
        if (tool.supportsProgress) {
          // For tools that support progress, we'll handle the progress callback in the main server handler
          // This is just a placeholder - the actual progress callback is set up in the server's CallToolRequestSchema handler
          return await tool.handler(args);
        } else {
          // For tools that don't support progress, just call the handler normally
          return await tool.handler(args);
        }
      };

      server.tool(tool.name, tool.description, tool.schema, wrappedHandler);
    });
  }

  // Get tools in MCP format
  getToolDefinitions() {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.schema)
    }));
  }

  // Get a map of all schema
  getSchemaMap(): Record<string, any> {
    const schemaMap: Record<string, any> = {};
    this.tools.forEach(tool => {
      schemaMap[tool.name] = tool.schema;
    });
    return schemaMap;
  }

  // Get the device session manager
  getDeviceSessionManager(): DeviceSessionManager {
    return this.deviceSessionManager;
  }
}

// Export a singleton instance
export const ToolRegistry = new ToolRegistryClass();
