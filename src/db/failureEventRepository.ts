import type { Kysely } from "kysely";
import { getDatabase } from "./database";
import type {
  Database,
  Crash,
  NewCrash,
  Anr,
  NewAnr,
  ToolCall,
  NewToolCall,
} from "./types";
import type { CrashEvent, AnrEvent } from "../utils/interfaces/CrashMonitor";
import { logger } from "../utils/logger";
import type { Timer } from "../utils/SystemTimer";
import { defaultTimer } from "../utils/SystemTimer";

/**
 * Query options for fetching failures
 */
interface FailureQueryOptions {
  /** Limit results to this many records */
  limit?: number;
  /** Filter by device ID */
  deviceId?: string;
  /** Filter by package name */
  packageName?: string;
  /** Filter by session UUID */
  sessionUuid?: string;
  /** Filter by navigation node ID */
  navigationNodeId?: number;
  /** Filter by test execution ID */
  testExecutionId?: number;
  /** Only include failures after this timestamp */
  since?: number;
  /** Include tool call failures */
  includeToolCallFailures?: boolean;
}

/**
 * Unified failure record type
 */
interface FailureRecord {
  type: "crash" | "anr" | "tool_call_failure";
  id: number;
  timestamp: number;
  deviceId: string | null;
  packageName: string | null;
  message: string | null;
  stacktrace: string | null;
  detectionSource: string | null;
  navigationNodeId: number | null;
  testExecutionId: number | null;
  sessionUuid: string | null;
  // Crash-specific
  crashType?: string;
  exceptionClass?: string;
  signal?: string;
  // ANR-specific
  reason?: string;
  activity?: string;
  waitDurationMs?: number;
  // Tool call-specific
  toolName?: string;
  toolArgs?: string;
  errorType?: string;
}

/**
 * Repository for failure data (crashes, ANRs, tool call failures)
 */
export class FailureEventRepository {
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
   * Save a crash event to the database
   */
  async saveCrash(event: CrashEvent): Promise<number> {
    const db = this.getDb();

    const newCrash: NewCrash = {
      device_id: event.deviceId,
      package_name: event.packageName,
      crash_type: event.crashType,
      timestamp: event.timestamp,
      process_name: event.processName ?? null,
      pid: event.pid ?? null,
      exception_class: event.exceptionClass ?? null,
      exception_message: event.exceptionMessage ?? null,
      stacktrace: event.stacktrace ?? null,
      signal: event.signal ?? null,
      fault_address: event.faultAddress ?? null,
      tombstone_path: event.tombstonePath ?? null,
      detection_source: event.detectionSource,
      raw_log: event.rawLog ?? null,
      navigation_node_id: event.navigationNodeId ?? null,
      test_execution_id: event.testExecutionId ?? null,
      session_uuid: event.sessionUuid ?? null,
    };

    const result = await db
      .insertInto("crashes")
      .values(newCrash)
      .returning("id")
      .executeTakeFirstOrThrow();

    logger.info(
      `[FAILURE_REPO] Saved crash for ${event.packageName}: ${event.exceptionClass ?? event.signal ?? "unknown"}`
    );

    return result.id;
  }

  /**
   * Save an ANR event to the database
   */
  async saveAnr(event: AnrEvent): Promise<number> {
    const db = this.getDb();

    const newAnr: NewAnr = {
      device_id: event.deviceId,
      package_name: event.packageName,
      timestamp: event.timestamp,
      process_name: event.processName ?? null,
      pid: event.pid ?? null,
      reason: event.reason ?? null,
      activity: event.activity ?? null,
      wait_duration_ms: event.waitDurationMs ?? null,
      cpu_usage: event.cpuUsage ?? null,
      main_thread_state: event.mainThreadState ?? null,
      stacktrace: event.stacktrace ?? null,
      detection_source: event.detectionSource,
      raw_log: event.rawLog ?? null,
      navigation_node_id: event.navigationNodeId ?? null,
      test_execution_id: event.testExecutionId ?? null,
      session_uuid: event.sessionUuid ?? null,
    };

    const result = await db
      .insertInto("anrs")
      .values(newAnr)
      .returning("id")
      .executeTakeFirstOrThrow();

    logger.info(
      `[FAILURE_REPO] Saved ANR for ${event.packageName}: ${event.reason ?? "unknown reason"}`
    );

    return result.id;
  }

