import type { Kysely } from "kysely";
import { getDatabase } from "./database";
import type { Database, NewPerformanceAuditResult } from "./types";
import { logger } from "../utils/logger";
import type { Timer } from "../utils/SystemTimer";
import { defaultTimer } from "../utils/SystemTimer";

const RETENTION_MAX_ROWS = 10_000;
const RETENTION_MAX_AGE_HOURS = 24;
const PRUNING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let cleanupInProgress = false;
let pruningTimer: NodeJS.Timeout | null = null;

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
  // Live metrics extension
  timeToFirstFrameMs?: number | null;
  timeToInteractiveMs?: number | null;
  frameRateFps?: number | null;
}

export interface PerformanceAuditRecord {
  deviceId: string;
  sessionId: string;
  packageName: string;
  timestamp: string;
  passed: boolean;
  metrics: PerformanceAuditMetricsRecord;
  diagnostics: string | null;
  nodeId?: number | null;
}

interface PerformanceAuditQuery {
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
  nodeId: number | null;
}

interface PerformanceAuditHistoryPage {
  results: PerformanceAuditHistoryEntry[];
  hasMore: boolean;
  nextOffset: number | null;
}

interface PerformanceAuditStreamQuery {
  startTime?: string;
  endTime?: string;
  limit?: number;
  deviceId?: string;
  sessionId?: string;
  packageName?: string;
  sinceTimestamp?: string;
  sinceId?: number;
}

const STREAM_LIMIT_MAX = 500;

export class PerformanceAuditRepository {
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

  async recordAudit(record: PerformanceAuditRecord): Promise<void> {
    try {
      const db = this.getDb();
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
        // Live metrics extension
        time_to_first_frame_ms: record.metrics.timeToFirstFrameMs ?? null,
        time_to_interactive_ms: record.metrics.timeToInteractiveMs ?? null,
        frame_rate_fps: record.metrics.frameRateFps ?? null,
        node_id: record.nodeId ?? null,
      };

      await db.insertInto("performance_audit_results").values(entry).execute();
      await this.cleanupRetention();
    } catch (error) {
      logger.error(`[PerformanceAuditRepository] Failed to store audit result: ${error}`);
    }
  }

  async listResults(query: PerformanceAuditQuery): Promise<PerformanceAuditHistoryPage> {
    const db = this.getDb();
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
        "time_to_first_frame_ms",
        "time_to_interactive_ms",
        "frame_rate_fps",
        "node_id",
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
        timeToFirstFrameMs: row.time_to_first_frame_ms,
        timeToInteractiveMs: row.time_to_interactive_ms,
        frameRateFps: row.frame_rate_fps,
      },
      diagnostics: row.diagnostics_json,
      nodeId: row.node_id,
    }));

    return {
      results,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
    };
  }

  async listResultsSince(query: PerformanceAuditStreamQuery): Promise<PerformanceAuditHistoryEntry[]> {
    const db = this.getDb();
    const limit = Math.min(Math.max(1, query.limit ?? 50), STREAM_LIMIT_MAX);

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
        "time_to_first_frame_ms",
        "time_to_interactive_ms",
        "frame_rate_fps",
        "node_id",
      ]);

    if (query.deviceId) {
      builder = builder.where("device_id", "=", query.deviceId);
    }
    if (query.sessionId) {
      builder = builder.where("session_id", "=", query.sessionId);
    }
    if (query.packageName) {
      builder = builder.where("package_name", "=", query.packageName);
    }
    if (query.startTime) {
      builder = builder.where("timestamp", ">=", query.startTime);
    }
    if (query.endTime) {
      builder = builder.where("timestamp", "<=", query.endTime);
    }
    if (query.sinceTimestamp) {
      const sinceId = query.sinceId ?? 0;
      builder = builder.where(eb => eb.or([
        eb("timestamp", ">", query.sinceTimestamp),
        eb.and([
          eb("timestamp", "=", query.sinceTimestamp),
          eb("id", ">", sinceId),
        ]),
      ]));
    }

    const rows = await builder
      .orderBy("timestamp", "asc")
      .orderBy("id", "asc")
      .limit(limit)
      .execute();

    return rows.map(row => ({
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
        timeToFirstFrameMs: row.time_to_first_frame_ms,
        timeToInteractiveMs: row.time_to_interactive_ms,
        frameRateFps: row.frame_rate_fps,
      },
      diagnostics: row.diagnostics_json,
      nodeId: row.node_id,
    }));
  }

  private async cleanupRetention(): Promise<void> {
    if (cleanupInProgress) {
      return;
    }

    cleanupInProgress = true;
    try {
      const db = this.getDb();

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

  /**
   * Prune records older than the configured retention period (24 hours by default).
   * Called periodically and lazily during listResultsSince.
   */
  async pruneOldRecords(): Promise<number> {
    try {
      const db = this.getDb();
      const cutoffDate = new Date(this.timer.now() - RETENTION_MAX_AGE_HOURS * 60 * 60 * 1000);
      const cutoffTimestamp = cutoffDate.toISOString();

      const result = await db
        .deleteFrom("performance_audit_results")
        .where("timestamp", "<", cutoffTimestamp)
        .executeTakeFirst();

      const deletedCount = Number(result.numDeletedRows ?? 0);
      if (deletedCount > 0) {
        logger.info(`[PerformanceAuditRepository] Pruned ${deletedCount} old records`);
      }
      return deletedCount;
    } catch (error) {
      logger.warn(`[PerformanceAuditRepository] Pruning failed: ${error}`);
      return 0;
    }
  }

  /**
   * Start periodic pruning timer.
   */
  startPeriodicPruning(): void {
    if (pruningTimer) {
      return;
    }

    pruningTimer = defaultTimer.setInterval(() => {
      this.pruneOldRecords().catch(error => {
        logger.warn(`[PerformanceAuditRepository] Periodic pruning error: ${error}`);
      });
    }, PRUNING_INTERVAL_MS);

    // Don't prevent process exit
    pruningTimer.unref();

    logger.info(`[PerformanceAuditRepository] Started periodic pruning (every ${PRUNING_INTERVAL_MS / 1000}s)`);
  }

  /**
   * Stop periodic pruning timer.
   */
  stopPeriodicPruning(): void {
    if (pruningTimer) {
      defaultTimer.clearInterval(pruningTimer);
      pruningTimer = null;
      logger.info("[PerformanceAuditRepository] Stopped periodic pruning");
    }
  }
}
