import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toJSONSchema } from "zod";
import { DeviceSessionManager } from "../utils/DeviceSessionManager";
import { ActionableError, BootedDevice, SomePlatform } from "../models";
import { NavigationGraphManager } from "../features/navigation/NavigationGraphManager";
import { UIStateExtractor } from "../features/navigation/UIStateExtractor";
import { RealObserveScreen } from "../features/observe/ObserveScreen";
import { serverConfig } from "../utils/ServerConfig";
import { MemoryAudit } from "../features/memory/MemoryAudit";
import { defaultAdbClientFactory } from "../utils/android-cmdline-tools/AdbClientFactory";
import { createGlobalPerformanceTracker } from "../utils/PerformanceTracker";
import { logger } from "../utils/logger";
import { DaemonState } from "../daemon/daemonState";
import { createToolExecutionContext, updateSessionCache } from "./ToolExecutionContext";
import { AppCleanupService, DefaultAppCleanupService } from "./AppCleanupService";
import { ToolCallRepository } from "../db/toolCallRepository";
import { getDeviceLabelMap, releaseDeviceLabelSessions } from "./deviceLabelMapping";
import { isDebugModeEnabled } from "../utils/debug";
import { defaultTimer, type Timer } from "../utils/SystemTimer";

// Progress notification interface
export interface ProgressCallback {
  (progress: number, total?: number, message?: string): Promise<void>;
}

// Interface for tool handlers
export interface ToolHandler<T = any> {
  (args: T, progress?: ProgressCallback, signal?: AbortSignal): Promise<any>; // Using any since the actual type varies between text and image responses
}

// Interface for device-aware tool handlers
export interface DeviceAwareToolHandler<T = any> {
  (device: BootedDevice, args: T, progress?: ProgressCallback, signal?: AbortSignal): Promise<any>;
}

export interface DeviceAwareToolOptions<T = any> {
  shouldEnsureDevice?: (args: T) => boolean;
  nonDeviceHandler?: ToolHandler<T>;
  outputSchema?: any;
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
  debugOnly?: boolean;
  outputSchema?: any;
}

// The registry that holds all tools
class ToolRegistryClass {
  private tools: Map<string, RegisteredTool> = new Map();
  private deviceSessionManager: DeviceSessionManager;
  private cleanupService: AppCleanupService;
  private toolCallRepository: ToolCallRepository;
  private timer: Timer;

  constructor(timer: Timer = defaultTimer) {
    this.deviceSessionManager = DeviceSessionManager.getInstance();
    this.cleanupService = new DefaultAppCleanupService();
    this.toolCallRepository = new ToolCallRepository();
    this.timer = timer;
  }

  private isToolAvailable(tool: RegisteredTool): boolean {
    return !tool.debugOnly || isDebugModeEnabled();
  }

  // Register a new tool
  register(
    name: string,
    description: string,
    schema: any,
    handler: ToolHandler,
    supportsProgress: boolean = false,
    debugOnly: boolean = false,
    outputSchema?: any
  ): void {
    this.tools.set(name, {
      name,
      description,
      schema,
      handler,
      supportsProgress,
      requiresDevice: false,
      debugOnly,
      outputSchema
    });
  }

