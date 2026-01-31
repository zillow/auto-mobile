import os from "node:os";
import path from "node:path";
import { Timer, defaultTimer } from "../utils/SystemTimer";
import { RequestResponseSocketServer, getSocketPath, SocketServerConfig } from "./socketServer/index";
import { FailureAnalyticsRepository } from "../db/failureAnalyticsRepository";
import type {
  FailuresStreamSocketRequest,
  FailuresStreamSocketResponse,
  DateRangePreset,
  TimeAggregation,
} from "./failuresStreamSocketTypes";

const SOCKET_CONFIG: SocketServerConfig = {
  defaultPath: path.join(os.homedir(), ".auto-mobile", "failures-stream.sock"),
  externalPath: "/tmp/auto-mobile-failures-stream.sock",
};

const DEFAULT_LIMIT = 100;
const STREAM_LIMIT_MAX = 500;
const failureAnalyticsRepository = new FailureAnalyticsRepository();

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
    // Try parsing as ISO string or number
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
 * Socket server for failures stream.
 * Handles poll_notifications, poll_groups, poll_timeline, and acknowledge commands.
 */
export class FailuresStreamSocketServer extends RequestResponseSocketServer<
  FailuresStreamSocketRequest,
  FailuresStreamSocketResponse
> {
  constructor(socketPath: string = getSocketPath(SOCKET_CONFIG), timer: Timer = defaultTimer) {
    super(socketPath, timer, "FailuresStream");
  }

  protected async handleRequest(
    request: FailuresStreamSocketRequest
  ): Promise<FailuresStreamSocketResponse> {
    switch (request.command) {
      case "poll_notifications":
        return await this.handlePollNotifications(request);
      case "poll_groups":
        return await this.handlePollGroups(request);
      case "poll_timeline":
        return await this.handlePollTimeline(request);
      case "acknowledge":
        return await this.handleAcknowledge(request);
      default:
        throw new Error(`Unsupported command: ${String(request.command)}`);
    }
  }

  protected createErrorResponse(_id: string | undefined, error: string): FailuresStreamSocketResponse {
    return {
      success: false,
      error,
    };
  }

  private async handlePollNotifications(
    request: FailuresStreamSocketRequest
  ): Promise<FailuresStreamSocketResponse> {
    const sinceTimestamp = normalizeTimestamp(request.sinceTimestamp, "sinceTimestamp");
    const sinceId = normalizeSinceId(request.sinceId);
    const limit = normalizeLimit(request.limit);

    // Calculate time range if dateRange is provided
    let startTime = normalizeTimestamp(request.startTime, "startTime");
    let endTime = normalizeTimestamp(request.endTime, "endTime");

    const dateRange = normalizeDateRange(request.dateRange);
    if (dateRange && !startTime) {
      const now = Date.now();
      endTime = endTime ?? now;
      startTime = endTime - getDateRangeDuration(dateRange);
    }

    const result = await failureAnalyticsRepository.getNotificationsSince({
      sinceTimestamp,
      sinceId,
      startTime,
      endTime,
      limit,
      type: request.type,
      acknowledged: request.acknowledged,
    });

    return {
      success: true,
      notifications: result.notifications,
      lastTimestamp: result.lastTimestamp,
      lastId: result.lastId,
    };
  }

  private async handlePollGroups(
    request: FailuresStreamSocketRequest
  ): Promise<FailuresStreamSocketResponse> {
    // Calculate time range if dateRange is provided
    let startTime = normalizeTimestamp(request.startTime, "startTime");
    let endTime = normalizeTimestamp(request.endTime, "endTime");

    const dateRange = normalizeDateRange(request.dateRange);
    if (dateRange && !startTime) {
      const now = Date.now();
      endTime = endTime ?? now;
      startTime = endTime - getDateRangeDuration(dateRange);
    }

    const result = await failureAnalyticsRepository.getAggregatedGroups({
      startTime,
      endTime,
      type: request.type,
      severity: request.severity,
    });

    return {
      success: true,
      groups: result.groups,
      totals: result.totals,
    };
  }

  private async handlePollTimeline(
    request: FailuresStreamSocketRequest
  ): Promise<FailuresStreamSocketResponse> {
    const aggregation = normalizeAggregation(request.aggregation);

    // Calculate time range
    let startTime = normalizeTimestamp(request.startTime, "startTime");
    let endTime = normalizeTimestamp(request.endTime, "endTime");

    const dateRange = normalizeDateRange(request.dateRange);
    const now = Date.now();

    if (dateRange) {
      endTime = endTime ?? now;
      startTime = endTime - getDateRangeDuration(dateRange);
    } else {
      // Default to 24h if no range specified
      endTime = endTime ?? now;
      startTime = startTime ?? (endTime - 24 * 60 * 60 * 1000);
    }

    const result = await failureAnalyticsRepository.getTimelineData({
      startTime,
      endTime,
      aggregation,
    });

    return {
      success: true,
      dataPoints: result.dataPoints,
      previousPeriodTotals: result.previousPeriodTotals,
    };
  }

  private async handleAcknowledge(
    request: FailuresStreamSocketRequest
  ): Promise<FailuresStreamSocketResponse> {
    const ids = request.notificationIds;
    if (!ids || !Array.isArray(ids)) {
      throw new Error("notificationIds is required for acknowledge command");
    }

    // Validate all IDs are numbers
    for (const id of ids) {
      if (typeof id !== "number" || !Number.isInteger(id) || id < 0) {
        throw new Error(`Invalid notification ID: ${String(id)}`);
      }
    }

    await failureAnalyticsRepository.acknowledgeNotifications(ids);

    return {
      success: true,
      acknowledgedCount: ids.length,
    };
  }
}

let socketServer: FailuresStreamSocketServer | null = null;

export async function startFailuresStreamSocketServer(): Promise<void> {
  if (!socketServer) {
    socketServer = new FailuresStreamSocketServer();
  }
  if (!socketServer.isListening()) {
    await socketServer.start();
  }
}

export async function stopFailuresStreamSocketServer(): Promise<void> {
  if (!socketServer) {
    return;
  }
  await socketServer.close();
  socketServer = null;
}
