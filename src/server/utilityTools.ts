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

const changeLocalizationBaseSchema = z.object({
  platform: z.enum(["android", "ios"]).describe("Platform"),
  locale: z.string().min(1).optional().describe("Locale tag (e.g., ar-SA, ja-JP)"),
  timeZone: z.string().min(1).optional().describe("Zone ID (e.g., America/Los_Angeles)"),
  textDirection: z.enum(["ltr", "rtl"]).optional().describe("Text direction"),
  timeFormat: z.enum(["12", "24"]).optional().describe("Time format")
});

export const changeLocalizationSchema = addDeviceTargetingToSchema(changeLocalizationBaseSchema).refine(values =>
  values.locale || values.timeZone || values.textDirection || values.timeFormat, {
  message: "At least one of locale, timeZone, textDirection, or timeFormat must be provided."
});

// Export interfaces for type safety
export interface DemoModeArgs extends DemoModeOptions {
  action: "enable" | "disable";
  platform: Platform;
}

export interface SetActiveDeviceArgs {
  deviceId: string;
    platform: Platform;
}

export interface ChangeLocalizationArgs {
  platform: Platform;
  locale?: string;
  timeZone?: string;
  textDirection?: "ltr" | "rtl";
  timeFormat?: "12" | "24";
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

  const changeLocalizationHandler = async (device: BootedDevice, args: ChangeLocalizationArgs) => {
    const manager = new SystemConfigurationManager(device);
    const changes: {
      locale?: string;
      timeZone?: string;
      textDirection?: "ltr" | "rtl";
      timeFormat?: "12" | "24";
    } = {};
    const errors: string[] = [];

    if (args.locale !== undefined) {
      const result = await manager.setLocale(args.locale, { broadcast: false });
      if (result.success) {
        changes.locale = result.languageTag;
      } else {
        errors.push(result.error ?? "Failed to set locale");
      }
    }

    if (args.timeZone !== undefined) {
      const result = await manager.setTimeZone(args.timeZone);
      if (result.success) {
        changes.timeZone = result.zoneId;
      } else {
        errors.push(result.error ?? "Failed to set time zone");
      }
    }

    if (args.textDirection !== undefined) {
      const rtl = args.textDirection === "rtl";
      const result = await manager.setTextDirection(rtl, { broadcast: false });
      if (result.success) {
        changes.textDirection = rtl ? "rtl" : "ltr";
      } else {
        errors.push(result.error ?? "Failed to set text direction");
      }
    }

    if (args.timeFormat !== undefined) {
      const enabled = args.timeFormat === "24";
      const result = await manager.set24HourFormat(enabled);
      if (result.success) {
        changes.timeFormat = enabled ? "24" : "12";
      } else {
        errors.push(result.error ?? "Failed to set time format");
      }
    }

    const success = errors.length === 0;
    let intentBroadcast = false;
    if (Object.keys(changes).length > 0 && device.platform === "android") {
      intentBroadcast = await manager.broadcastLocaleChange();
    }

    return createJSONToolResponse({
      success,
      changes,
      intentBroadcast,
      ...(success ? {} : { error: errors.join("; ") })
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
    "changeLocalization",
    "Change locale, time zone, text direction, and time format",
    changeLocalizationSchema,
    changeLocalizationHandler
  );
}
