import { z } from "zod";
import { ToolRegistry, ProgressCallback } from "./toolRegistry";
import { ActionableError, BootedDevice } from "../models";
import { NavigateTo, NavigateToOptions } from "../features/navigation/NavigateTo";
import { NavigationGraphManager } from "../features/navigation/NavigationGraphManager";
import { Explore, ExploreOptions } from "../features/navigation/Explore";
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

export const exploreSchema = z.object({
  maxInteractions: z.number().optional().describe("Maximum number of interactions to perform (default: 50)"),
  timeoutMs: z.number().optional().describe("Maximum time in milliseconds (default: 300000 - 5 minutes)"),
  strategy: z.enum(["breadth-first", "depth-first", "weighted"]).optional().describe("Exploration strategy (default: weighted)"),
  resetToHome: z.boolean().optional().describe("Whether to reset to home screen periodically (default: false)"),
  resetInterval: z.number().optional().describe("How often to reset in number of interactions (default: 15)"),
  mode: z.enum(["discover", "validate", "hybrid"]).optional().describe("Exploration mode (default: hybrid)"),
  packageName: z.string().optional().describe("Package name to limit exploration to"),
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

export interface ExploreArgs extends ExploreOptions {
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
      const stats = await manager.getStats();
      const graph = await manager.exportGraph();

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

  // Explore handler
  const exploreHandler = async (
    device: BootedDevice,
    args: ExploreArgs,
    progress?: ProgressCallback
  ) => {
    try {
      const explore = new Explore(device);
      const options: ExploreOptions = {
        maxInteractions: args.maxInteractions,
        timeoutMs: args.timeoutMs,
        strategy: args.strategy,
        resetToHome: args.resetToHome,
        resetInterval: args.resetInterval,
        mode: args.mode,
        packageName: args.packageName
      };
      const result = await explore.execute(options, progress);

      return createJSONToolResponse({
        message: `Exploration completed: ${result.interactionsPerformed} interactions, ${result.screensDiscovered} new screens discovered, ${result.coverage.percentage}% coverage`,
        ...result
      });
    } catch (error) {
      throw new ActionableError(`Failed to execute exploration: ${error}`);
    }
  };

  ToolRegistry.registerDeviceAware(
    "explore",
    "Perpetually explore until all navigation destinations have been reached by " +
    "automatically exploring the app and intelligently selecting and interacting with navigation elements. " +
    "Builds a comprehensive navigation graph by prioritizing likely navigation elements (buttons, tabs, menus), " +
    "avoiding redundant interactions, and efficiently covering unexplored screens. " +
    "Supports breadth-first, depth-first, and weighted exploration strategies. " +
    "Automatically detects and handles common blockers like permission dialogs and login screens. " +
    "Default: 50 interactions, weighted strategy, 5-minute timeout.",
    exploreSchema,
    exploreHandler,
    true // supports progress
  );
}
