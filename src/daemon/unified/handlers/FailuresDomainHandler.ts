import { BaseDomainHandler } from "../DomainHandler";
import type { RequestResult, SubscriptionFilter, PushEvent } from "../UnifiedSocketTypes";
import { createError, ErrorCodes } from "../UnifiedSocketTypes";
import { FailureAnalyticsRepository } from "../../../db/failureAnalyticsRepository";
import type { FailureType, FailureSeverity } from "../../../server/failuresResources";
import {
  getFailuresPushServer,
  type FailureNotificationPush,
} from "../../failuresPushSocketServer";
import { Timer, defaultTimer } from "../../../utils/SystemTimer";

type DateRangePreset = "1h" | "24h" | "3d" | "7d" | "30d";
type TimeAggregation = "minute" | "hour" | "day" | "week";

const DEFAULT_LIMIT = 100;
const STREAM_LIMIT_MAX = 500;

/**
 * Get duration in ms for a date range preset
 */
function getDateRangeDuration(preset: DateRangePreset): number {
  switch (preset) {
    case "1h":
      return 60 * 60 * 1000;
    case "24h":
      return 24 * 60 * 60 * 1000;
    case "3d":
      return 3 * 24 * 60 * 60 * 1000;
    case "7d":
      return 7 * 24 * 60 * 60 * 1000;
    case "30d":
      return 30 * 24 * 60 * 60 * 1000;
  }
}

/**
 * Normalize and validate timestamp
 */
