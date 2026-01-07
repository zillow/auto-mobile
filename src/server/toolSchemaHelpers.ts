import { z } from "zod";

export const DEVICE_LABEL_DESCRIPTION =
  "Optional device label for multi-device control only (use letters like \"A\", \"B\", \"C\").";

/**
 * Helper to add sessionUuid field to tool schemas
 *
 * This enables session-based device assignment for tools that need it.
 * The sessionUuid parameter is optional and allows tools to be targeted
 * at specific devices through session context.
 */
export function addSessionUuidToSchema<T extends z.ZodObject<any>>(schema: T): z.ZodObject<any> {
  return schema.extend({
    sessionUuid: z.string().optional().describe("Session UUID for session-based device targeting (optional)"),
  }) as z.ZodObject<any>;
}

/**
 * Helper to add device label field to tool schemas.
 */
export function addDeviceLabelToSchema<T extends z.ZodObject<any>>(schema: T): z.ZodObject<any> {
  return schema.extend({
    device: z.string().optional().describe(DEVICE_LABEL_DESCRIPTION),
  }) as z.ZodObject<any>;
}

/**
 * Helper to add sessionUuid + device label fields to tool schemas.
 */
export function addDeviceTargetingToSchema<T extends z.ZodObject<any>>(schema: T): z.ZodObject<any> {
  return addDeviceLabelToSchema(addSessionUuidToSchema(schema));
}
