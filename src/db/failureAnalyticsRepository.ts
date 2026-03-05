import type { Kysely } from "kysely";
import { getDatabase } from "./database";
import type {
  Database,
  NewFailureGroup,
  NewFailureOccurrence,
  NewFailureOccurrenceScreen,
  NewFailureCapture,
  NewFailureNotification,
  FailureGroupUpdate,
} from "./types";
import { logger } from "../utils/logger";
import type { Timer } from "../utils/SystemTimer";
import { defaultTimer } from "../utils/SystemTimer";
import type {
  FailureType,
  FailureSeverity,
  StackTraceElement,
  AggregatedToolCallInfo,
  DeviceBreakdown,
  VersionBreakdown,
  ScreenBreakdown,
  FailureGroup,
  FailureOccurrence,
  FailureCapture,
  TimelineDataPoint,
  PeriodTotals,
} from "../server/failuresResources";

const RETENTION_MAX_ROWS = 10_000;
let cleanupInProgress = false;

// Types for recording failures

export interface RecordFailureInput {
  type: FailureType;
  signature: string;
  title: string;
  message: string;
  severity: FailureSeverity;
  stackTrace?: StackTraceElement[];
  toolCallInfo?: AggregatedToolCallInfo;
  occurrence: {
    deviceId?: string;
    deviceModel: string;
    os: string;
    appVersion: string;
    sessionId: string;
    screenAtFailure?: string;
    screensVisited?: string[];
    testName?: string;
    testExecutionId?: number;
    errorCode?: string;
    durationMs?: number;
    toolArgs?: Record<string, unknown>;
  };
  capture?: {
    type: "screenshot" | "video";
    path: string;
  };
}

// Types for querying failures

interface FailuresQuery {
  type?: FailureType;
  severity?: FailureSeverity;
  startTime?: number;
  endTime?: number;
  limit?: number;
  offset?: number;
}

interface TimelineQuery {
  startTime: number;
  endTime: number;
  aggregation: "minute" | "hour" | "day" | "week";
}

interface FailuresStreamQuery {
  sinceTimestamp?: number;
  sinceId?: number;
  startTime?: number;
  endTime?: number;
  limit?: number;
  type?: FailureType;
  severity?: FailureSeverity;
  acknowledged?: boolean;
}

interface FailureNotificationEntry {
  id: number;
  occurrenceId: string;
  groupId: string;
  type: FailureType;
  severity: FailureSeverity;
  title: string;
  timestamp: number;
  acknowledged: boolean;
}

interface FailuresStreamResponse {
  notifications: FailureNotificationEntry[];
  lastTimestamp?: number;
  lastId?: number;
}

const STREAM_LIMIT_MAX = 500;

export class FailureAnalyticsRepository {
  private timer: Timer;
  private db: Kysely<Database> | null;

  constructor(timer: Timer = defaultTimer, db?: Kysely<Database>) {
    this.timer = timer;
    this.db = db ?? null;
  }

  private getDb(): Kysely<Database> {
    if (this.db) {
      return this.db;
    }
    return getDatabase();
  }

