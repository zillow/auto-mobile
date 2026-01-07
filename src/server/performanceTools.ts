import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { ActionableError } from "../models/ActionableError";
import { createJSONToolResponse } from "../utils/toolUtils";
import {
  buildPerformanceAuditResponse,
  PERFORMANCE_RESULTS_LIMIT_MAX,
  type PerformanceAuditQueryArgs,
} from "./performanceData";

const listPerformanceAuditResultsSchema: z.ZodType<PerformanceAuditQueryArgs> = z.object({
  startTime: z.union([z.string(), z.number()])
    .optional()
    .describe("Start timestamp (ISO string or epoch ms)"),
  endTime: z.union([z.string(), z.number()])
    .optional()
    .describe("End timestamp (ISO string or epoch ms)"),
  limit: z.number().int().positive().max(PERFORMANCE_RESULTS_LIMIT_MAX).optional().describe("Max results to return"),
  offset: z.number().int().nonnegative().optional().describe("Offset for pagination"),
  deviceId: z.string().optional().describe("Optional device ID filter"),
});

export function registerPerformanceTools(): void {
  ToolRegistry.register(
    "listPerformanceAuditResults",
    "List UI performance audit results from the local database.",
    listPerformanceAuditResultsSchema,
    async args => {
      try {
        const response = await buildPerformanceAuditResponse(args);
        return createJSONToolResponse(response);
      } catch (error) {
        throw new ActionableError(`Failed to list performance audit results: ${error}`);
      }
    }
  );
}
