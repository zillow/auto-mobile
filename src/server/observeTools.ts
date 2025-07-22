import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { ActionableError } from "../models/ActionableError";
import { ObserveScreen } from "../features/observe/ObserveScreen";
import { ListInstalledApps } from "../features/observe/ListInstalledApps";
import { createJSONToolResponse } from "../utils/toolUtils";
import { BootedDevice } from "../models";

// Schema definitions
export const observeSchema = z.object({
  platform: z.enum(["android", "ios"]).describe("Target platform")
});

export const listAppsSchema = z.object({
  platform: z.enum(["android", "ios"]).describe("Target platform")
});

// Register tools (this will be called when this file is imported)
export function registerObserveTools() {
  // Observe handler
  const observeHandler = async (device: BootedDevice) => {
    try {
      const observeScreen = new ObserveScreen(device);
      const result = await observeScreen.execute();
      return createJSONToolResponse(result);
    } catch (error) {
      throw new ActionableError(`Failed to execute observe: ${error}`);
    }
  };

  // List Apps handler
  const listAppsHandler = async (device: BootedDevice) => {
    try {
      const listInstalledApps = new ListInstalledApps(device);
      const apps = await listInstalledApps.execute();

      return createJSONToolResponse({
        message: `Listed ${apps.length} apps`,
        apps
      });
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
    "List all apps installed on the device",
    listAppsSchema,
    listAppsHandler
  );
}