  /**
   * Record a new failure occurrence, creating or updating the group as needed
   */
  async recordFailure(input: RecordFailureInput): Promise<string> {
    const db = this.getDb();
    const now = this.timer.now();
    const occurrenceId = crypto.randomUUID();

    try {
      // Check if group exists
      const existingGroup = await db
        .selectFrom("failure_groups")
        .select(["id", "total_count", "unique_sessions", "first_occurrence", "tool_call_info_json"])
        .where("signature", "=", input.signature)
        .executeTakeFirst();

      let groupId: string;

      if (existingGroup) {
        groupId = existingGroup.id;

        // Count unique sessions including this one
        const sessionExists = await db
          .selectFrom("failure_occurrences")
          .select("id")
          .where("group_id", "=", groupId)
          .where("session_id", "=", input.occurrence.sessionId)
          .executeTakeFirst();

        const newUniqueSessions = sessionExists
          ? existingGroup.unique_sessions
          : existingGroup.unique_sessions + 1;

        // Merge tool call info if this is a tool failure
        let mergedToolCallInfo = input.toolCallInfo;
        if (input.type === "tool_failure" && existingGroup.tool_call_info_json) {
          const existing = JSON.parse(existingGroup.tool_call_info_json) as AggregatedToolCallInfo;
          mergedToolCallInfo = this.mergeToolCallInfo(existing, input.toolCallInfo, input.occurrence);
        }

        const update: FailureGroupUpdate = {
          last_occurrence: now,
          total_count: existingGroup.total_count + 1,
          unique_sessions: newUniqueSessions,
          tool_call_info_json: mergedToolCallInfo ? JSON.stringify(mergedToolCallInfo) : null,
          updated_at: new Date().toISOString(),
        };

        await db
          .updateTable("failure_groups")
          .set(update)
          .where("id", "=", groupId)
          .execute();
      } else {
        groupId = crypto.randomUUID();

        const group: NewFailureGroup = {
          id: groupId,
          type: input.type,
          signature: input.signature,
          title: input.title,
          message: input.message,
          severity: input.severity,
          first_occurrence: now,
          last_occurrence: now,
          total_count: 1,
          unique_sessions: 1,
          stack_trace_json: input.stackTrace ? JSON.stringify(input.stackTrace) : null,
          tool_call_info_json: input.toolCallInfo ? JSON.stringify(input.toolCallInfo) : null,
          updated_at: new Date().toISOString(),
        };

        await db.insertInto("failure_groups").values(group).execute();
      }

      // Insert occurrence
      const occurrence: NewFailureOccurrence = {
        id: occurrenceId,
        group_id: groupId,
        timestamp: now,
        device_id: input.occurrence.deviceId ?? null,
        device_model: input.occurrence.deviceModel,
        os: input.occurrence.os,
        app_version: input.occurrence.appVersion,
        session_id: input.occurrence.sessionId,
        screen_at_failure: input.occurrence.screenAtFailure ?? null,
        test_name: input.occurrence.testName ?? null,
        test_execution_id: input.occurrence.testExecutionId ?? null,
        error_code: input.occurrence.errorCode ?? null,
        duration_ms: input.occurrence.durationMs ?? null,
        tool_args_json: input.occurrence.toolArgs ? JSON.stringify(input.occurrence.toolArgs) : null,
      };

      await db.insertInto("failure_occurrences").values(occurrence).execute();

      // Insert screens visited
      if (input.occurrence.screensVisited && input.occurrence.screensVisited.length > 0) {
        const screens: NewFailureOccurrenceScreen[] = input.occurrence.screensVisited.map(
          (screenName, index) => ({
            occurrence_id: occurrenceId,
            screen_name: screenName,
            visit_order: index,
          })
        );
        await db.insertInto("failure_occurrence_screens").values(screens).execute();
      }

      // Insert capture if provided
      if (input.capture) {
        const capture: NewFailureCapture = {
          id: crypto.randomUUID(),
          occurrence_id: occurrenceId,
          type: input.capture.type,
          path: input.capture.path,
          timestamp: now,
          device_model: input.occurrence.deviceModel,
        };
        await db.insertInto("failure_captures").values(capture).execute();
      }

      // Create notification for streaming
      const notification: NewFailureNotification = {
        occurrence_id: occurrenceId,
        group_id: groupId,
        type: input.type,
        severity: input.severity,
        title: input.title,
        timestamp: now,
        acknowledged: 0,
      };
      await db.insertInto("failure_notifications").values(notification).execute();

      // Run retention cleanup in background
      this.cleanupRetention().catch(() => {});

      return occurrenceId;
    } catch (error) {
      logger.error(`[FailureAnalyticsRepository] Failed to record failure: ${error}`);
      throw error;
    }
  }

