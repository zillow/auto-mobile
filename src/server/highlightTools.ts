import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { addDeviceTargetingToSchema } from "./toolSchemaHelpers";
import { createJSONToolResponse } from "../utils/toolUtils";
import { ActionableError, BootedDevice, HighlightOperationResult, Platform } from "../models";
import { highlightShapeSchema, VisualHighlightClient } from "../features/debug/VisualHighlight";

const UNSUPPORTED_MESSAGE = "Visual highlights are only supported on Android devices.";

const baseHighlightSchema = addDeviceTargetingToSchema(z.object({
  platform: z.enum(["android", "ios"]).describe("Target platform"),
  deviceId: z.string().optional().describe("Optional device ID override"),
  timeoutMs: z.number().int().positive().optional().describe("Highlight request timeout ms (default: 5000)")
}));

export const highlightSchema = baseHighlightSchema.extend({
  action: z.enum(["add", "remove", "clear", "list"]).describe("Action to perform"),
  highlightId: z.string().min(1).optional().describe("Highlight ID (required for add/remove)"),
  shape: highlightShapeSchema.optional().describe("Highlight shape definition (required for add)")
}).superRefine((value, ctx) => {
  if (value.action === "add") {
    if (!value.highlightId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["highlightId"],
        message: "highlightId is required for add"
      });
    }
    if (!value.shape) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["shape"],
        message: "shape is required for add"
      });
    }
  }

  if (value.action === "remove") {
    if (!value.highlightId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["highlightId"],
        message: "highlightId is required for remove"
      });
    }
    if (value.shape) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["shape"],
        message: "shape is only allowed for add"
      });
    }
  }

  if (value.action === "clear" || value.action === "list") {
    if (value.highlightId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["highlightId"],
        message: "highlightId is only allowed for add/remove"
      });
    }
    if (value.shape) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["shape"],
        message: "shape is only allowed for add"
      });
    }
  }
});

export type HighlightArgs = z.infer<typeof highlightSchema>;

const toHighlightResponse = (result: HighlightOperationResult, highlightId?: string) => (
  createJSONToolResponse({
    success: result.success,
    highlightId,
    highlights: result.highlights,
    error: result.error ?? undefined
  })
);

const toHighlightErrorResponse = (error: unknown, highlightId?: string) => {
  const message = error instanceof ActionableError ? error.message : String(error);
  return createJSONToolResponse({
    success: false,
    highlightId,
    error: message
  });
};

export function registerHighlightTools() {
  const highlightHandler = async (device: BootedDevice, args: HighlightArgs) => {
    const highlightId = "highlightId" in args ? args.highlightId : undefined;
    const highlightClient = new VisualHighlightClient();
    const options = {
      device,
      deviceId: args.deviceId ?? device.deviceId,
      platform: args.platform as Platform,
      sessionUuid: args.sessionUuid,
      timeoutMs: args.timeoutMs
    };

    try {
      let result: HighlightOperationResult;
      switch (args.action) {
        case "add":
          result = await highlightClient.addHighlight(args.highlightId, args.shape, options);
          break;
        case "remove":
          result = await highlightClient.removeHighlight(args.highlightId, options);
          break;
        case "clear":
          result = await highlightClient.clearHighlights(options);
          break;
        case "list":
          result = await highlightClient.listHighlights(options);
          break;
        default:
          throw new ActionableError(`Unsupported highlight action: ${(args as { action: string }).action}`);
      }

      return toHighlightResponse(result, highlightId);
    } catch (error) {
      return toHighlightErrorResponse(error, highlightId);
    }
  };

  const highlightNonDeviceHandler = async (args: HighlightArgs) => {
    const highlightId = "highlightId" in args ? args.highlightId : undefined;
    return createJSONToolResponse({
      success: false,
      highlightId,
      error: UNSUPPORTED_MESSAGE
    });
  };

  ToolRegistry.registerDeviceAware(
    "highlight",
    "Draw a visual highlight (box or circle) on the device screen for debugging.",
    highlightSchema,
    highlightHandler,
    false,
    false,
    {
      shouldEnsureDevice: args => args.platform !== "ios",
      nonDeviceHandler: highlightNonDeviceHandler
    }
  );
}
