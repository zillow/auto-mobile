import { z } from "zod";
import { ToolRegistry, ProgressCallback } from "./toolRegistry";
import { SetUIState } from "../features/action/SetUIState";
import { BootedDevice } from "../models";
import { createStructuredToolResponse } from "../utils/toolUtils";
import { defaultAdbClientFactory } from "../utils/android-cmdline-tools/AdbClientFactory";
import { addDeviceTargetingToSchema } from "./toolSchemaHelpers";
import {
  elementIdTextFieldsSchema,
  validateElementIdTextSelector
} from "./elementSelectorSchemas";

/**
 * Schema for a single field specification
 */
const fieldSpecSchema = z.object({
  selector: elementIdTextFieldsSchema.superRefine((value, ctx) => {
    validateElementIdTextSelector(value, ctx, "Provide exactly one of elementId or text in selector");
  }).describe("Selector to find the field element"),
  value: z.string().optional().describe("Value to set (for text inputs and dropdowns)"),
  selected: z.boolean().optional().describe("Target selection state (for checkboxes and toggles)")
}).refine(
  data => data.value !== undefined || data.selected !== undefined,
  { message: "Provide either value (for text/dropdown) or selected (for checkbox/toggle)" }
);

/**
 * Schema for setUIState tool input
 */
const setUIStateSchema = z.object({
  fields: z.array(fieldSpecSchema)
    .min(1, "At least one field is required")
    .describe("List of fields to set"),
  scrollDirection: z.enum(["up", "down"]).optional()
    .describe("Initial scroll direction when searching (default: down)")
});

/**
 * Output schema for field result
 */
const fieldResultSchema = z.object({
  selector: z.object({
    text: z.string().optional(),
    elementId: z.string().optional()
  }),
  success: z.boolean(),
  attempts: z.number(),
  verified: z.boolean().optional(),
  error: z.string().optional(),
  fieldType: z.enum(["text", "checkbox", "toggle", "dropdown", "unknown"]).optional(),
  skipped: z.boolean().optional()
});

/**
 * Output schema for setUIState result
 */
const setUIStateResultSchema = z.object({
  success: z.boolean().describe("Whether all fields were set successfully"),
  fields: z.array(fieldResultSchema).describe("Results for each field"),
  totalAttempts: z.number().describe("Total attempts across all fields"),
  error: z.string().optional().describe("Error message if the operation failed")
});

/**
 * Register form-related tools with the tool registry
 */
export function registerFormTools(): void {
  // setUIState tool
  ToolRegistry.registerDeviceAware(
    "setUIState",
    `Declaratively set UI form fields to desired values.

Instead of procedural steps (tap, clear, type), specify the desired end-state for each field.
Automatically handles:
- Field type detection (text input, checkbox, toggle, dropdown)
- Clearing existing text before typing
- Toggling checkboxes only when needed
- Scrolling to find hidden fields
- Retry on failure
- Value verification

Example usage:
\`\`\`json
{
  "fields": [
    { "selector": { "elementId": "username" }, "value": "john@example.com" },
    { "selector": { "text": "Password" }, "value": "secret123" },
    { "selector": { "elementId": "remember_me" }, "selected": true }
  ]
}
\`\`\``,
    addDeviceTargetingToSchema(setUIStateSchema),
    async (
      device: BootedDevice,
      args: z.infer<typeof setUIStateSchema>,
      progress?: ProgressCallback,
      signal?: AbortSignal
    ) => {
      const adb = device.platform === "android" ? defaultAdbClientFactory.create(device) : null;
      const setUIState = new SetUIState(device, adb);

      const result = await setUIState.execute(
        {
          fields: args.fields.map(f => ({
            selector: {
              text: f.selector.text,
              elementId: f.selector.elementId
            },
            value: f.value,
            selected: f.selected
          })),
          scrollDirection: args.scrollDirection
        },
        progress,
        signal
      );

      return createStructuredToolResponse({
        success: result.success,
        fields: result.fields.map(f => ({
          selector: f.selector,
          success: f.success,
          attempts: f.attempts,
          verified: f.verified,
          error: f.error,
          fieldType: f.fieldType,
          skipped: f.skipped
        })),
        totalAttempts: result.totalAttempts,
        error: result.error
      });
    },
    true, // supportsProgress
    false, // debugOnly
    { outputSchema: setUIStateResultSchema }
  );
}
