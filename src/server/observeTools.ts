import { z } from "zod";
import { ToolRegistry, ProgressCallback } from "./toolRegistry";
import { ActionableError } from "../models/ActionableError";
import { ObserveScreen } from "../features/observe/ObserveScreen";
import { ListInstalledApps } from "../features/observe/ListInstalledApps";
import { createJSONToolResponse, verifyDeviceIsReady } from "../utils/toolUtils";

// Schema definitions
export const observeSchema = z.object({
  withViewHierarchy: z.boolean().optional().describe("Whether to include view hierarchy"),
});

export const listAppsSchema = z.object({});

export const takeScreenshotSchema = z.object({
  quality: z.number().min(1).max(100).optional().describe("Quality (1-100)"),
  format: z.enum(["png", "webp"]).optional().describe("Image format")
});

// Export interfaces for type safety
export interface ObserveArgs {
  withViewHierarchy?: boolean;
}

export interface ListAppsArgs {
}

export interface TakeScreenshotArgs {
  quality?: number;
  format?: "png" | "webp";
}

// Register tools (this will be called when this file is imported)
export function registerObserveTools(getCurrentDeviceId: () => string | undefined) {
  // Observe handler
  const observeHandler = async (args: ObserveArgs, progress?: ProgressCallback) => {
    try {
      const deviceId = getCurrentDeviceId();
      await verifyDeviceIsReady(deviceId);

      if (progress) {
        await progress(0, 100, "Taking screenshot...");
      }

      const observeScreen = new ObserveScreen(deviceId);

      if (progress) {
        await progress(50, 100, "Analyzing view hierarchy...");
      }

      const result = await observeScreen.execute();

      if (progress) {
        await progress(100, 100, "Screen observation complete");
      }

      return createJSONToolResponse(result);
    } catch (error) {
      throw new ActionableError(`Failed to execute observe: ${error}`);
    }
  };

  // List Apps handler
  const listAppsHandler = async (args: ListAppsArgs) => {
    try {
      const deviceId = getCurrentDeviceId();
      await verifyDeviceIsReady(deviceId);

      const listInstalledApps = new ListInstalledApps(deviceId);
      const apps = await listInstalledApps.execute();

      return createJSONToolResponse({
        message: `Listed ${apps.length} apps`,
        apps
      });
    } catch (error) {
      throw new ActionableError(`Failed to list apps: ${error}`);
    }
  };

  // Register with the tool registry
  ToolRegistry.register(
    "observe",
    "Take a screenshot and get the view hierarchy of what is displayed on screen",
    observeSchema,
    observeHandler,
    true // Supports progress notifications
  );

  ToolRegistry.register(
    "listApps",
    "List all apps installed on the device",
    listAppsSchema,
    listAppsHandler
  );
}