  /**
   * Get all failure groups with aggregated data
   */
  async getFailureGroups(query: FailuresQuery = {}): Promise<FailureGroup[]> {
    const db = this.getDb();
    const limit = Math.max(1, query.limit ?? 100);
    const offset = Math.max(0, query.offset ?? 0);

    let builder = db
      .selectFrom("failure_groups")
      .selectAll();

    if (query.type) {
      builder = builder.where("type", "=", query.type);
    }
    if (query.severity) {
      builder = builder.where("severity", "=", query.severity);
    }
    if (query.startTime) {
      builder = builder.where("last_occurrence", ">=", query.startTime);
    }
    if (query.endTime) {
      builder = builder.where("last_occurrence", "<=", query.endTime);
    }

    const groups = await builder
      .orderBy("last_occurrence", "desc")
      .limit(limit)
      .offset(offset)
      .execute();

    const result: FailureGroup[] = [];

    for (const group of groups) {
      const [
        deviceBreakdown,
        versionBreakdown,
        screenBreakdown,
        affectedTests,
        recentCaptures,
        sampleOccurrences,
      ] = await Promise.all([
        this.getDeviceBreakdown(group.id),
        this.getVersionBreakdown(group.id),
        this.getScreenBreakdown(group.id),
        this.getAffectedTests(group.id),
        this.getRecentCaptures(group.id, 5),
        this.getSampleOccurrences(group.id, 6),
      ]);

      result.push({
        id: group.id,
        type: group.type as FailureType,
        signature: group.signature,
        title: group.title,
        message: group.message,
        firstOccurrence: group.first_occurrence,
        lastOccurrence: group.last_occurrence,
        totalCount: group.total_count,
        uniqueSessions: group.unique_sessions,
        severity: group.severity as FailureSeverity,
        deviceBreakdown,
        versionBreakdown,
        screenBreakdown,
        failureScreens: this.computeFailureScreens(screenBreakdown),
        stackTraceElements: group.stack_trace_json
          ? (JSON.parse(group.stack_trace_json) as StackTraceElement[])
          : [],
        toolCallInfo: group.tool_call_info_json
          ? (JSON.parse(group.tool_call_info_json) as AggregatedToolCallInfo)
          : null,
        affectedTests,
        recentCaptures,
        sampleOccurrences,
      });
    }

    return result;
  }

  /**
   * Get timeline data with aggregation
   */
  async getTimelineData(query: TimelineQuery): Promise<{
    dataPoints: TimelineDataPoint[];
    previousPeriodTotals: PeriodTotals;
  }> {
    const db = this.getDb();
    const { startTime, endTime, aggregation } = query;

    // Get bucket duration in ms
    const bucketMs = this.getAggregationMs(aggregation);
    const periodDuration = endTime - startTime;

    // Get occurrences in the time range
    const occurrences = await db
      .selectFrom("failure_occurrences")
      .innerJoin("failure_groups", "failure_occurrences.group_id", "failure_groups.id")
      .select(["failure_occurrences.timestamp", "failure_groups.type"])
      .where("failure_occurrences.timestamp", ">=", startTime)
      .where("failure_occurrences.timestamp", "<=", endTime)
      .execute();

    // Pre-create all buckets for the time range with zero values
    const buckets = new Map<number, { crashes: number; anrs: number; toolFailures: number; nonfatals: number }>();
    const firstBucketStart = Math.floor(startTime / bucketMs) * bucketMs;
    const lastBucketStart = Math.floor(endTime / bucketMs) * bucketMs;

    for (let bucketStart = firstBucketStart; bucketStart <= lastBucketStart; bucketStart += bucketMs) {
      buckets.set(bucketStart, { crashes: 0, anrs: 0, toolFailures: 0, nonfatals: 0 });
    }

    // Fill in data from occurrences
    for (const occ of occurrences) {
      const bucketStart = Math.floor(occ.timestamp / bucketMs) * bucketMs;
      const bucket = buckets.get(bucketStart);
      if (!bucket) {continue;} // Should not happen, but guard against it

      switch (occ.type) {
        case "crash":
          bucket.crashes++;
          break;
        case "anr":
          bucket.anrs++;
          break;
        case "tool_failure":
          bucket.toolFailures++;
          break;
        case "nonfatal":
          bucket.nonfatals++;
          break;
      }
    }

    // Convert to sorted array
    const dataPoints: TimelineDataPoint[] = [];
    const sortedBuckets = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);

