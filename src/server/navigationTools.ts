import { z } from "zod";
import { ToolRegistry, ProgressCallback } from "./toolRegistry";
import { ActionableError, BootedDevice } from "../models";
import { NavigateTo, NavigateToOptions } from "../features/navigation/NavigateTo";
import { NavigationGraphManager } from "../features/navigation/NavigationGraphManager";
import { createJSONToolResponse } from "../utils/toolUtils";
import { Platform } from "../models";

// Schema definitions
export const navigateToSchema = z.object({
  targetScreen: z.string().describe("The destination screen name to navigate to"),
  platform: z.enum(["android", "ios"]).default("android")
});

export const getNavigationGraphSchema = z.object({
  platform: z.enum(["android", "ios"]).default("android")
});

export const setCurrentAppSchema = z.object({
  appId: z.string().describe("The app package ID to track navigation for"),
  platform: z.enum(["android", "ios"]).default("android")
});

// Export interfaces for type safety
export interface NavigateToArgs {
  targetScreen: string;
  platform: Platform;
}

export interface GetNavigationGraphArgs {
  platform: Platform;
}

export interface SetCurrentAppArgs {
  appId: string;
  platform: Platform;
}

// Register navigation tools
export function registerNavigationTools() {
  // NavigateTo handler
  const navigateToHandler = async (
    device: BootedDevice,
    args: NavigateToArgs,
    progress?: ProgressCallback
  ) => {
    try {
      const navigateTo = new NavigateTo(device);
      const options: NavigateToOptions = {
        targetScreen: args.targetScreen,
        platform: args.platform || "android"
      };
      const result = await navigateTo.execute(options, progress);

      if (result.success) {
        return createJSONToolResponse({
          message: result.message || `Navigated to ${args.targetScreen}`,
          ...result
        });
      } else {
        return createJSONToolResponse({
          error: result.error || "Navigation failed",
          ...result
        });
      }
    } catch (error) {
      throw new ActionableError(`Failed to navigate: ${error}`);
    }
  };

  // Get navigation graph handler (for debugging)
  const getNavigationGraphHandler = async (
    device: BootedDevice,
    args: GetNavigationGraphArgs
  ) => {
    try {
      const manager = NavigationGraphManager.getInstance();
      const stats = manager.getStats();
      const graph = manager.exportGraph();

      return createJSONToolResponse({
        message: `Navigation graph for app: ${graph.appId || "none"}`,
        currentScreen: stats.currentScreen,
        nodeCount: stats.nodeCount,
        edgeCount: stats.edgeCount,
        knownEdges: stats.knownEdgeCount,
        unknownEdges: stats.unknownEdgeCount,
        screens: graph.nodes.map(n => ({
          name: n.screenName,
          visitCount: n.visitCount,
          lastVisited: new Date(n.lastSeenAt).toISOString()
        })),
        transitions: graph.edges.map(e => ({
          from: e.from,
          to: e.to,
          type: e.edgeType,
          tool: e.interaction?.toolName,
          args: e.interaction?.args,
          uiState: e.uiState
        }))
      });
    } catch (error) {
      throw new ActionableError(`Failed to get navigation graph: ${error}`);
    }
  };

  // Set current app handler
  const setCurrentAppHandler = async (
    device: BootedDevice,
    args: SetCurrentAppArgs
  ) => {
    try {
      const manager = NavigationGraphManager.getInstance();
      manager.setCurrentApp(args.appId);

      return createJSONToolResponse({
        message: `Now tracking navigation for app: ${args.appId}`,
        appId: args.appId
      });
    } catch (error) {
      throw new ActionableError(`Failed to set current app: ${error}`);
    }
  };

  // Register with the tool registry
  ToolRegistry.registerDeviceAware(
    "navigateTo",
    "Navigate to a specific screen in the app using the learned navigation graph. " +
    "Uses previously recorded navigation paths and UI interactions. " +
    "If no known path exists, reports available screens. " +
    "Maximum timeout of 30 seconds.",
    navigateToSchema,
    navigateToHandler,
    true // supports progress
  );

  ToolRegistry.registerDeviceAware(
    "getNavigationGraph",
    "Get the current navigation graph for debugging. " +
    "Shows known screens, transitions, and which tool calls triggered each navigation.",
    getNavigationGraphSchema,
    getNavigationGraphHandler
  );

  ToolRegistry.registerDeviceAware(
    "setNavigationApp",
    "Set the current app to track navigation for. " +
    "Navigation graphs are maintained per-app. " +
    "Call this when switching between apps to track separate navigation histories.",
    setCurrentAppSchema,
    setCurrentAppHandler
  );
}
