import { z } from "zod";

/** Shared platform schema — single source of truth for all tool schemas. */
export const platformSchema = z.enum(["android", "ios"]).describe("Target platform");

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
 * Helper to add deviceId field to tool schemas.
 *
 * Authored plans should prefer device labels (`device`) rather than concrete
 * device IDs, because runtime device IDs are not known ahead of execution.
 *
 * The executor may still inject a resolved deviceId into requiresDevice tool
 * calls after device allocation. Tools with strict schemas must explicitly
 * declare deviceId to avoid validation failures for that internal injection.
 */
function addDeviceIdToSchema<T extends z.ZodObject<any>>(schema: T): z.ZodObject<any> {
  return schema.extend({
    deviceId: z.string().optional().describe("Device identifier for targeting a specific device"),
  }) as z.ZodObject<any>;
}

/**
 * Helper to add sessionUuid + device label + deviceId fields to tool schemas.
 */
export function addDeviceTargetingToSchema<T extends z.ZodObject<any>>(schema: T): z.ZodObject<any> {
  return addDeviceIdToSchema(addDeviceLabelToSchema(addSessionUuidToSchema(schema)));
}
