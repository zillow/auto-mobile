import { z } from "zod";

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