    for (const [bucketStart, counts] of sortedBuckets) {
      dataPoints.push({
        label: this.formatBucketLabel(bucketStart, aggregation),
        crashes: counts.crashes,
        anrs: counts.anrs,
        toolFailures: counts.toolFailures,
        nonfatals: counts.nonfatals,
      });
    }

    // Get previous period totals
    const previousStart = startTime - periodDuration;
    const previousEnd = startTime;

    const previousOccurrences = await db
      .selectFrom("failure_occurrences")
      .innerJoin("failure_groups", "failure_occurrences.group_id", "failure_groups.id")
      .select(["failure_groups.type"])
      .where("failure_occurrences.timestamp", ">=", previousStart)
      .where("failure_occurrences.timestamp", "<", previousEnd)
      .execute();

    const previousPeriodTotals: PeriodTotals = {
      crashes: previousOccurrences.filter(o => o.type === "crash").length,
      anrs: previousOccurrences.filter(o => o.type === "anr").length,
      toolFailures: previousOccurrences.filter(o => o.type === "tool_failure").length,
      nonfatals: previousOccurrences.filter(o => o.type === "nonfatal").length,
    };

    return { dataPoints, previousPeriodTotals };
  }

  /**
   * Get new failure notifications since a cursor (for streaming)
   */
  async getNotificationsSince(query: FailuresStreamQuery): Promise<FailuresStreamResponse> {
    const db = this.getDb();
    const limit = Math.min(Math.max(1, query.limit ?? 50), STREAM_LIMIT_MAX);

    let builder = db
      .selectFrom("failure_notifications")
      .selectAll();

    if (query.type) {
      builder = builder.where("type", "=", query.type);
    }
    if (query.acknowledged !== undefined) {
      builder = builder.where("acknowledged", "=", query.acknowledged ? 1 : 0);
    }
    if (query.startTime) {
      builder = builder.where("timestamp", ">=", query.startTime);
    }
    if (query.endTime) {
      builder = builder.where("timestamp", "<=", query.endTime);
    }
    if (query.sinceTimestamp !== undefined) {
      const sinceId = query.sinceId ?? 0;
      builder = builder.where(eb =>
        eb.or([
          eb("timestamp", ">", query.sinceTimestamp!),
          eb.and([
            eb("timestamp", "=", query.sinceTimestamp!),
            eb("id", ">", sinceId),
          ]),
        ])
      );
    }

    const rows = await builder
      .orderBy("timestamp", "asc")
      .orderBy("id", "asc")
      .limit(limit)
      .execute();

    const notifications: FailureNotificationEntry[] = rows.map(row => ({
      id: row.id,
      occurrenceId: row.occurrence_id,
      groupId: row.group_id,
      type: row.type as FailureType,
      severity: row.severity as FailureSeverity,
      title: row.title,
      timestamp: row.timestamp,
      acknowledged: row.acknowledged === 1,
    }));

    const last = notifications.length > 0 ? notifications[notifications.length - 1] : undefined;

    return {
      notifications,
      lastTimestamp: last?.timestamp ?? query.sinceTimestamp,
      lastId: last?.id ?? query.sinceId,
    };
  }

  /**
   * Acknowledge notifications (mark as read)
   */
  async acknowledgeNotifications(ids: number[]): Promise<void> {
    if (ids.length === 0) {return;}

    const db = this.getDb();
    await db
      .updateTable("failure_notifications")
      .set({ acknowledged: 1 })
      .where("id", "in", ids)
      .execute();
  }

  /**
   * Get aggregated data for groups (used for streaming updates)
   */
  async getAggregatedGroups(query: FailuresStreamQuery): Promise<{
    groups: FailureGroup[];
    totals: { crashes: number; anrs: number; toolFailures: number; nonfatals: number };
  }> {
    const groups = await this.getFailureGroups({
      startTime: query.startTime,
      endTime: query.endTime,
      type: query.type,
      severity: query.severity,
    });

    const totals = {
      crashes: groups.filter(g => g.type === "crash").reduce((sum, g) => sum + g.totalCount, 0),
      anrs: groups.filter(g => g.type === "anr").reduce((sum, g) => sum + g.totalCount, 0),
      toolFailures: groups.filter(g => g.type === "tool_failure").reduce((sum, g) => sum + g.totalCount, 0),
      nonfatals: groups.filter(g => g.type === "nonfatal").reduce((sum, g) => sum + g.totalCount, 0),
    };

    return { groups, totals };
  }

  // Private helper methods

  private async getDeviceBreakdown(groupId: string): Promise<DeviceBreakdown[]> {
    const db = this.getDb();

    const rows = await db
      .selectFrom("failure_occurrences")
      .select(["device_model", "os"])
      .select(eb => eb.fn.count<number>("id").as("count"))
      .where("group_id", "=", groupId)
      .groupBy(["device_model", "os"])
      .orderBy("count", "desc")
      .limit(10)
      .execute();

    const total = rows.reduce((sum, r) => sum + Number(r.count), 0);

    return rows.map(row => ({
      deviceModel: row.device_model,
      os: row.os,
      count: Number(row.count),
      percentage: total > 0 ? (Number(row.count) / total) * 100 : 0,
    }));
  }

  private async getVersionBreakdown(groupId: string): Promise<VersionBreakdown[]> {
    const db = this.getDb();

    const rows = await db
      .selectFrom("failure_occurrences")
      .select("app_version")
      .select(eb => eb.fn.count<number>("id").as("count"))
      .where("group_id", "=", groupId)
      .groupBy("app_version")
      .orderBy("count", "desc")
      .limit(10)
      .execute();

    const total = rows.reduce((sum, r) => sum + Number(r.count), 0);

    return rows.map(row => ({
      version: row.app_version,
      count: Number(row.count),
      percentage: total > 0 ? (Number(row.count) / total) * 100 : 0,
    }));
  }

  private async getScreenBreakdown(groupId: string): Promise<ScreenBreakdown[]> {
    const db = this.getDb();

    // Get failure counts per screen
    const failureScreens = await db
      .selectFrom("failure_occurrences")
      .select("screen_at_failure")
      .select(eb => eb.fn.count<number>("id").as("failure_count"))
      .where("group_id", "=", groupId)
      .where("screen_at_failure", "is not", null)
      .groupBy("screen_at_failure")
      .execute();

    // Get visit counts from screens visited
    const visitedScreens = await db
      .selectFrom("failure_occurrence_screens")
      .innerJoin(
        "failure_occurrences",
        "failure_occurrence_screens.occurrence_id",
        "failure_occurrences.id"
      )
      .select("screen_name")
      .select(eb => eb.fn.count<number>("failure_occurrence_screens.id").as("visit_count"))
      .where("failure_occurrences.group_id", "=", groupId)
      .groupBy("screen_name")
      .execute();

    const visitMap = new Map(visitedScreens.map(s => [s.screen_name, Number(s.visit_count)]));
    const totalVisits = Array.from(visitMap.values()).reduce((sum, c) => sum + c, 0);

    const result: ScreenBreakdown[] = [];
    const processedScreens = new Set<string>();

    // Add screens where failures occurred
    for (const row of failureScreens) {
      const screenName = row.screen_at_failure!;
      const visitCount = visitMap.get(screenName) ?? 0;
      result.push({
        screenName,
        visitCount,
        failureCount: Number(row.failure_count),
        visitPercentage: totalVisits > 0 ? (visitCount / totalVisits) * 100 : 0,
      });
      processedScreens.add(screenName);
    }

    // Add visited screens without failures (limit to top 5)
    let addedVisitOnly = 0;
    for (const screen of visitedScreens) {
      if (!processedScreens.has(screen.screen_name) && addedVisitOnly < 5) {
        result.push({
          screenName: screen.screen_name,
          visitCount: Number(screen.visit_count),
          failureCount: 0,
          visitPercentage: totalVisits > 0 ? (Number(screen.visit_count) / totalVisits) * 100 : 0,
        });
        addedVisitOnly++;
      }
    }

    return result.sort((a, b) => b.visitCount - a.visitCount);
  }

  private async getAffectedTests(groupId: string): Promise<Record<string, number>> {
    const db = this.getDb();

    const rows = await db
      .selectFrom("failure_occurrences")
      .select("test_name")
      .select(eb => eb.fn.count<number>("id").as("count"))
      .where("group_id", "=", groupId)
      .where("test_name", "is not", null)
      .groupBy("test_name")
      .execute();

    const result: Record<string, number> = {};
    for (const row of rows) {
      if (row.test_name) {
        result[row.test_name] = Number(row.count);
      }
    }
    return result;
  }

  private async getRecentCaptures(groupId: string, limit: number): Promise<FailureCapture[]> {
    const db = this.getDb();

    const rows = await db
      .selectFrom("failure_captures")
      .innerJoin("failure_occurrences", "failure_captures.occurrence_id", "failure_occurrences.id")
      .select([
        "failure_captures.id",
        "failure_captures.type",
        "failure_captures.path",
        "failure_captures.timestamp",
        "failure_captures.device_model",
      ])
      .where("failure_occurrences.group_id", "=", groupId)
      .orderBy("failure_captures.timestamp", "desc")
      .limit(limit)
      .execute();

    return rows.map(row => ({
      id: row.id,
      type: row.type as "screenshot" | "video",
      path: row.path,
      timestamp: row.timestamp,
      deviceModel: row.device_model,
    }));
  }

  private async getSampleOccurrences(groupId: string, limit: number): Promise<FailureOccurrence[]> {
    const db = this.getDb();

    const rows = await db
      .selectFrom("failure_occurrences")
      .selectAll()
      .where("group_id", "=", groupId)
      .orderBy("timestamp", "desc")
      .limit(limit)
      .execute();

    const result: FailureOccurrence[] = [];

    for (const row of rows) {
      // Get screens visited
      const screens = await db
        .selectFrom("failure_occurrence_screens")
        .select("screen_name")
        .where("occurrence_id", "=", row.id)
        .orderBy("visit_order", "asc")
        .execute();

      // Get capture if any
      const capture = await db
        .selectFrom("failure_captures")
        .select(["path", "type"])
        .where("occurrence_id", "=", row.id)
        .executeTakeFirst();

      result.push({
        id: row.id,
        timestamp: row.timestamp,
        deviceModel: row.device_model,
        os: row.os,
        appVersion: row.app_version,
        sessionId: row.session_id,
        screenAtFailure: row.screen_at_failure,
        screensVisited: screens.map(s => s.screen_name),
        testName: row.test_name,
        capturePath: capture?.path ?? null,
        captureType: capture ? (capture.type as "screenshot" | "video") : null,
      });
    }

    return result;
  }

  private computeFailureScreens(screenBreakdown: ScreenBreakdown[]): Record<string, number> {
    const result: Record<string, number> = {};
    for (const screen of screenBreakdown) {
      if (screen.failureCount > 0) {
        result[screen.screenName] = screen.failureCount;
      }
    }
    return result;
  }

  private mergeToolCallInfo(
    existing: AggregatedToolCallInfo,
    newInfo: AggregatedToolCallInfo | undefined,
    occurrence: RecordFailureInput["occurrence"]
  ): AggregatedToolCallInfo {
    if (!newInfo) {
      // Just update error codes from occurrence
      const errorCodes = { ...existing.errorCodes };
      if (occurrence.errorCode) {
        errorCodes[occurrence.errorCode] = (errorCodes[occurrence.errorCode] ?? 0) + 1;
      }
      return { ...existing, errorCodes };
    }

    // Merge error codes
    const errorCodes = { ...existing.errorCodes };
    for (const [code, count] of Object.entries(newInfo.errorCodes)) {
      errorCodes[code] = (errorCodes[code] ?? 0) + count;
    }

    // Merge parameter variants (keep unique values)
    const parameterVariants: Record<string, string[]> = { ...existing.parameterVariants };
    for (const [param, values] of Object.entries(newInfo.parameterVariants)) {
      const existingValues = new Set(parameterVariants[param] ?? []);
      for (const val of values) {
        existingValues.add(val);
      }
      parameterVariants[param] = Array.from(existingValues).slice(0, 10); // Limit variants
    }

    // Merge duration stats (simple average approach)
    let durationStats = existing.durationStats;
    if (newInfo.durationStats && existing.durationStats) {
      durationStats = {
        minMs: Math.min(existing.durationStats.minMs, newInfo.durationStats.minMs),
        maxMs: Math.max(existing.durationStats.maxMs, newInfo.durationStats.maxMs),
        avgMs: Math.round((existing.durationStats.avgMs + newInfo.durationStats.avgMs) / 2),
        medianMs: Math.round((existing.durationStats.medianMs + newInfo.durationStats.medianMs) / 2),
        p95Ms: Math.max(existing.durationStats.p95Ms, newInfo.durationStats.p95Ms),
      };
    } else if (newInfo.durationStats) {
      durationStats = newInfo.durationStats;
    }

    return {
      toolName: existing.toolName,
      errorCodes,
      parameterVariants,
      durationStats,
    };
  }

  private getAggregationMs(aggregation: "minute" | "hour" | "day" | "week"): number {
    switch (aggregation) {
      case "minute":
        return 60 * 1000;
      case "hour":
        return 60 * 60 * 1000;
      case "day":
        return 24 * 60 * 60 * 1000;
      case "week":
        return 7 * 24 * 60 * 60 * 1000;
    }
  }

  private formatBucketLabel(timestamp: number, aggregation: "minute" | "hour" | "day" | "week"): string {
    const date = new Date(timestamp);

    switch (aggregation) {
      case "minute": {
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const ampm = hours >= 12 ? "PM" : "AM";
        const displayHours = hours % 12 || 12;
        return `${displayHours}:${minutes.toString().padStart(2, "0")} ${ampm}`;
      }
      case "hour": {
        const hours = date.getHours();
        const ampm = hours >= 12 ? "PM" : "AM";
        const displayHours = hours % 12 || 12;
        return `${displayHours} ${ampm}`;
      }
      case "day": {
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${months[date.getMonth()]} ${date.getDate()}`;
      }
      case "week": {
        // Get Monday of the week
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(date.setDate(diff));
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${months[monday.getMonth()]} ${monday.getDate()}`;
      }
    }
  }

  private async cleanupRetention(): Promise<void> {
    if (cleanupInProgress) {
      return;
    }

    cleanupInProgress = true;
    try {
      const db = this.getDb();

      // Find threshold occurrence
      const threshold = await db
        .selectFrom("failure_occurrences")
        .select(["id", "timestamp"])
        .orderBy("timestamp", "desc")
        .limit(1)
        .offset(RETENTION_MAX_ROWS - 1)
        .executeTakeFirst();

      if (!threshold) {
        return;
      }

      // Delete old occurrences (cascades to screens, captures, notifications)
      await db
        .deleteFrom("failure_occurrences")
        .where(eb =>
          eb.or([
            eb("timestamp", "<", threshold.timestamp),
            eb.and([
              eb("timestamp", "=", threshold.timestamp),
              eb("id", "<", threshold.id),
            ]),
          ])
        )
        .execute();

      // Clean up groups with no occurrences
      await db
        .deleteFrom("failure_groups")
        .where(
          "id",
          "not in",
          db.selectFrom("failure_occurrences").select("group_id").distinct()
        )
        .execute();
    } catch (error) {
      logger.warn(`[FailureAnalyticsRepository] Retention cleanup failed: ${error}`);
    } finally {
      cleanupInProgress = false;
    }
  }
}
