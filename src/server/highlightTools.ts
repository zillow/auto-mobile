import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { addDeviceTargetingToSchema } from "./toolSchemaHelpers";
import { createJSONToolResponse } from "../utils/toolUtils";
import { ActionableError, BootedDevice, HighlightOperationResult, Platform } from "../models";
import { highlightShapeSchema, VisualHighlightClient } from "../features/debug/VisualHighlight";

const UNSUPPORTED_MESSAGE = "Visual highlights are only supported on Android devices.";

const generateHighlightId = (): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `highlight_${timestamp}_${random}`;
};

const baseHighlightSchema = addDeviceTargetingToSchema(z.object({
  platform: z.enum(["android", "ios"]).describe("Target platform"),
  deviceId: z.string().optional().describe("Optional device ID override"),
  timeoutMs: z.number().int().positive().optional().describe("Highlight request timeout ms (default: 5000)")
}));

export const highlightSchema = baseHighlightSchema.extend({
  shape: highlightShapeSchema.describe("Highlight shape definition")
});

export type HighlightArgs = z.infer<typeof highlightSchema>;

const toHighlightResponse = (result: HighlightOperationResult, highlightId: string) => (
  createJSONToolResponse({
    success: result.success,
    highlightId,
    error: result.error ?? undefined
  })
);

const toHighlightErrorResponse = (error: unknown, highlightId: string) => {
  const message = error instanceof ActionableError ? error.message : String(error);
  return createJSONToolResponse({
    success: false,
    highlightId,
    error: message
  });
};

export function registerHighlightTools() {
  const highlightHandler = async (device: BootedDevice, args: HighlightArgs) => {
    const highlightClient = new VisualHighlightClient();
    const highlightId = generateHighlightId();
    const options = {
      device,
      deviceId: args.deviceId ?? device.deviceId,
      platform: args.platform as Platform,
      sessionUuid: args.sessionUuid,
      timeoutMs: args.timeoutMs
    };

    try {
      const result = await highlightClient.addHighlight(highlightId, args.shape, options);
      return toHighlightResponse(result, highlightId);
    } catch (error) {
      return toHighlightErrorResponse(error, highlightId);
    }
  };

  const highlightNonDeviceHandler = async (args: HighlightArgs) => {
    const highlightId = generateHighlightId();
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