  // Helper: Get foreground app package name
  private async getForegroundPackageName(device: BootedDevice): Promise<string | null> {
    try {
      const adb = defaultAdbClientFactory.create(device);
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
    supportsProgress: boolean = false,
    debugOnly: boolean = false,
    options: DeviceAwareToolOptions = {}
  ): void {
    // Create a wrapper that handles device ID injection
    const wrappedHandler: ToolHandler = async (args: any, progress?: ProgressCallback, signal?: AbortSignal) => {
      const shouldResolveDevice = options.shouldEnsureDevice
        ? options.shouldEnsureDevice(args)
        : true;

      // Check for session UUID and create execution context
      let providedDeviceId = args.deviceId;
      const baseSessionUuid = args.sessionUuid;
      const deviceLabel = typeof args.device === "string" ? args.device : undefined;
      const declaredDeviceLabels = Array.isArray(args.devices) ? args.devices : undefined;
      let sessionUuid = baseSessionUuid;
      const keepScreenAwake = typeof args.keepScreenAwake === "boolean" ? args.keepScreenAwake : undefined;

      if (deviceLabel && shouldResolveDevice) {
        if (!DaemonState.getInstance().isInitialized()) {
          throw new ActionableError("Device labels require an active daemon session.");
        }
        if (!baseSessionUuid) {
          throw new ActionableError(`Device label '${deviceLabel}' requires sessionUuid to be provided.`);
        }

        const deviceLabelMap = getDeviceLabelMap(baseSessionUuid);
        if (deviceLabelMap) {
          const mappedSession = deviceLabelMap[deviceLabel];
          if (!mappedSession) {
            const available = Object.keys(deviceLabelMap);
            const suffix = available.length > 0 ? ` Available labels: ${available.join(", ")}` : "";
            throw new ActionableError(`Unknown device label '${deviceLabel}'.${suffix}`);
          }
          sessionUuid = mappedSession;
        } else if (name === "executePlan" && declaredDeviceLabels?.includes(deviceLabel)) {
          sessionUuid = baseSessionUuid;
        } else {
          throw new ActionableError(
            `Device label '${deviceLabel}' is not allocated. Provide a devices list to executePlan before using device labels.`
          );
        }

        if (providedDeviceId) {
          logger.warn(`[ToolRegistry] Ignoring deviceId because device label '${deviceLabel}' was provided.`);
          providedDeviceId = undefined;
        }
      }

      logger.info(`[ToolRegistry] Tool ${name} called, sessionUuid=${sessionUuid}, daemonInitialized=${DaemonState.getInstance().isInitialized()}`);
      void this.toolCallRepository.recordToolCall({
        toolName: name,
        timestamp: new Date().toISOString(),
        sessionUuid,
      });

      // Extract platform from args, default to "either" for backward compatibility
      let platform: SomePlatform = args.platform || "either";

      if (shouldResolveDevice) {
        await this.enforceSessionUuidForMultipleIos(platform, sessionUuid, providedDeviceId);
      }

      // If session UUID provided, resolve device from session
      if (shouldResolveDevice && sessionUuid && DaemonState.getInstance().isInitialized()) {
        logger.info(`[ToolRegistry] Entering session-based device assignment for ${sessionUuid}`);
        const sessionManager = DaemonState.getInstance().getSessionManager();
        const devicePool = DaemonState.getInstance().getDevicePool();
        const context = await createToolExecutionContext(sessionUuid, sessionManager, devicePool, {
          keepScreenAwake,
          platform: platform === "android" || platform === "ios" ? platform : undefined
        });
        if (context.deviceId && !providedDeviceId) {
          providedDeviceId = context.deviceId;
          logger.info(`[ToolRegistry] Resolved device from session: ${providedDeviceId}`);
        }
        if (platform === "either" && context.devicePlatform) {
          platform = context.devicePlatform;
        }
      } else if (sessionUuid) {
        logger.warn(`[ToolRegistry] SessionUuid provided but DaemonState not initialized!`);
      }

      let device: BootedDevice | undefined;
      if (shouldResolveDevice) {
        // Ensure device is ready and get the device ID
        logger.info(`[ToolRegistry] ${name}: Resolving device for platform=${platform}, providedDeviceId=${providedDeviceId}`);
        device = await this.deviceSessionManager.ensureDeviceReady(
          platform,
          providedDeviceId,
          { skipAccessibilityDownload: serverConfig.isSkipAccessibilityDownloadEnabled() }
        );
        logger.info(`[ToolRegistry] ${name}: Using device ${device.deviceId}`);
      } else {
        logger.info(`[ToolRegistry] ${name}: Skipping device resolution.`);
      }

      try {
        // Record tool call for navigation graph correlation
        // Only record UI interaction tools that may cause navigation
        // Excludes app lifecycle tools (launchApp, terminateApp, homeScreen, etc.)
        // as they don't represent replayable in-app navigation paths
        const navigationRelevantTools = [
          "tapOn", "swipeOn", "pinchOn", "dragAndDrop",
          "pressButton", "pressKey", "inputText", "clearText", "imeAction"
        ];
        if (navigationRelevantTools.includes(name)) {
          // Extract UI state from the most recent cached observation
          const cachedResult = RealObserveScreen.getRecentCachedResult();
          const uiState = UIStateExtractor.extractFromObservation(cachedResult);
          NavigationGraphManager.getInstance().recordToolCall(name, args, uiState);
        }

        let response: any | undefined;
        if (!shouldResolveDevice) {
          if (!options.nonDeviceHandler) {
            throw new ActionableError(`Tool ${name} requires a device.`);
          }
          response = await options.nonDeviceHandler(args, progress, signal);
        } else if (device !== undefined) {
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
                  response = await handler(device, args, progress, signal);
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
              response = await handler(device, args, progress, signal);
            }
          } else {
            // Memory audit not enabled or not Android platform, execute normally
            response = await handler(device, args, progress, signal);
          }
        }

        // Log tool response for debugging
        if (response && typeof response === "object") {
          if ("success" in response) {
            logger.info(`[ToolRegistry] ${name} result: success=${response.success}${response.success === false ? `, error=${response.error || "unknown"}` : ""}`);
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
        if (shouldResolveDevice && sessionUuid && DaemonState.getInstance().isInitialized()) {
          const sessionManager = DaemonState.getInstance().getSessionManager();
          const devicePool = DaemonState.getInstance().getDevicePool();
          const context = await createToolExecutionContext(sessionUuid, sessionManager, devicePool, {
            keepScreenAwake,
            platform: platform === "android" || platform === "ios" ? platform : undefined
          });

          // Cache observation data for certain tools to reduce API calls
          if (name === "observe" && response?.viewHierarchy) {
            await updateSessionCache(context, "lastHierarchy", response.viewHierarchy);
          }
          if (name === "observe" && response?.screenshot) {
            await updateSessionCache(context, "lastScreenshot", response.screenshot);
          }

          // Update last action timestamp for interaction tools
          if (["tapOn", "swipeOn", "pinchOn", "dragAndDrop", "scroll", "inputText", "clearText", "pressButton"].includes(name)) {
            await updateSessionCache(context, "lastActionTime", this.timer.now());
          }
        }

        return response;
      } catch (error) {
        if (error instanceof ActionableError) {
          throw error;
        }
        throw new ActionableError(`Failed to execute tool ${name}: ${error}`);
      } finally {
        if (device && name === "executePlan" && args?.cleanupAppId) {
          await this.cleanupService.cleanup(device, {
            appId: args.cleanupAppId,
            clearAppData: args.cleanupClearAppData,
          });
        }

        // Auto-release session after executePlan completes
        // This frees the device immediately for parallel test execution
        if (shouldResolveDevice && sessionUuid && name === "executePlan" && DaemonState.getInstance().isInitialized()) {
          try {
            const sessionManager = DaemonState.getInstance().getSessionManager();
            const devicePool = DaemonState.getInstance().getDevicePool();
            const releaseSessionUuid = baseSessionUuid ?? sessionUuid;
            if (releaseSessionUuid) {
              await releaseDeviceLabelSessions(releaseSessionUuid);
            }

            const session = releaseSessionUuid ? sessionManager.getSession(releaseSessionUuid) : null;
            if (session) {
              const deviceId = session.assignedDevice;
              sessionManager.releaseSession(session.sessionId);
              await devicePool.releaseDevice(deviceId);
              logger.info(`Auto-released session ${session.sessionId} and freed device ${deviceId} after executePlan`);
            }
          } catch (releaseError) {
            // Don't fail the tool if session release fails
            // Session will be cleaned up by timeout mechanism
            logger.warn(`Failed to auto-release session ${sessionUuid}: ${releaseError}`);
          }
        }
      }
    };

    this.tools.set(name, {
      name,
      description,
      schema,
      handler: wrappedHandler,
      supportsProgress,
      requiresDevice: true,
      deviceAwareHandler: handler,
      debugOnly,
      outputSchema: options.outputSchema
    });
  }

  private async enforceSessionUuidForMultipleIos(
    platform: SomePlatform,
    sessionUuid: string | undefined,
    providedDeviceId: string | undefined
  ): Promise<void> {
    if (sessionUuid || providedDeviceId) {
      return;
    }

    // Check if an iOS device was set via setActiveDevice and platform is explicitly ios
    // Only skip the guard when platform === "ios" because ensureDeviceReady only honors
    // the current device when the requested platform matches currentPlatform
    const currentDevice = this.deviceSessionManager.getCurrentDevice();
    const currentPlatform = this.deviceSessionManager.getCurrentPlatform();
    if (currentDevice && currentPlatform === "ios" && platform === "ios") {
      return;
    }

    if (platform !== "ios" && platform !== "either") {
      return;
    }

    const connectedPlatforms = await this.deviceSessionManager.detectConnectedPlatforms();
    const iosDevices = connectedPlatforms.filter(device => device.platform === "ios");
    if (iosDevices.length <= 1) {
      return;
    }

    if (platform === "either") {
      const androidDevices = connectedPlatforms.filter(device => device.platform === "android");
      if (androidDevices.length > 0) {
        return;
      }
    }

    throw new ActionableError(
      "Multiple iOS simulators detected. Provide sessionUuid to target a specific simulator."
    );
  }

  // Get all registered tools
  getAllTools(): RegisteredTool[] {
    return Array.from(this.tools.values()).filter(tool => this.isToolAvailable(tool));
  }

  // Get a specific tool by name
  getTool(name: string): RegisteredTool | undefined {
    const tool = this.tools.get(name);
    if (!tool || !this.isToolAvailable(tool)) {
      return undefined;
    }
    return tool;
  }

  // Register all tools with an MCP server
  registerWithServer(server: McpServer): void {
    this.tools.forEach(tool => {
      if (!this.isToolAvailable(tool)) {
        return;
      }

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
    return this.getAllTools().map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: toJSONSchema(tool.schema),
      ...(tool.outputSchema ? { outputSchema: toJSONSchema(tool.outputSchema) } : {})
    }));
  }

  // Get a map of all schema
  getSchemaMap(): Record<string, any> {
    const schemaMap: Record<string, any> = {};
    this.getAllTools().forEach(tool => {
      schemaMap[tool.name] = tool.schema;
    });
    return schemaMap;
  }

  // Get the device session manager
  getDeviceSessionManager(): DeviceSessionManager {
    return this.deviceSessionManager;
  }

  // Allow tests to inject a cleanup implementation
  setCleanupService(cleanupService: AppCleanupService): void {
    this.cleanupService = cleanupService;
  }

  // Clear all registered tools (for testing)
  clearTools(): void {
    this.tools.clear();
  }
}

// Export a singleton instance
export const ToolRegistry = new ToolRegistryClass();
