import { z } from "zod";

export const DEVICE_LABEL_DESCRIPTION =
  "Device label for multi-device plans (e.g., \"A\", \"B\")";

/**
 * Helper to add sessionUuid field to tool schemas
 *
 * This enables session-based device assignment for tools that need it.
 * The sessionUuid parameter is optional and allows tools to be targeted
 * at specific devices through session context.
 */
export function addSessionUuidToSchema<T extends z.ZodObject<any>>(schema: T): z.ZodObject<any> {
  return schema.extend({
    sessionUuid: z.string().optional().describe("Session UUID for device targeting"),
    keepScreenAwake: z.boolean().optional().describe("Keep physical Android devices awake during the session (default: true)"),
  }) as z.ZodObject<any>;
}

/**
 * Helper to add device label field to tool schemas.
 */
function addDeviceLabelToSchema<T extends z.ZodObject<any>>(schema: T): z.ZodObject<any> {
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
