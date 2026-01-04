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
import { addSessionUuidToSchema } from "./toolSchemaHelpers";

// Schema definitions
export const observeSchema = addSessionUuidToSchema(z.object({
  platform: z.enum(["android", "ios"]).describe("Target platform")
}));

export const listAppsSchema = addSessionUuidToSchema(z.object({
  platform: z.enum(["android", "ios"]).describe("Target platform")
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
}
