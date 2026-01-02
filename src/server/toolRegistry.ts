import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { DeviceSessionManager } from "../utils/DeviceSessionManager";
import { ActionableError, BootedDevice, SomePlatform } from "../models";
import { NavigationGraphManager } from "../features/navigation/NavigationGraphManager";
import { UIStateExtractor } from "../features/navigation/UIStateExtractor";
import { ObserveScreen } from "../features/observe/ObserveScreen";
import { serverConfig } from "../utils/ServerConfig";
import { MemoryAudit } from "../features/memory/MemoryAudit";
import { AdbClient } from "../utils/android-cmdline-tools/AdbClient";
import { createGlobalPerformanceTracker } from "../utils/PerformanceTracker";
import { logger } from "../utils/logger";
import { DaemonState } from "../daemon/daemonState";
import { createToolExecutionContext, updateSessionCache } from "./ToolExecutionContext";

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

  // Helper: Get foreground app package name
  private async getForegroundPackageName(device: BootedDevice): Promise<string | null> {
    try {
      const adb = new AdbClient(device);
      const { stdout } = await adb.executeCommand(
        "shell dumpsys window | grep mCurrentFocus"
      );

      // Parse: "mCurrentFocus=Window{... u0 com.example.app/com.example.Activity}"
      const match = stdout.match(/\s+(\S+)\/\S+\}/);
      return match ? match[1] : null;
    } catch (error) {
      logger.warn(`[ToolRegistry] Failed to get foreground package name: ${error}`);
      return null;
    }
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
      // Check for session UUID and create execution context
      let providedDeviceId = args.deviceId;
      const sessionUuid = args.sessionUuid;

      // If session UUID provided, resolve device from session
      if (sessionUuid && DaemonState.getInstance().isInitialized()) {
        const sessionManager = DaemonState.getInstance().getSessionManager();
        const devicePool = DaemonState.getInstance().getDevicePool();
        const context = await createToolExecutionContext(sessionUuid, sessionManager, devicePool);
        if (context.deviceId && !providedDeviceId) {
          providedDeviceId = context.deviceId;
        }
      }

      // Extract platform from args, default to "android" for backward compatibility
      const platform: SomePlatform = args.platform || "either";

      // Ensure device is ready and get the device ID
      const device = await this.deviceSessionManager.ensureDeviceReady(platform, providedDeviceId);

      try {
        // Record tool call for navigation graph correlation
        // Only record UI interaction tools that may cause navigation
        // Excludes app lifecycle tools (launchApp, terminateApp, homeScreen, etc.)
        // as they don't represent replayable in-app navigation paths
        const navigationRelevantTools = [
          "tapOn", "swipeOn",
          "pressButton", "pressKey", "inputText", "clearText", "imeAction"
        ];
        if (navigationRelevantTools.includes(name)) {
          // Extract UI state from the most recent cached observation
          const cachedResult = ObserveScreen.getRecentCachedResult();
          const uiState = UIStateExtractor.extract(cachedResult?.viewHierarchy);
          NavigationGraphManager.getInstance().recordToolCall(name, args, uiState);
        }

        let response: any | undefined;
        if (device !== undefined) {
          // Check if memory performance audit mode is enabled
          const memPerfAuditEnabled = serverConfig.isMemPerfAuditEnabled();

          if (memPerfAuditEnabled && device.platform === "android") {
            // Get the foreground app package name
            const packageName = await this.getForegroundPackageName(device);

            if (packageName) {
              logger.info(`[ToolRegistry] Running memory audit for ${packageName} during ${name}`);

              // Create memory audit instance
              const memoryAudit = new MemoryAudit(device);
              const perf = createGlobalPerformanceTracker();

              // Run the handler within memory audit
              const auditResult = await memoryAudit.runAudit(
                packageName,
                name,
                args,
                async () => {
                  response = await handler(device, args, progress);
                },
                perf
              );

              // If audit failed, throw error with diagnostics
              if (!auditResult.passed) {
                const errorMsg = `Memory audit FAILED for ${packageName} during ${name}\n\n${auditResult.diagnostics}`;
                logger.error(`[ToolRegistry] ${errorMsg}`);
                throw new ActionableError(errorMsg);
              }

              logger.info(`[ToolRegistry] Memory audit PASSED for ${packageName} during ${name}`);
            } else {
              logger.warn(`[ToolRegistry] Could not determine foreground app, skipping memory audit for ${name}`);
              response = await handler(device, args, progress);
            }
          } else {
            // Memory audit not enabled or not Android platform, execute normally
            response = await handler(device, args, progress);
          }
        }

        // After swipeOn executes with lookFor, update the tool call with scroll position
        if (name === "swipeOn" && args.lookFor && response?.success && response?.found) {
          const scrollPosition = UIStateExtractor.createScrollPosition(args);
          if (scrollPosition) {
            NavigationGraphManager.getInstance().updateScrollPosition(scrollPosition);
          }
        }

        // Update session cache if sessionUuid provided
        if (sessionUuid && DaemonState.getInstance().isInitialized()) {
          const sessionManager = DaemonState.getInstance().getSessionManager();
          const devicePool = DaemonState.getInstance().getDevicePool();
          const context = await createToolExecutionContext(sessionUuid, sessionManager, devicePool);

          // Cache observation data for certain tools to reduce API calls
          if (name === "observe" && response?.viewHierarchy) {
            await updateSessionCache(context, "lastHierarchy", response.viewHierarchy);
          }
          if (name === "observe" && response?.screenshot) {
            await updateSessionCache(context, "lastScreenshot", response.screenshot);
          }

          // Update last action timestamp for interaction tools
          if (["tapOn", "swipeOn", "scroll", "inputText", "clearText", "pressButton"].includes(name)) {
            await updateSessionCache(context, "lastActionTime", Date.now());
          }
        }

        return response;
      } catch (error) {
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

  // Clear all registered tools (for testing)
  clearTools(): void {
    this.tools.clear();
  }
}

// Export a singleton instance
export const ToolRegistry = new ToolRegistryClass();
