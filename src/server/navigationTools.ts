import { z } from "zod";
import { ToolRegistry, ProgressCallback } from "./toolRegistry";
import { ActionableError, BootedDevice } from "../models";
import { NavigateTo, NavigateToOptions } from "../features/navigation/NavigateTo";
import { NavigationGraphManager } from "../features/navigation/NavigationGraphManager";
import { Explore, ExploreOptions } from "../features/navigation/Explore";
import { createJSONToolResponse } from "../utils/toolUtils";
import { Platform } from "../models";
import { addDeviceTargetingToSchema, platformSchema } from "./toolSchemaHelpers";

// Schema definitions
export const navigateToSchema = addDeviceTargetingToSchema(z.object({
  targetScreen: z.string().describe("Target screen name"),
  platform: platformSchema.default("android")
}));

export const getNavigationGraphSchema = addDeviceTargetingToSchema(z.object({
  platform: platformSchema.default("android")
}));

export const exploreSchema = addDeviceTargetingToSchema(z.object({
  maxInteractions: z.number().optional().describe("Max interactions (default: 50)"),
  timeoutMs: z.number().optional().describe("Timeout ms (default: 300000)"),
  strategy: z.enum(["breadth-first", "depth-first", "weighted"]).optional().describe("Strategy (default: weighted)"),
  resetToHome: z.boolean().optional().describe("Reset to home periodically (default: false)"),
  resetInterval: z.number().optional().describe("Reset interval (default: 15)"),
  mode: z.enum(["discover", "validate", "hybrid"]).optional().describe("Mode (default: hybrid)"),
  packageName: z.string().optional().describe("Package to limit exploration"),
  dryRun: z.boolean().optional().describe("Dry run (no interactions)"),
  platform: platformSchema.default("android")
}));


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
    "Navigate to screen using navigation graph",
    navigateToSchema,
    navigateToHandler,
    true, // supports progress
    true // debugOnly - navigation graph not production-ready
  );

  ToolRegistry.registerDeviceAware(
    "getNavigationGraph",
    "Get navigation graph for debugging",
    getNavigationGraphSchema,
    getNavigationGraphHandler,
    false,
    true
  );

  // Explore handler
  const exploreHandler = async (
    device: BootedDevice,
    args: ExploreArgs,
    progress?: ProgressCallback,
    signal?: AbortSignal
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
        packageName: args.packageName,
        dryRun: args.dryRun
      };
      const result = await explore.execute(options, progress, signal);

      if ("dryRun" in result && result.dryRun) {
        return createJSONToolResponse({
          message: `Exploration dry run completed: ${result.plannedInteractions.length} planned interactions`,
          ...result
        });
      }

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
    "Automatically explore app to build navigation graph",
    exploreSchema,
    exploreHandler,
    true, // supports progress
    true // debugOnly - navigation graph not production-ready
  );
}
