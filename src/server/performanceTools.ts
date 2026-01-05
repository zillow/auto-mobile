import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { ActionableError } from "../models/ActionableError";
import { createJSONToolResponse } from "../utils/toolUtils";
import { PerformanceAuditRepository } from "../db/performanceAuditRepository";
import { ToolCallRepository } from "../db/toolCallRepository";

const listPerformanceAuditResultsSchema = z.object({
  startTime: z.union([z.string(), z.number()])
    .optional()
    .describe("Start timestamp (ISO string or epoch ms)"),
  endTime: z.union([z.string(), z.number()])
    .optional()
    .describe("End timestamp (ISO string or epoch ms)"),
  limit: z.number().int().positive().max(500).optional().describe("Max results to return"),
  offset: z.number().int().nonnegative().optional().describe("Offset for pagination"),
  deviceId: z.string().optional().describe("Optional device ID filter"),
});

function normalizeTimestamp(value?: string | number): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${value}`);
  }
  return date.toISOString();
}

function getTimestampRange(timestamps: string[]): { start: string; end: string } | null {
  if (timestamps.length === 0) {
    return null;
  }
  let start = timestamps[0];
  let end = timestamps[0];
  for (const timestamp of timestamps) {
    if (timestamp < start) {
      start = timestamp;
    }
    if (timestamp > end) {
      end = timestamp;
    }
  }
  return { start, end };
}

export function registerPerformanceTools(): void {
  const auditRepository = new PerformanceAuditRepository();
  const toolCallRepository = new ToolCallRepository();

  ToolRegistry.register(
    "listPerformanceAuditResults",
    "List UI performance audit results from the local database.",
    listPerformanceAuditResultsSchema,
    async args => {
      try {
        const startTime = normalizeTimestamp(args.startTime);
        const endTime = normalizeTimestamp(args.endTime);
        const limit = args.limit ?? 50;
        const offset = args.offset ?? 0;

        const page = await auditRepository.listResults({
          startTime,
          endTime,
          limit,
          offset,
          deviceId: args.deviceId,
        });

        const range = getTimestampRange(page.results.map(result => result.timestamp));
        const toolCalls = range
          ? await toolCallRepository.listToolNamesBetween(
            range.start,
            range.end,
            ["listPerformanceAuditResults"]
          )
          : [];

        return createJSONToolResponse({
          results: page.results,
          toolCalls,
          hasMore: page.hasMore,
          nextOffset: page.nextOffset,
          range: range ? { startTime: range.start, endTime: range.end } : null,
        });
      } catch (error) {
        throw new ActionableError(`Failed to list performance audit results: ${error}`);
      }
    }
  );
}
