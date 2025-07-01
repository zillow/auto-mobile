import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { ActionableError } from "../models/ActionableError";
import { DemoMode } from "../features/utility/DemoMode";
import { logger } from "../utils/logger";
import { createJSONToolResponse } from "../utils/toolUtils";
import { DeviceSessionManager } from "../utils/deviceSessionManager";

// Schema definitions
export const enableDemoModeSchema = z.object({
  time: z.string().optional().describe("Time to display in statusbar in HHMM format (e.g., 1000 for 10:00)"),
  batteryLevel: z.number().min(0).max(100).optional().describe("Battery level percentage (0-100)"),
  batteryPlugged: z.boolean().optional().describe("Whether the device appears to be charging"),
  wifiLevel: z.number().min(0).max(4).optional().describe("WiFi signal strength (0-4)"),
  mobileDataType: z.enum(["4g", "5g", "lte", "3g", "edge", "none"]).optional().describe("Mobile data type to display"),
  mobileSignalLevel: z.number().min(0).max(4).optional().describe("Mobile signal strength (0-4)"),
  hideNotifications: z.boolean().optional().describe("Whether to hide notification icons")
});

export const disableDemoModeSchema = z.object({});

export const setActiveDeviceSchema = z.object({
  deviceId: z.string().describe("The device ID to set as active")
});

// Export interfaces for type safety
export interface EnableDemoModeArgs {
  time?: string;
  batteryLevel?: number;
  batteryPlugged?: boolean;
  wifiLevel?: number;
  mobileDataType?: "4g" | "5g" | "lte" | "3g" | "edge" | "none";
  mobileSignalLevel?: number;
  hideNotifications?: boolean;
}

export interface SetActiveDeviceArgs {
  deviceId: string;
}

// Register tools
export function registerUtilityTools() {
  // Enable demo mode handler
  const enableDemoModeHandler = async (deviceId: string, args: EnableDemoModeArgs) => {
    try {
      const demoMode = new DemoMode(deviceId);
      const result = await demoMode.execute(args);

      return createJSONToolResponse({
        message: "Demo mode enabled",
        observation: result.observation,
        ...result,
        demoModeEnabled: true
      });
    } catch (error) {
      logger.error("Failed to enable demo mode:", error);
      throw new ActionableError(`Failed to enable demo mode: ${error}`);
    }
  };

  // Disable demo mode handler
  const disableDemoModeHandler = async (deviceId: string) => {
    try {
      const demoMode = new DemoMode(deviceId);
      const result = await demoMode.exitDemoMode();

      return createJSONToolResponse({
        message: "Demo mode disabled",
        observation: result.observation,
        ...result,
        demoModeEnabled: false
      });
    } catch (error) {
      logger.error("Failed to disable demo mode:", error);
      throw new ActionableError(`Failed to disable demo mode: ${error}`);
    }
  };

  // Set active device handler
  const setActiveDeviceHandler = async (args: SetActiveDeviceArgs) => {
    try {
      await DeviceSessionManager.getInstance().ensureDeviceReady(args.deviceId, true);

      return createJSONToolResponse({
        message: `Active device set to '${args.deviceId}'`,
        deviceId: args.deviceId,
      });
    } catch (error) {
      logger.error("Failed to set active device:", error);
      throw new ActionableError(`Failed to set active device: ${error}`);
    }
  };

  // Register with the tool registry
  ToolRegistry.registerDeviceAware(
    "enableDemoMode",
    "Enable demo mode with consistent status bar indicators for screenshots",
    enableDemoModeSchema,
    enableDemoModeHandler
  );

  ToolRegistry.registerDeviceAware(
    "disableDemoMode",
    "Disable demo mode and return to normal status bar behavior",
    disableDemoModeSchema,
    disableDemoModeHandler
  );

  ToolRegistry.register(
    "setActiveDevice",
    "Set the active device ID for subsequent operations",
    setActiveDeviceSchema,
    setActiveDeviceHandler
  );
}
