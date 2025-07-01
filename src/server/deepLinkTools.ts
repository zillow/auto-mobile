import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { GetDeepLinks } from "../features/utility/GetDeepLinks";
import { DetectIntentChooser } from "../features/observe/DetectIntentChooser";
import { HandleIntentChooser } from "../features/action/HandleIntentChooser";
import { ActionableError } from "../models";
import { createJSONToolResponse } from "../utils/toolUtils";
import { logger } from "../utils/logger";

// Schema definitions for tool arguments
export const getDeepLinksSchema = z.object({
  appId: z.string().describe("Android app package ID to query for deep links")
});

export const detectIntentChooserSchema = z.object({
  viewHierarchy: z.string().optional().describe("Optional view hierarchy XML to analyze (will observe screen if not provided)")
});

export const handleIntentChooserSchema = z.object({
  preference: z.enum(["always", "just_once", "custom"]).optional().describe("Preference for handling intent chooser (default: 'just_once')"),
  customAppPackage: z.string().optional().describe("Specific app package to select when preference is 'custom'"),
  viewHierarchy: z.string().optional().describe("Optional view hierarchy XML to analyze (will observe screen if not provided)")
});

// Type definitions for better TypeScript support
export interface GetDeepLinksArgs {
    appId: string;
}

export interface DetectIntentChooserArgs {
    viewHierarchy?: string;
}

export interface HandleIntentChooserArgs {
    preference?: "always" | "just_once" | "custom";
    customAppPackage?: string;
    viewHierarchy?: string;
}

// Register tools
export function registerDeepLinkTools() {

  // Get deep links handler
  const getDeepLinksHandler = async (deviceId: string, args: GetDeepLinksArgs) => {
    try {
      const getDeepLinks = new GetDeepLinks(deviceId);
      const result = await getDeepLinks.execute(args.appId);

      return createJSONToolResponse({
        message: `Discovered deep links for app ${args.appId}`,
        success: result.success,
        appId: result.appId,
        schemes: result.deepLinks.schemes,
        hosts: result.deepLinks.hosts,
        intentFilters: result.deepLinks.intentFilters,
        supportedMimeTypes: result.deepLinks.supportedMimeTypes,
        error: result.error,
        rawOutput: result.rawOutput
      });
    } catch (error) {
      logger.error(`[getDeepLinks] Failed to get deep links: ${error}`);
      throw new ActionableError(`Failed to get deep links: ${error}`);
    }
  };

  // Detect intent chooser handler
  const detectIntentChooserHandler = async (deviceId: string, args: DetectIntentChooserArgs) => {
    try {
      const detectIntentChooser = new DetectIntentChooser(deviceId);
      const result = await detectIntentChooser.execute(args.viewHierarchy);

      return createJSONToolResponse({
        message: `Intent chooser detection completed. Detected: ${result.detected}`,
        success: result.success,
        detected: result.detected,
        error: result.error,
        observation: result.observation
      });
    } catch (error) {
      logger.error(`[detectIntentChooser] Failed to detect intent chooser: ${error}`);
      throw new ActionableError(`Failed to detect intent chooser: ${error}`);
    }
  };

  // Handle intent chooser handler
  const handleIntentChooserHandler = async (deviceId: string, args: HandleIntentChooserArgs) => {
    try {
      const handleIntentChooser = new HandleIntentChooser(deviceId);
      const result = await handleIntentChooser.execute(
        args.preference || "just_once",
        args.customAppPackage,
        args.viewHierarchy
      );

      return createJSONToolResponse({
        message: result.detected
          ? `Intent chooser handled with preference: ${args.preference || "just_once"}`
          : "No intent chooser detected",
        success: result.success,
        detected: result.detected,
        action: result.action,
        appSelected: result.appSelected,
        error: result.error,
        observation: result.observation
      });
    } catch (error) {
      logger.error(`[handleIntentChooser] Failed to handle intent chooser: ${error}`);
      throw new ActionableError(`Failed to handle intent chooser: ${error}`);
    }
  };

  // Register with the tool registry
  ToolRegistry.registerDeviceAware(
    "getDeepLinks",
    "Query available deep links and intent filters for an Android application",
    getDeepLinksSchema,
    getDeepLinksHandler,
    false // Does not support progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "detectIntentChooser",
    "Detect system intent chooser dialog in the current view hierarchy",
    detectIntentChooserSchema,
    detectIntentChooserHandler,
    false // Does not support progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "handleIntentChooser",
    "Automatically handle system intent chooser dialog with specified preferences",
    handleIntentChooserSchema,
    handleIntentChooserHandler,
    false // Does not support progress notifications
  );
}