function normalizeTimestamp(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid ${label}: ${value}`);
    }
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return undefined;
    }
    const date = new Date(trimmed);
    if (!Number.isNaN(date.getTime())) {
      return date.getTime();
    }
    const num = Number(trimmed);
    if (Number.isFinite(num) && num >= 0) {
      return num;
    }
    throw new Error(`Invalid ${label}: ${value}`);
  }
  throw new Error(`Invalid ${label}: ${String(value)}`);
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
  return Math.min(parsed, STREAM_LIMIT_MAX);
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
 * Validate aggregation value
 */
function normalizeAggregation(value: unknown): TimeAggregation {
  if (value === undefined || value === null) {
    return "hour";
  }
  if (typeof value !== "string") {
    throw new Error(`Invalid aggregation: ${String(value)}`);
  }
  const valid: TimeAggregation[] = ["minute", "hour", "day", "week"];
  if (!valid.includes(value as TimeAggregation)) {
    throw new Error(`Invalid aggregation: ${value}. Must be one of: ${valid.join(", ")}`);
  }
  return value as TimeAggregation;
}

/**
 * Validate date range preset
 */
function normalizeDateRange(value: unknown): DateRangePreset | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`Invalid dateRange: ${String(value)}`);
  }
  const valid: DateRangePreset[] = ["1h", "24h", "3d", "7d", "30d"];
  if (!valid.includes(value as DateRangePreset)) {
    throw new Error(`Invalid dateRange: ${value}. Must be one of: ${valid.join(", ")}`);
  }
  return value as DateRangePreset;
}

/**
 * Failures subscription filter
 */
interface FailuresFilter extends SubscriptionFilter {
  type?: FailureType;
  severity?: FailureSeverity;
}

/**
 * Domain handler for failures.
 *
 * Methods:
 * - poll_notifications: Get new failure notifications since cursor
 * - poll_groups: Get failure groups with optional filters
 * - poll_timeline: Get timeline data with aggregation
 * - acknowledge: Acknowledge notifications
 *
 * Events:
 * - failure_occurred: Real-time failure notifications
 */
export class FailuresDomainHandler extends BaseDomainHandler {
  readonly domain = "failures" as const;
  private readonly repository: FailureAnalyticsRepository;
  private legacyPushCallback: ((data: FailureNotificationPush) => void) | null = null;
  private timer: Timer;

  constructor(repository: FailureAnalyticsRepository = new FailureAnalyticsRepository(), timer: Timer = defaultTimer) {
    super();
    this.repository = repository;
    this.timer = timer;
  }

  async handleRequest(
    method: string,
    params: Record<string, unknown> | undefined
  ): Promise<RequestResult> {
    switch (method) {
      case "poll_notifications":
        return await this.handlePollNotifications(params ?? {});
      case "poll_groups":
        return await this.handlePollGroups(params ?? {});
      case "poll_timeline":
        return await this.handlePollTimeline(params ?? {});
      case "acknowledge":
        return await this.handleAcknowledge(params ?? {});
      default:
        return {
          error: createError(ErrorCodes.UNKNOWN_METHOD, `Unknown method: ${method}`),
        };
    }
  }

  parseSubscriptionFilter(params: Record<string, unknown> | undefined): FailuresFilter {
    return {
      type: (params?.type as FailureType) ?? undefined,
      severity: (params?.severity as FailureSeverity) ?? undefined,
    };
  }

  matchesFilter(filter: SubscriptionFilter, event: PushEvent): boolean {
    const failuresFilter = filter as FailuresFilter;
    const data = event.data as FailureNotificationPush;

    if (failuresFilter.type && failuresFilter.type !== data.type) {
      return false;
    }
    if (failuresFilter.severity && failuresFilter.severity !== data.severity) {
      return false;
    }

    return true;
  }

  initialize(pushCallback: (event: string, data: unknown, filter?: SubscriptionFilter) => void): void {
    super.initialize(pushCallback);

    // Hook into the legacy push server if available
    const legacyServer = getFailuresPushServer();
    if (legacyServer) {
      // The legacy server doesn't have a callback mechanism,
      // but we can intercept pushes via the data source when available
    }
  }

  /**
   * Push a failure event (called by data sources).
   */
  pushFailure(data: FailureNotificationPush): void {
    this.push("failure_occurred", data);
  }

  private async handlePollNotifications(
    params: Record<string, unknown>
  ): Promise<RequestResult> {
    try {
      const sinceTimestamp = normalizeTimestamp(params.sinceTimestamp, "sinceTimestamp");
      const sinceId = normalizeSinceId(params.sinceId);
      const limit = normalizeLimit(params.limit);

      let startTime = normalizeTimestamp(params.startTime, "startTime");
      let endTime = normalizeTimestamp(params.endTime, "endTime");

      const dateRange = normalizeDateRange(params.dateRange);
      if (dateRange && !startTime) {
        const now = this.timer.now();
        endTime = endTime ?? now;
        startTime = endTime - getDateRangeDuration(dateRange);
      }

      const result = await this.repository.getNotificationsSince({
        sinceTimestamp,
        sinceId,
        startTime,
        endTime,
        limit,
        type: params.type as FailureType | undefined,
        acknowledged: params.acknowledged as boolean | undefined,
      });

      return {
        result: {
          notifications: result.notifications,
          lastTimestamp: result.lastTimestamp,
          lastId: result.lastId,
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

  private async handlePollGroups(params: Record<string, unknown>): Promise<RequestResult> {
    try {
      let startTime = normalizeTimestamp(params.startTime, "startTime");
      let endTime = normalizeTimestamp(params.endTime, "endTime");

      const dateRange = normalizeDateRange(params.dateRange);
      if (dateRange && !startTime) {
        const now = this.timer.now();
        endTime = endTime ?? now;
        startTime = endTime - getDateRangeDuration(dateRange);
      }

      const result = await this.repository.getAggregatedGroups({
        startTime,
        endTime,
        type: params.type as FailureType | undefined,
        severity: params.severity as FailureSeverity | undefined,
      });

      return {
        result: {
          groups: result.groups,
          totals: result.totals,
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

  private async handlePollTimeline(params: Record<string, unknown>): Promise<RequestResult> {
    try {
      const aggregation = normalizeAggregation(params.aggregation);

      let startTime = normalizeTimestamp(params.startTime, "startTime");
      let endTime = normalizeTimestamp(params.endTime, "endTime");

      const dateRange = normalizeDateRange(params.dateRange);
      const now = this.timer.now();

      if (dateRange) {
        endTime = endTime ?? now;
        startTime = endTime - getDateRangeDuration(dateRange);
      } else {
        endTime = endTime ?? now;
        startTime = startTime ?? endTime - 24 * 60 * 60 * 1000;
      }

      const result = await this.repository.getTimelineData({
        startTime,
        endTime,
        aggregation,
      });

      return {
        result: {
          dataPoints: result.dataPoints,
          previousPeriodTotals: result.previousPeriodTotals,
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

  private async handleAcknowledge(params: Record<string, unknown>): Promise<RequestResult> {
    try {
      const ids = params.notificationIds;
      if (!ids || !Array.isArray(ids)) {
        return {
          error: createError(
            ErrorCodes.INVALID_MESSAGE,
            "notificationIds is required for acknowledge method"
          ),
        };
      }

      for (const id of ids) {
        if (typeof id !== "number" || !Number.isInteger(id) || id < 0) {
          return {
            error: createError(ErrorCodes.INVALID_MESSAGE, `Invalid notification ID: ${String(id)}`),
          };
        }
      }

      await this.repository.acknowledgeNotifications(ids);

      return {
        result: {
          acknowledgedCount: ids.length,
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