  /**
   * Save a tool call with optional failure information
   */
  async saveToolCall(
    toolName: string,
    options: {
      status?: "success" | "failure";
      errorMessage?: string;
      errorType?: string;
      deviceId?: string;
      packageName?: string;
      durationMs?: number;
      toolArgs?: string;
      sessionUuid?: string;
    } = {}
  ): Promise<number> {
    const db = this.getDb();

    const newToolCall: NewToolCall = {
      tool_name: toolName,
      timestamp: new Date().toISOString(),
      session_uuid: options.sessionUuid ?? null,
      status: options.status ?? "success",
      error_message: options.errorMessage ?? null,
      error_type: options.errorType ?? null,
      device_id: options.deviceId ?? null,
      package_name: options.packageName ?? null,
      duration_ms: options.durationMs ?? null,
      tool_args: options.toolArgs ?? null,
    };

    const result = await db
      .insertInto("tool_calls")
      .values(newToolCall)
      .returning("id")
      .executeTakeFirstOrThrow();

    if (options.status === "failure") {
      logger.info(
        `[FAILURE_REPO] Saved tool call failure for ${toolName}: ${options.errorMessage ?? "unknown error"}`
      );
    }

    return result.id;
  }

  /**
   * Get crashes matching the query options
   */
  async getCrashes(options: FailureQueryOptions = {}): Promise<Crash[]> {
    const db = this.getDb();

    let query = db.selectFrom("crashes").selectAll().orderBy("timestamp", "desc");

    if (options.deviceId) {
      query = query.where("device_id", "=", options.deviceId);
    }

    if (options.packageName) {
      query = query.where("package_name", "=", options.packageName);
    }

    if (options.sessionUuid) {
      query = query.where("session_uuid", "=", options.sessionUuid);
    }

    if (options.navigationNodeId) {
      query = query.where("navigation_node_id", "=", options.navigationNodeId);
    }

    if (options.testExecutionId) {
      query = query.where("test_execution_id", "=", options.testExecutionId);
    }

    if (options.since) {
      query = query.where("timestamp", ">=", options.since);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    return query.execute();
  }

  /**
   * Get ANRs matching the query options
   */
  async getAnrs(options: FailureQueryOptions = {}): Promise<Anr[]> {
    const db = this.getDb();

    let query = db.selectFrom("anrs").selectAll().orderBy("timestamp", "desc");

    if (options.deviceId) {
      query = query.where("device_id", "=", options.deviceId);
    }

    if (options.packageName) {
      query = query.where("package_name", "=", options.packageName);
    }

    if (options.sessionUuid) {
      query = query.where("session_uuid", "=", options.sessionUuid);
    }

    if (options.navigationNodeId) {
      query = query.where("navigation_node_id", "=", options.navigationNodeId);
    }

    if (options.testExecutionId) {
      query = query.where("test_execution_id", "=", options.testExecutionId);
    }

    if (options.since) {
      query = query.where("timestamp", ">=", options.since);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    return query.execute();
  }

  /**
   * Get failed tool calls matching the query options
   */
  async getToolCallFailures(options: FailureQueryOptions = {}): Promise<ToolCall[]> {
    const db = this.getDb();

    let query = db
      .selectFrom("tool_calls")
      .selectAll()
      .where("status", "=", "failure")
      .orderBy("timestamp", "desc");

    if (options.deviceId) {
      query = query.where("device_id", "=", options.deviceId);
    }

    if (options.packageName) {
      query = query.where("package_name", "=", options.packageName);
    }

    if (options.sessionUuid) {
      query = query.where("session_uuid", "=", options.sessionUuid);
    }

    if (options.since) {
      query = query.where("timestamp", ">=", new Date(options.since).toISOString());
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    return query.execute();
  }

  /**
   * Get all failures (crashes, ANRs, tool call failures) unified into a single list
   */
  async getAllFailures(options: FailureQueryOptions = {}): Promise<FailureRecord[]> {
    const failures: FailureRecord[] = [];

    // Get crashes
    const crashes = await this.getCrashes(options);
    for (const crash of crashes) {
      failures.push({
        type: "crash",
        id: crash.id,
        timestamp: crash.timestamp,
        deviceId: crash.device_id,
        packageName: crash.package_name,
        message: crash.exception_message,
        stacktrace: crash.stacktrace,
        detectionSource: crash.detection_source,
        navigationNodeId: crash.navigation_node_id,
        testExecutionId: crash.test_execution_id,
        sessionUuid: crash.session_uuid,
        crashType: crash.crash_type,
        exceptionClass: crash.exception_class ?? undefined,
        signal: crash.signal ?? undefined,
      });
    }

    // Get ANRs
    const anrs = await this.getAnrs(options);
    for (const anr of anrs) {
      failures.push({
        type: "anr",
        id: anr.id,
        timestamp: anr.timestamp,
        deviceId: anr.device_id,
        packageName: anr.package_name,
        message: anr.reason,
        stacktrace: anr.stacktrace,
        detectionSource: anr.detection_source,
        navigationNodeId: anr.navigation_node_id,
        testExecutionId: anr.test_execution_id,
        sessionUuid: anr.session_uuid,
        reason: anr.reason ?? undefined,
        activity: anr.activity ?? undefined,
        waitDurationMs: anr.wait_duration_ms ?? undefined,
      });
    }

    // Get tool call failures (if requested)
    if (options.includeToolCallFailures !== false) {
      const toolCallFailures = await this.getToolCallFailures(options);
      for (const tcf of toolCallFailures) {
        failures.push({
          type: "tool_call_failure",
          id: tcf.id,
          timestamp: Date.parse(tcf.timestamp),
          deviceId: tcf.device_id,
          packageName: tcf.package_name,
          message: tcf.error_message,
          stacktrace: null,
          detectionSource: "tool_call",
          navigationNodeId: null,
          testExecutionId: null,
          sessionUuid: tcf.session_uuid,
          toolName: tcf.tool_name,
          toolArgs: tcf.tool_args ?? undefined,
          errorType: tcf.error_type ?? undefined,
        });
      }
    }

    // Sort by timestamp descending
    failures.sort((a, b) => b.timestamp - a.timestamp);

    // Apply limit
    if (options.limit) {
      return failures.slice(0, options.limit);
    }

    return failures;
  }

  /**
   * Get crash by ID
   */
  async getCrashById(id: number): Promise<Crash | null> {
    const db = this.getDb();
    const result = await db
      .selectFrom("crashes")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return result ?? null;
  }

  /**
   * Get ANR by ID
   */
  async getAnrById(id: number): Promise<Anr | null> {
    const db = this.getDb();
    const result = await db
      .selectFrom("anrs")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return result ?? null;
  }

  /**
   * Delete old failures (cleanup)
   */
  async deleteOldFailures(olderThanDays: number): Promise<void> {
    const db = this.getDb();
    const cutoffTimestamp = this.timer.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const cutoffDate = new Date(cutoffTimestamp).toISOString();

    await db
      .deleteFrom("crashes")
      .where("timestamp", "<", cutoffTimestamp)
      .execute();

    await db
      .deleteFrom("anrs")
      .where("timestamp", "<", cutoffTimestamp)
      .execute();

    await db
      .deleteFrom("tool_calls")
      .where("status", "=", "failure")
      .where("timestamp", "<", cutoffDate)
      .execute();

    logger.info(
      `[FAILURE_REPO] Deleted failures older than ${olderThanDays} days`
    );
  }

  /**
   * Get failure counts by type for a given query
   */
  async getFailureCounts(
    options: FailureQueryOptions = {}
  ): Promise<{ crashes: number; anrs: number; toolCallFailures: number }> {
    const crashes = await this.getCrashes(options);
    const anrs = await this.getAnrs(options);
    const toolCallFailures =
      options.includeToolCallFailures !== false
        ? await this.getToolCallFailures(options)
        : [];

    return {
      crashes: crashes.length,
      anrs: anrs.length,
      toolCallFailures: toolCallFailures.length,
    };
  }
}
