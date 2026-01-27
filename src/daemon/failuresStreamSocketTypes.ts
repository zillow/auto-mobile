import type { FailureGroup, TimelineDataPoint, PeriodTotals, FailureType, FailureSeverity } from "../server/failuresResources";

/**
 * Commands supported by the failures stream socket
 */
export type FailuresStreamCommand =
  | "poll_notifications"  // Get new failure notifications since cursor
  | "poll_groups"         // Get failure groups with optional filters
  | "poll_timeline"       // Get timeline data with aggregation
  | "acknowledge";        // Acknowledge notifications

/**
 * Time aggregation options for timeline queries
 */
export type TimeAggregation = "minute" | "hour" | "day" | "week";

/**
 * Date range presets
 */
export type DateRangePreset = "1h" | "24h" | "3d" | "7d" | "30d";

/**
 * Request to the failures stream socket
 */
export interface FailuresStreamSocketRequest {
  command: FailuresStreamCommand;

  // Cursor-based pagination for polling
  sinceTimestamp?: number;
  sinceId?: number;

  // Time range filters
  startTime?: number;
  endTime?: number;
  dateRange?: DateRangePreset;

  // Filtering
  type?: FailureType;
  severity?: FailureSeverity;
  acknowledged?: boolean;

  // Timeline aggregation
  aggregation?: TimeAggregation;

  // Pagination
  limit?: number;

  // For acknowledge command
  notificationIds?: number[];
}

/**
 * Failure notification entry for streaming
 */
export interface FailureNotificationEntry {
  id: number;
  occurrenceId: string;
  groupId: string;
  type: FailureType;
  severity: FailureSeverity;
  title: string;
  timestamp: number;
  acknowledged: boolean;
}

/**
 * Response from the failures stream socket
 */
export interface FailuresStreamSocketResponse {
  success: boolean;
  error?: string;

  // For poll_notifications command
  notifications?: FailureNotificationEntry[];

  // For poll_groups command
  groups?: FailureGroup[];
  totals?: {
    crashes: number;
    anrs: number;
    toolFailures: number;
  };

  // For poll_timeline command
  dataPoints?: TimelineDataPoint[];
  previousPeriodTotals?: PeriodTotals;

  // Cursor for next poll
  lastTimestamp?: number;
  lastId?: number;

  // For acknowledge command
  acknowledgedCount?: number;
}
