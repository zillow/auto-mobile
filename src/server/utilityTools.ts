import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { ActionableError } from "../models/ActionableError";
import { SystemConfigurationManager } from "../features/utility/SystemConfigurationManager";
import { logger } from "../utils/logger";
import { createJSONToolResponse } from "../utils/toolUtils";
import { DeviceSessionManager } from "../utils/DeviceSessionManager";
import { BootedDevice, Platform } from "../models";
import { addDeviceTargetingToSchema, addSessionUuidToSchema, platformSchema } from "./toolSchemaHelpers";

// Schema definitions
export const setActiveDeviceSchema = addSessionUuidToSchema(z.object({
  deviceId: z.string().describe("Device ID"),
  platform: platformSchema
}));

const changeLocalizationBaseSchema = z.object({
  platform: platformSchema,
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
