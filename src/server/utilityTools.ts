import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { ActionableError } from "../models/ActionableError";
import { DemoMode } from "../features/utility/DemoMode";
import type { DemoModeOptions } from "../features/utility/DemoMode";
import { SystemConfigurationManager } from "../features/utility/SystemConfigurationManager";
import { logger } from "../utils/logger";
import { createJSONToolResponse } from "../utils/toolUtils";
import { DeviceSessionManager } from "../utils/DeviceSessionManager";
import { BootedDevice, Platform } from "../models";
import { addDeviceTargetingToSchema, addSessionUuidToSchema } from "./toolSchemaHelpers";

// Schema definitions
export const demoModeSchema = addDeviceTargetingToSchema(z.object({
  action: z.enum(["enable", "disable"]).describe("Demo mode action"),
  time: z.string().optional().describe("Time in HHMM (e.g., 1000)"),
  batteryLevel: z.number().min(0).max(100).optional().describe("Battery % (0-100)"),
  batteryPlugged: z.boolean().optional().describe("Charging status"),
  wifiLevel: z.number().min(0).max(4).optional().describe("WiFi strength (0-4)"),
  mobileDataType: z.enum(["4g", "5g", "lte", "3g", "edge", "none"]).optional().describe("Data type"),
  mobileSignalLevel: z.number().min(0).max(4).optional().describe("Signal strength (0-4)"),
  hideNotifications: z.boolean().optional().describe("Hide notifications"),
  platform: z.enum(["android", "ios"]).describe("Platform")
}));

export const setActiveDeviceSchema = addSessionUuidToSchema(z.object({
  deviceId: z.string().describe("Device ID"),
  platform: z.enum(["android", "ios"]).describe("Platform")
}));

export const setLocaleSchema = addDeviceTargetingToSchema(z.object({
  languageTag: z.string().min(1).describe("Locale tag (e.g., ar-SA, ja-JP)"),
  platform: z.enum(["android", "ios"]).describe("Platform")
}));

export const setTimeZoneSchema = addDeviceTargetingToSchema(z.object({
  zoneId: z.string().min(1).describe("Zone ID (e.g., America/Los_Angeles)"),
  platform: z.enum(["android", "ios"]).describe("Platform")
}));

export const setTextDirectionSchema = addDeviceTargetingToSchema(z.object({
  rtl: z.boolean().describe("RTL layout"),
  platform: z.enum(["android", "ios"]).describe("Platform")
}));

export const set24HourFormatSchema = addDeviceTargetingToSchema(z.object({
  enabled: z.boolean().describe("24-hour format"),
  platform: z.enum(["android", "ios"]).describe("Platform")
}));

export const getCalendarSystemSchema = addDeviceTargetingToSchema(z.object({
  platform: z.enum(["android", "ios"]).describe("Platform")
}));

// Export interfaces for type safety
export interface DemoModeArgs extends DemoModeOptions {
  action: "enable" | "disable";
  platform: Platform;
}

export interface SetActiveDeviceArgs {
  deviceId: string;
    platform: Platform;
}

export interface SetLocaleArgs {
  languageTag: string;
  platform: Platform;
}

export interface SetTimeZoneArgs {
  zoneId: string;
  platform: Platform;
}

export interface SetTextDirectionArgs {
  rtl: boolean;
  platform: Platform;
}

export interface Set24HourFormatArgs {
  enabled: boolean;
  platform: Platform;
}

export interface GetCalendarSystemArgs {
  platform: Platform;
}

