import { BaseDomainHandler } from "../DomainHandler";
import type { RequestResult, SubscriptionFilter, PushEvent } from "../UnifiedSocketTypes";
import { createError, ErrorCodes } from "../UnifiedSocketTypes";
import { PerformanceAuditRepository } from "../../../db/performanceAuditRepository";
import type { LivePerformanceData } from "../../performancePushSocketServer";

const DEFAULT_LIMIT = 200;

/**
 * Normalize timestamp to ISO string
 */
function normalizeTimestamp(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error(`Invalid ${label}: ${String(value)}`);
  }
  const raw = typeof value === "string" ? value.trim() : value;
  if (raw === "") {
    return undefined;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${label}: ${String(value)}`);
  }
  return date.toISOString();
}

/**
 * Normalize limit value
 */
function normalizeLimit(value: unknown): number {
  if (value === undefined || value === null) {
    return DEFAULT_LIMIT;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid limit: ${String(value)}`);
  }
  return parsed;
}

/**
 * Normalize sinceId value
 */
function normalizeSinceId(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid sinceId: ${String(value)}`);
  }
  return parsed;
}

/**
 * Performance subscription filter
 */
interface PerformanceFilter extends SubscriptionFilter {
  deviceId?: string;
  packageName?: string;
}

/**
 * Domain handler for performance metrics.
 *
 * Methods:
 * - poll: Get performance audit results since cursor
 *
 * Events:
 * - performance_push: Real-time performance data
 */
export class PerformanceDomainHandler extends BaseDomainHandler {
  readonly domain = "performance" as const;
  private readonly repository: PerformanceAuditRepository;

  constructor(repository: PerformanceAuditRepository = new PerformanceAuditRepository()) {
    super();
    this.repository = repository;
  }

  async handleRequest(
    method: string,
    params: Record<string, unknown> | undefined
  ): Promise<RequestResult> {
    switch (method) {
      case "poll":
        return await this.handlePoll(params ?? {});
      default:
        return {
          error: createError(ErrorCodes.UNKNOWN_METHOD, `Unknown method: ${method}`),
        };
    }
  }

  parseSubscriptionFilter(params: Record<string, unknown> | undefined): PerformanceFilter {
    return {
      deviceId: (params?.deviceId as string) ?? undefined,
      packageName: (params?.packageName as string) ?? undefined,
    };
  }

  matchesFilter(filter: SubscriptionFilter, event: PushEvent): boolean {
    const perfFilter = filter as PerformanceFilter;
    const data = event.data as LivePerformanceData;

    if (perfFilter.deviceId && perfFilter.deviceId !== data.deviceId) {
      return false;
    }
    if (perfFilter.packageName && perfFilter.packageName !== data.packageName) {
      return false;
    }

    return true;
  }

  /**
   * Push live performance data (called by data sources).
   */
  pushPerformanceData(data: LivePerformanceData): void {
    this.push("performance_push", data);
  }

  private async handlePoll(params: Record<string, unknown>): Promise<RequestResult> {
    try {
      const startTime = normalizeTimestamp(params.startTime, "startTime");
      const endTime = normalizeTimestamp(params.endTime, "endTime");
      const sinceTimestamp = normalizeTimestamp(params.sinceTimestamp, "sinceTimestamp");
      const sinceId = normalizeSinceId(params.sinceId);
      const limit = normalizeLimit(params.limit);

      const results = await this.repository.listResultsSince({
        startTime,
        endTime,
        limit,
        deviceId: (params.deviceId as string)?.trim() || undefined,
        sessionId: (params.sessionId as string)?.trim() || undefined,
        packageName: (params.packageName as string)?.trim() || undefined,
        sinceTimestamp,
        sinceId,
      });

      const last = results.length > 0 ? results[results.length - 1] : undefined;

      return {
        result: {
          results,
          lastTimestamp: last?.timestamp ?? sinceTimestamp,
          lastId: last?.id ?? sinceId,
        },
      };
    } catch (error) {
      return {
        error: createError(
          ErrorCodes.HANDLER_ERROR,
          error instanceof Error ? error.message : String(error)
        ),
      };
    }
  }
}
