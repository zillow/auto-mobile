import { ResourceRegistry, ResourceContent } from "./resourceRegistry";
import { logger } from "../utils/logger";
import { FailureAnalyticsRepository } from "../db/failureAnalyticsRepository";
import { defaultTimer, type Timer } from "../utils/SystemTimer";

export const FAILURES_RESOURCE_URIS = {
  BASE: "automobile:failures",
  TIMELINE: "automobile:failures/timeline",
} as const;

const failureAnalyticsRepository = new FailureAnalyticsRepository();

// Type definitions matching IDE plugin models

export type FailureType = "crash" | "anr" | "tool_failure" | "nonfatal";
export type FailureSeverity = "critical" | "high" | "medium" | "low";
export type CaptureType = "screenshot" | "video";

export interface StackTraceElement {
  className: string;
  methodName: string;
  fileName: string | null;
  lineNumber: number | null;
  isAppCode: boolean;
}

export interface DeviceBreakdown {
  deviceModel: string;
  os: string;
  count: number;
  percentage: number;
}

export interface VersionBreakdown {
  version: string;
  count: number;
  percentage: number;
}

export interface ScreenBreakdown {
  screenName: string;
  visitCount: number;
  failureCount: number;
  visitPercentage: number;
}

export interface DurationStats {
  minMs: number;
  maxMs: number;
  avgMs: number;
  medianMs: number;
  p95Ms: number;
}

export interface AggregatedToolCallInfo {
  toolName: string;
  errorCodes: Record<string, number>;
  parameterVariants: Record<string, string[]>;
  durationStats: DurationStats | null;
}

export interface FailureCapture {
  id: string;
  type: CaptureType;
  path: string;
  timestamp: number;
  deviceModel: string;
}

export interface FailureOccurrence {
  id: string;
  timestamp: number;
  deviceModel: string;
  os: string;
  appVersion: string;
  sessionId: string;
  screenAtFailure: string | null;
  screensVisited: string[];
  testName: string | null;
  capturePath: string | null;
  captureType: CaptureType | null;
}

export interface FailureGroup {
  id: string;
  type: FailureType;
  signature: string;
  title: string;
  message: string;
  firstOccurrence: number;
  lastOccurrence: number;
  totalCount: number;
  uniqueSessions: number;
  severity: FailureSeverity;
  deviceBreakdown: DeviceBreakdown[];
  versionBreakdown: VersionBreakdown[];
  screenBreakdown: ScreenBreakdown[];
  failureScreens: Record<string, number>;
  stackTraceElements: StackTraceElement[];
  toolCallInfo: AggregatedToolCallInfo | null;
  affectedTests: Record<string, number>;
  recentCaptures: FailureCapture[];
  sampleOccurrences: FailureOccurrence[];
}

export interface FailuresResponse {
  groups: FailureGroup[];
  generatedAt: string;
}

export interface TimelineDataPoint {
  label: string;
  crashes: number;
  anrs: number;
  toolFailures: number;
  nonfatals: number;
}

export interface PeriodTotals {
  crashes: number;
  anrs: number;
  toolFailures: number;
  nonfatals: number;
}

export interface TimelineResponse {
  dataPoints: TimelineDataPoint[];
  dateRange: string;
  aggregation: string;
  previousPeriodTotals: PeriodTotals;
}

async function getFailuresResource(uri: string): Promise<ResourceContent> {
  try {
    const groups = await failureAnalyticsRepository.getFailureGroups();

    const response: FailuresResponse = {
      groups,
      generatedAt: new Date().toISOString(),
    };

    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(response, null, 2),
    };
  } catch (error) {
    logger.error(`[FailuresResources] Failed to get failures: ${error}`);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify({ error: `Failed to retrieve failures: ${error}` }, null, 2),
    };
  }
}

function getDateRangeDuration(preset: string): number {
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
    default:
      return 24 * 60 * 60 * 1000;
  }
}

async function getTimelineResource(params: Record<string, string>, timer: Timer = defaultTimer): Promise<ResourceContent> {
  try {
    const dateRange = params.dateRange || "24h";
    const aggregation = (params.aggregation || "hour") as "minute" | "hour" | "day" | "week";

    const now = timer.now();
    const duration = getDateRangeDuration(dateRange);
    const startTime = now - duration;
    const endTime = now;

    const result = await failureAnalyticsRepository.getTimelineData({
      startTime,
      endTime,
      aggregation,
    });

    const response: TimelineResponse = {
      dataPoints: result.dataPoints,
      dateRange,
      aggregation,
      previousPeriodTotals: result.previousPeriodTotals,
    };

    const uri = `${FAILURES_RESOURCE_URIS.TIMELINE}?dateRange=${dateRange}&aggregation=${aggregation}`;

    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(response, null, 2),
    };
  } catch (error) {
    logger.error(`[FailuresResources] Failed to get timeline: ${error}`);
    return {
      uri: FAILURES_RESOURCE_URIS.TIMELINE,
      mimeType: "application/json",
      text: JSON.stringify({ error: `Failed to retrieve timeline: ${error}` }, null, 2),
    };
  }
}

export function registerFailuresResources(): void {
  // Register base failures resource
  ResourceRegistry.register(
    FAILURES_RESOURCE_URIS.BASE,
    "Failures",
    "List all failure groups (crashes, ANRs, tool failures) with aggregated data.",
    "application/json",
    () => getFailuresResource(FAILURES_RESOURCE_URIS.BASE)
  );

  // Register timeline resource template
  ResourceRegistry.registerTemplate(
    `${FAILURES_RESOURCE_URIS.TIMELINE}?dateRange={dateRange}&aggregation={aggregation}`,
    "Failures Timeline",
    "Get timeline data for failures with configurable date range and aggregation.",
    "application/json",
    getTimelineResource
  );

  logger.info("[FailuresResources] Registered failures resources");
}
