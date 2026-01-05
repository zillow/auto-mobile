import { getDatabase } from "./database";
import type { NewPerformanceAuditResult } from "./types";
import { logger } from "../utils/logger";

const RETENTION_MAX_ROWS = 10_000;
let cleanupInProgress = false;

export interface PerformanceAuditMetricsRecord {
  p50Ms: number | null;
  p90Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  jankCount: number | null;
  missedVsyncCount: number | null;
  slowUiThreadCount: number | null;
  frameDeadlineMissedCount: number | null;
  cpuUsagePercent: number | null;
  touchLatencyMs: number | null;
}

export interface PerformanceAuditRecord {
  deviceId: string;
  sessionId: string;
  packageName: string;
  timestamp: string;
  passed: boolean;
  metrics: PerformanceAuditMetricsRecord;
  diagnostics: string | null;
}

export interface PerformanceAuditQuery {
  startTime?: string;
  endTime?: string;
  limit?: number;
  offset?: number;
  deviceId?: string;
}

export interface PerformanceAuditHistoryEntry {
  id: number;
  deviceId: string;
  sessionId: string;
  packageName: string;
  timestamp: string;
  passed: boolean;
  metrics: PerformanceAuditMetricsRecord;
  diagnostics: string | null;
}

export interface PerformanceAuditHistoryPage {
  results: PerformanceAuditHistoryEntry[];
  hasMore: boolean;
  nextOffset: number | null;
}

export class PerformanceAuditRepository {
  async recordAudit(record: PerformanceAuditRecord): Promise<void> {
    try {
      const db = getDatabase();
      const entry: NewPerformanceAuditResult = {
        device_id: record.deviceId,
        session_id: record.sessionId,
        package_name: record.packageName,
        timestamp: record.timestamp,
        passed: record.passed ? 1 : 0,
        p50_ms: record.metrics.p50Ms,
        p90_ms: record.metrics.p90Ms,
        p95_ms: record.metrics.p95Ms,
        p99_ms: record.metrics.p99Ms,
        jank_count: record.metrics.jankCount,
        missed_vsync_count: record.metrics.missedVsyncCount,
        slow_ui_thread_count: record.metrics.slowUiThreadCount,
        frame_deadline_missed_count: record.metrics.frameDeadlineMissedCount,
        cpu_usage_percent: record.metrics.cpuUsagePercent,
        touch_latency_ms: record.metrics.touchLatencyMs,
        diagnostics_json: record.diagnostics,
      };

      await db.insertInto("performance_audit_results").values(entry).execute();
      await this.cleanupRetention();
    } catch (error) {
      logger.error(`[PerformanceAuditRepository] Failed to store audit result: ${error}`);
    }
  }

  async listResults(query: PerformanceAuditQuery): Promise<PerformanceAuditHistoryPage> {
    const db = getDatabase();
    const limit = Math.max(1, query.limit ?? 50);
    const offset = Math.max(0, query.offset ?? 0);

    let builder = db
      .selectFrom("performance_audit_results")
      .select([
        "id",
        "device_id",
        "session_id",
        "package_name",
        "timestamp",
        "passed",
        "p50_ms",
        "p90_ms",
        "p95_ms",
        "p99_ms",
        "jank_count",
        "missed_vsync_count",
        "slow_ui_thread_count",
        "frame_deadline_missed_count",
        "cpu_usage_percent",
        "touch_latency_ms",
        "diagnostics_json",
      ]);

    if (query.deviceId) {
      builder = builder.where("device_id", "=", query.deviceId);
    }
    if (query.startTime) {
      builder = builder.where("timestamp", ">=", query.startTime);
    }
    if (query.endTime) {
      builder = builder.where("timestamp", "<=", query.endTime);
    }

    const rows = await builder
      .orderBy("timestamp", "desc")
      .orderBy("id", "desc")
      .limit(limit + 1)
      .offset(offset)
      .execute();

    const hasMore = rows.length > limit;
    const trimmed = hasMore ? rows.slice(0, limit) : rows;

    const results: PerformanceAuditHistoryEntry[] = trimmed.map(row => ({
      id: row.id,
      deviceId: row.device_id,
      sessionId: row.session_id,
      packageName: row.package_name,
      timestamp: row.timestamp,
      passed: row.passed === 1,
      metrics: {
        p50Ms: row.p50_ms,
        p90Ms: row.p90_ms,
        p95Ms: row.p95_ms,
        p99Ms: row.p99_ms,
        jankCount: row.jank_count,
        missedVsyncCount: row.missed_vsync_count,
        slowUiThreadCount: row.slow_ui_thread_count,
        frameDeadlineMissedCount: row.frame_deadline_missed_count,
        cpuUsagePercent: row.cpu_usage_percent,
        touchLatencyMs: row.touch_latency_ms,
      },
      diagnostics: row.diagnostics_json,
    }));

    return {
      results,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
    };
  }

  private async cleanupRetention(): Promise<void> {
    if (cleanupInProgress) {
      return;
    }

    cleanupInProgress = true;
    try {
      const db = getDatabase();

      const threshold = await db
        .selectFrom("performance_audit_results")
        .select(["id", "timestamp"])
        .orderBy("timestamp", "desc")
        .orderBy("id", "desc")
        .limit(1)
        .offset(RETENTION_MAX_ROWS - 1)
        .executeTakeFirst();

      if (!threshold) {
        return;
      }

      await db
        .deleteFrom("performance_audit_results")
        .where(eb => eb.or([
          eb("timestamp", "<", threshold.timestamp),
          eb.and([
            eb("timestamp", "=", threshold.timestamp),
            eb("id", "<", threshold.id),
          ]),
        ]))
        .execute();
    } catch (error) {
      logger.warn(`[PerformanceAuditRepository] Retention cleanup failed: ${error}`);
    } finally {
      cleanupInProgress = false;
    }
  }
}