// Register tools
export function registerUtilityTools() {
  // Demo mode handler
  const demoModeHandler = async (device: BootedDevice, args: DemoModeArgs) => {
    try {
      const demoMode = new DemoMode(device);

      if (args.action === "enable") {
        const options: DemoModeOptions = {
          time: args.time,
          batteryLevel: args.batteryLevel,
          batteryPlugged: args.batteryPlugged,
          wifiLevel: args.wifiLevel,
          mobileDataType: args.mobileDataType,
          mobileSignalLevel: args.mobileSignalLevel,
          hideNotifications: args.hideNotifications,
        };
        const result = await demoMode.execute(options);
        const message = result.success ? "Demo mode enabled" : "Failed to enable demo mode";

        return createJSONToolResponse({
          message,
          ...result
        });
      }

      const result = await demoMode.exitDemoMode();
      const message = result.success ? "Demo mode disabled" : "Failed to disable demo mode";

      return createJSONToolResponse({
        message,
        ...result
      });
    } catch (error) {
      logger.error("Failed to set demo mode:", error);
      throw new ActionableError(`Failed to set demo mode: ${error}`);
    }
  };

  // Set active device handler
  const setActiveDeviceHandler = async (args: SetActiveDeviceArgs) => {
    try {
      await DeviceSessionManager.getInstance().ensureDeviceReady(args.platform, args.deviceId);

      return createJSONToolResponse({
        message: `Active device set to '${args.deviceId}'`,
        deviceId: args.deviceId,
      });
    } catch (error) {
      logger.error("Failed to set active device:", error);
      throw new ActionableError(`Failed to set active device: ${error}`);
    }
  };

  const setLocaleHandler = async (device: BootedDevice, args: SetLocaleArgs) => {
    const manager = new SystemConfigurationManager(device);
    const result = await manager.setLocale(args.languageTag);
    const message = result.success
      ? `Locale set to ${args.languageTag}`
      : `Failed to set locale${result.error ? `: ${result.error}` : ""}`;

    return createJSONToolResponse({
      message,
      ...result
    });
  };

  const setTimeZoneHandler = async (device: BootedDevice, args: SetTimeZoneArgs) => {
    const manager = new SystemConfigurationManager(device);
    const result = await manager.setTimeZone(args.zoneId);
    const message = result.success
      ? `Time zone set to ${args.zoneId}`
      : `Failed to set time zone${result.error ? `: ${result.error}` : ""}`;

    return createJSONToolResponse({
      message,
      ...result
    });
  };

  const setTextDirectionHandler = async (device: BootedDevice, args: SetTextDirectionArgs) => {
    const manager = new SystemConfigurationManager(device);
    const result = await manager.setTextDirection(args.rtl);
    const message = result.success
      ? `Text direction set to ${args.rtl ? "RTL" : "LTR"}`
      : `Failed to set text direction${result.error ? `: ${result.error}` : ""}`;

    return createJSONToolResponse({
      message,
      ...result
    });
  };

  const set24HourFormatHandler = async (device: BootedDevice, args: Set24HourFormatArgs) => {
    const manager = new SystemConfigurationManager(device);
    const result = await manager.set24HourFormat(args.enabled);
    const message = result.success
      ? `24-hour format ${args.enabled ? "enabled" : "disabled"}`
      : `Failed to set 24-hour format${result.error ? `: ${result.error}` : ""}`;

    return createJSONToolResponse({
      message,
      ...result
    });
  };

  const getCalendarSystemHandler = async (device: BootedDevice, _args: GetCalendarSystemArgs) => {
    const manager = new SystemConfigurationManager(device);
    const result = await manager.getCalendarSystem();
    const message = result.success
      ? `Calendar system: ${result.calendarSystem ?? "unknown"}`
      : `Failed to read calendar system${result.error ? `: ${result.error}` : ""}`;

    return createJSONToolResponse({
      message,
      ...result
    });
  };

  // Register with the tool registry
  ToolRegistry.registerDeviceAware(
    "demoMode",
    "Enable or disable demo mode for screenshots and screen recordings",
    demoModeSchema,
    demoModeHandler
  );

  ToolRegistry.register(
    "setActiveDevice",
    "Set active device",
    setActiveDeviceSchema,
    setActiveDeviceHandler
  );

  ToolRegistry.registerDeviceAware(
    "setLocale",
    "Switch locale",
    setLocaleSchema,
    setLocaleHandler
  );

  ToolRegistry.registerDeviceAware(
    "setTimeZone",
    "Change time zone",
    setTimeZoneSchema,
    setTimeZoneHandler
  );

  ToolRegistry.registerDeviceAware(
    "setTextDirection",
    "Set RTL layout direction",
    setTextDirectionSchema,
    setTextDirectionHandler
  );

  ToolRegistry.registerDeviceAware(
    "set24HourFormat",
    "Set 24-hour time format",
    set24HourFormatSchema,
    set24HourFormatHandler
  );

  ToolRegistry.registerDeviceAware(
    "getCalendarSystem",
    "Get calendar system",
    getCalendarSystemSchema,
    getCalendarSystemHandler
  );
}
