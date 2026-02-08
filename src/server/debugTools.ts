import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { ActionableError } from "../models/ActionableError";
import { RawViewHierarchy } from "../features/debug/RawViewHierarchy";
import { DebugSearch } from "../features/debug/DebugSearch";
import { BugReport } from "../features/debug/BugReport";
import { highlightShapeSchema } from "../features/debug/VisualHighlight";
import { createJSONToolResponse } from "../utils/toolUtils";
import { BootedDevice, HighlightShape, Platform } from "../models";
import { addDeviceTargetingToSchema } from "./toolSchemaHelpers";
import { isDebugModeEnabled } from "../utils/debug";
import {
  elementContainerSchema,
  elementIdTextFieldsSchema,
  validateElementIdTextSelector
} from "./elementSelectorSchemas";

const ensureDebugEnabled = () => {
  if (!isDebugModeEnabled()) {
    throw new ActionableError("Debug mode is disabled. Enable the 'debug' feature flag to use this tool.");
  }
};

// Type definitions for tool arguments
export interface RawViewHierarchyArgs {
  platform: Platform;
  source?: "uiautomator" | "accessibility-service" | "both";
}

export interface DebugSearchArgs {
  platform: Platform;
  text?: string;
  elementId?: string;
  container?: {
    elementId?: string;
    text?: string;
  };
  partialMatch?: boolean;
  caseSensitive?: boolean;
  includeNearMisses?: boolean;
  maxNearMisses?: number;
}

export interface BugReportArgs {
  platform: Platform;
  appId?: string;
  includeScreenshot?: boolean;
  includeRawHierarchy?: boolean;
  includeLogcat?: boolean;
  logcatLines?: number;
  saveToFile?: boolean;
  saveDir?: string;
  highlights?: Array<{
    description?: string;
    shape: HighlightShape;
  }>;
  includeHighlightsInScreenshot?: boolean;
}

// Schema definitions
export const rawViewHierarchySchema = addDeviceTargetingToSchema(z.object({
  platform: z.enum(["android", "ios"]).describe("Target platform"),
  source: z.enum(["uiautomator", "accessibility-service", "both"])
    .optional()
    .describe("Source for hierarchy extraction (Android only, ignored on iOS): 'uiautomator' for raw XML, 'accessibility-service' for JSON, or 'both' for comparison. iOS always returns XCUITest JSON.")
}));

const debugSearchBaseSchema = z.object({
  platform: z.enum(["android", "ios"]).describe("Target platform"),
  text: z.string().optional().describe("Text to search for in elements"),
  elementId: elementIdTextFieldsSchema.shape.elementId.describe(
    "Element resource ID / accessibility identifier to search for"
  ),
  container: elementContainerSchema.optional().describe(
    "Container element to scope the search - specify elementId or text to locate it"
  ),
  partialMatch: z.boolean().optional().describe("Whether to use partial matching (substring containment, default: true)"),
  caseSensitive: z.boolean().optional().describe("Whether to use case-sensitive matching (default: false)"),
  includeNearMisses: z.boolean().optional().describe("Include elements that almost matched (default: true)"),
  maxNearMisses: z.number().optional().describe("Maximum number of near-misses to include (default: 10)")
}).strict();

export const debugSearchSchema = addDeviceTargetingToSchema(debugSearchBaseSchema).superRefine((value, ctx) => {
  validateElementIdTextSelector(value, ctx);
});

