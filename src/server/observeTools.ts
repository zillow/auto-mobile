import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { ResourceRegistry } from "./resourceRegistry";
import { RESOURCE_URIS } from "./observationResources";
import { ActionableError } from "../models/ActionableError";
import { ObserveScreen } from "../features/observe/ObserveScreen";
import { ListInstalledApps } from "../features/observe/ListInstalledApps";
import { createJSONToolResponse } from "../utils/toolUtils";
import { BootedDevice } from "../models";
import { createGlobalPerformanceTracker } from "../utils/PerformanceTracker";
import { NavigationGraphManager } from "../features/navigation/NavigationGraphManager";
import { IdentifyInteractions, IdentifyInteractionsOptions } from "../features/observe/IdentifyInteractions";
import { addDeviceTargetingToSchema } from "./toolSchemaHelpers";

// Schema definitions
export const observeSchema = addDeviceTargetingToSchema(z.object({
  platform: z.enum(["android", "ios"]).describe("Target platform")
}));

export const listAppsSchema = addDeviceTargetingToSchema(z.object({
  platform: z.enum(["android", "ios"]).describe("Target platform")
}));

export const identifyInteractionsSchema = addDeviceTargetingToSchema(z.object({
  platform: z.enum(["android", "ios"]).describe("Target platform"),
  filter: z.object({
    types: z.array(z.enum(["navigation", "input", "action", "scroll", "toggle"]))
      .optional()
      .describe("Interaction types to include"),
    minConfidence: z.number().min(0).max(1).optional().describe("Minimum confidence threshold"),
    limit: z.number().int().positive().optional().describe("Limit total number of interactions returned")
  }).optional().describe("Filtering options"),
  includeContext: z.object({
    navigationGraph: z.boolean().optional().describe("Include predicted destinations from navigation graph"),
    elementDetails: z.boolean().optional().describe("Include full element info"),
    suggestedParams: z.boolean().optional().describe("Include ready-to-use tool params")
  }).optional().describe("Additional context to include")
}));

// Register tools (this will be called when this file is imported)
export function registerObserveTools() {
  // Observe handler
  const observeHandler = async (device: BootedDevice, _args: unknown, _progress?: unknown, signal?: AbortSignal) => {
    try {
      const perf = createGlobalPerformanceTracker();
      const observeScreen = new ObserveScreen(device);
      const result = await observeScreen.execute(undefined, perf, true, 0, signal);

      // Record back stack information in navigation graph if available
      if (result.backStack && result.activeWindow?.appId) {
        const navGraph = NavigationGraphManager.getInstance();
        // Only record if we have a current app and screen
        if (navGraph.getCurrentAppId() === result.activeWindow.appId && navGraph.getCurrentScreen()) {
          navGraph.recordBackStack(result.backStack);
        }
      }

      // Notify MCP clients that observation resources have been updated
      await ResourceRegistry.notifyResourcesUpdated([
        RESOURCE_URIS.LATEST_OBSERVATION,
        RESOURCE_URIS.LATEST_SCREENSHOT
      ]);

      return createJSONToolResponse(result);
    } catch (error) {
      throw new ActionableError(`Failed to execute observe: ${error}`);
    }
  };

  const identifyInteractionsHandler = async (
    device: BootedDevice,
    args: IdentifyInteractionsOptions
  ) => {
    try {
      const observeScreen = new ObserveScreen(device);
      const cachedResult = await observeScreen.getMostRecentCachedObserveResult();
      const navigationGraph = NavigationGraphManager.getInstance();
      const currentScreen = navigationGraph.getCurrentScreen();
      const navigationEdges = args.includeContext?.navigationGraph !== false && currentScreen
        ? await navigationGraph.getEdgesFrom(currentScreen)
        : [];

      const analyzer = new IdentifyInteractions();
      const result = analyzer.analyze(cachedResult, args, currentScreen, navigationEdges);

      return createJSONToolResponse(result);
    } catch (error) {
      throw new ActionableError(`Failed to execute identifyInteractions: ${error}`);
    }
  };

  // List Apps handler
  const listAppsHandler = async (device: BootedDevice) => {
    try {
      const listInstalledApps = new ListInstalledApps(device);

      // For Android, return detailed app info with userId, foreground status, etc.
      // For iOS, return simple package names
      if (device.platform === "android") {
        const apps = await listInstalledApps.executeDetailed();
        const profileAppCount = Object.values(apps.profiles).reduce((count, profileApps) => count + profileApps.length, 0);
        const profileCount = Object.keys(apps.profiles).length;
        return createJSONToolResponse({
          message: `Listed ${profileAppCount} user app(s) across ${profileCount} profile(s); ${apps.system.length} system app(s) deduped`,
          profiles: apps.profiles,
          system: apps.system
        });
      } else {
        const apps = await listInstalledApps.execute();
        return createJSONToolResponse({
          message: `Listed ${apps.length} apps`,
          apps
        });
      }
    } catch (error) {
      throw new ActionableError(`Failed to list apps: ${error}`);
    }
  };

  // Register with the tool registry using the new device-aware method
  ToolRegistry.registerDeviceAware(
    "observe",
    "Get the view hierarchy of what is displayed on screen",
    observeSchema,
    observeHandler,
  );

  ToolRegistry.registerDeviceAware(
    "listApps",
    "List all apps installed on the device. For Android, returns user apps grouped by profile and system apps under a separate key with profile coverage. For iOS, returns package names only.",
    listAppsSchema,
    listAppsHandler
  );

  ToolRegistry.registerDeviceAware(
    "identifyInteractions",
    "Analyze the most recent observation and suggest likely interactions with ready-to-use tool calls.",
    identifyInteractionsSchema,
    identifyInteractionsHandler
  );
}
