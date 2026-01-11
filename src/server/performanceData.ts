import { PerformanceAuditRepository } from "../db/performanceAuditRepository";
import { ToolCallRepository } from "../db/toolCallRepository";
import type { PerformanceAuditHistoryEntry } from "../db/performanceAuditRepository";

export const DEFAULT_PERFORMANCE_RESULTS_LIMIT = 50;
export const DEFAULT_PERFORMANCE_RESULTS_OFFSET = 0;
export const PERFORMANCE_RESULTS_LIMIT_MAX = 500;

export interface PerformanceAuditQueryArgs {
  startTime?: string | number;
  endTime?: string | number;
  limit?: number;
  offset?: number;
  deviceId?: string;
}

export interface PerformanceAuditResponse {
  results: PerformanceAuditHistoryEntry[];
  toolCalls: string[];
  hasMore: boolean;
  nextOffset: number | null;
  range: { startTime: string; endTime: string } | null;
}

const auditRepository = new PerformanceAuditRepository();
const toolCallRepository = new ToolCallRepository();

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

export async function buildPerformanceAuditResponse(
  args: PerformanceAuditQueryArgs
): Promise<PerformanceAuditResponse> {
  const startTime = normalizeTimestamp(args.startTime);
  const endTime = normalizeTimestamp(args.endTime);
  const limit = args.limit ?? DEFAULT_PERFORMANCE_RESULTS_LIMIT;
  const offset = args.offset ?? DEFAULT_PERFORMANCE_RESULTS_OFFSET;

  const page = await auditRepository.listResults({
    startTime,
    endTime,
    limit,
    offset,
    deviceId: args.deviceId,
  });

  const range = getTimestampRange(page.results.map(result => result.timestamp));
  const toolCalls = range
    ? await toolCallRepository.listToolNamesBetween(range.start, range.end)
    : [];

  return {
    results: page.results,
    toolCalls,
    hasMore: page.hasMore,
    nextOffset: page.nextOffset,
    range: range ? { startTime: range.start, endTime: range.end } : null,
  };
}