export const bugReportSchema = addDeviceTargetingToSchema(z.object({
  platform: z.enum(["android", "ios"]).describe("Target platform"),
  appId: z.string().optional().describe("App package ID to filter logcat for specific app"),
  includeScreenshot: z.boolean().optional().describe("Whether to include screenshot (default: true)"),
  includeRawHierarchy: z.boolean().optional().describe("Whether to include raw view hierarchy XML (default: true)"),
  includeLogcat: z.boolean().optional().describe("Whether to include logcat entries (default: true)"),
  logcatLines: z.number().optional().describe("Number of recent logcat lines to include (default: 100)"),
  saveToFile: z.boolean().optional().describe("Whether to save full report to a file (default: false)"),
  saveDir: z.string().optional().describe("Directory to save report to"),
  highlights: z.array(z.object({
    description: z.string().min(1).optional().describe("Description of the highlight"),
    shape: highlightShapeSchema
  })).optional().describe("Highlights to add during report generation"),
  includeHighlightsInScreenshot: z.boolean().optional().describe("Whether screenshot should include highlight overlays (default: true)")
}));

// Register debug tools
export function registerDebugTools() {
  // Raw View Hierarchy handler
  const rawViewHierarchyHandler = async (device: BootedDevice, args: RawViewHierarchyArgs) => {
    try {
      ensureDebugEnabled();
      const rawViewHierarchy = new RawViewHierarchy(device);
      const result = await rawViewHierarchy.execute({
        source: args.source
      });
      return createJSONToolResponse(result);
    } catch (error) {
      throw new ActionableError(`Failed to get raw view hierarchy: ${error}`);
    }
  };

  // Debug Search handler
  const debugSearchHandler = async (device: BootedDevice, args: DebugSearchArgs) => {
    try {
      ensureDebugEnabled();
      if (!args.text && !args.elementId) {
        throw new ActionableError("Either 'text' or 'elementId' must be provided");
      }

      const debugSearch = new DebugSearch(device);
      const result = await debugSearch.execute({
        text: args.text,
        resourceId: args.elementId,
        container: args.container,
        partialMatch: args.partialMatch,
        caseSensitive: args.caseSensitive,
        includeNearMisses: args.includeNearMisses,
        maxNearMisses: args.maxNearMisses
      });
      return createJSONToolResponse(result);
    } catch (error) {
      if (error instanceof ActionableError) {
        throw error;
      }
      throw new ActionableError(`Failed to execute debug search: ${error}`);
    }
  };

  // Bug Report handler
  const bugReportHandler = async (device: BootedDevice, args: BugReportArgs) => {
    try {
      ensureDebugEnabled();
      const bugReport = new BugReport(device);
      const result = await bugReport.execute({
        appId: args.appId,
        includeScreenshot: args.includeScreenshot,
        includeRawHierarchy: args.includeRawHierarchy,
        includeLogcat: args.includeLogcat,
        logcatLines: args.logcatLines,
        saveToFile: args.saveToFile,
        saveDir: args.saveDir,
        highlights: args.highlights,
        includeHighlightsInScreenshot: args.includeHighlightsInScreenshot
      });
      return createJSONToolResponse(result);
    } catch (error) {
      throw new ActionableError(`Failed to generate bug report: ${error}`);
    }
  };

  // Register tools with the tool registry
  ToolRegistry.registerDeviceAware(
    "rawViewHierarchy",
    "Get raw view hierarchy data without parsing. Returns XML from uiautomator and/or JSON from accessibility service. Useful for debugging when parsed hierarchy doesn't match what's on screen.",
    rawViewHierarchySchema,
    rawViewHierarchyHandler,
    false,
    true
  );

  ToolRegistry.registerDeviceAware(
    "debugSearch",
    "Debug element search operations. Shows all matching elements, which one would be selected, and near-misses that almost matched. Use this to understand why an element isn't being found or why the wrong element is being selected.",
    debugSearchSchema,
    debugSearchHandler,
    false,
    true
  );

  ToolRegistry.registerDeviceAware(
    "bugReport",
    "Generate a comprehensive bug report for debugging AutoMobile interactions. Captures screen state, view hierarchy, logcat, window info, optional screenshot, and optional visual highlight metadata. The report can be saved to a file for sharing with AutoMobile developers.",
    bugReportSchema,
    bugReportHandler,
    false,
    true
  );
}
