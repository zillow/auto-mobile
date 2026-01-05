import { sql } from "kysely";
import { getDatabase } from "./database";
import type { NewTestExecution } from "./types";
import { logger } from "../utils/logger";

export const TEST_EXECUTION_RETENTION_MAX_ROWS = 10_000;
export const TEST_EXECUTION_RETENTION_MAX_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

let cleanupInProgress = false;

export type TestExecutionStatus = "passed" | "failed" | "skipped";

export interface TestExecutionRecord {
  testClass: string;
  testMethod: string;
  durationMs: number;
  status: TestExecutionStatus;
  timestamp: number;
  deviceId?: string | null;
  deviceName?: string | null;
  devicePlatform?: "android" | "ios" | null;
  deviceType?: "emulator" | "simulator" | "device" | null;
  appVersion?: string | null;
  gitCommit?: string | null;
  targetSdk?: number | null;
  jdkVersion?: string | null;
  jvmTarget?: string | null;
  gradleVersion?: string | null;
  isCi?: boolean | null;
  sessionUuid?: string | null;
}

export interface TestTimingQueryOptions {
  lookbackDays?: number;
  testClass?: string;
  testMethod?: string;
  deviceId?: string;
  deviceName?: string;
  devicePlatform?: "android" | "ios";
  deviceType?: "emulator" | "simulator" | "device";
  appVersion?: string;
  gitCommit?: string;
  targetSdk?: number;
  jdkVersion?: string;
  jvmTarget?: string;
  gradleVersion?: string;
  isCi?: boolean;
  sessionUuid?: string;
  minSamples?: number;
  limit?: number;
  orderBy?: "lastRun" | "averageDuration" | "sampleSize";
  orderDirection?: "asc" | "desc";
}

export interface TestTimingStats {
  testClass: string;
  testMethod: string;
  averageDurationMs: number;
  sampleSize: number;
  lastRunTimestampMs: number;
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  stdDevDurationMs: number;
}

export class TestExecutionRepository {
  async recordExecution(record: TestExecutionRecord): Promise<void> {
    const db = getDatabase();

    const entry: NewTestExecution = {
      test_class: record.testClass,
      test_method: record.testMethod,
      duration_ms: Math.max(0, Math.round(record.durationMs)),
      status: record.status,
      timestamp: record.timestamp,
      device_id: record.deviceId ?? null,
      device_name: record.deviceName ?? null,
      device_platform: record.devicePlatform ?? null,
      device_type: record.deviceType ?? null,
      app_version: record.appVersion ?? null,
      git_commit: record.gitCommit ?? null,
      target_sdk: record.targetSdk ?? null,
      jdk_version: record.jdkVersion ?? null,
      jvm_target: record.jvmTarget ?? null,
      gradle_version: record.gradleVersion ?? null,
      is_ci: record.isCi === null || record.isCi === undefined ? null : record.isCi ? 1 : 0,
      session_uuid: record.sessionUuid ?? null,
    };

    await db.insertInto("test_executions").values(entry).execute();

    await this.cleanupRetention();
  }

  private async cleanupRetention(): Promise<void> {
    if (cleanupInProgress) {
      return;
    }

    cleanupInProgress = true;
    try {
      const db = getDatabase();
      const cutoff = Date.now() - TEST_EXECUTION_RETENTION_MAX_DAYS * MS_PER_DAY;

      await db
        .deleteFrom("test_executions")
        .where("timestamp", "<", cutoff)
        .execute();

      const threshold = await db
        .selectFrom("test_executions")
        .select(["id", "timestamp"])
        .orderBy("timestamp", "desc")
        .orderBy("id", "desc")
        .limit(1)
        .offset(TEST_EXECUTION_RETENTION_MAX_ROWS - 1)
        .executeTakeFirst();

      if (!threshold) {
        return;
      }

      await db
        .deleteFrom("test_executions")
        .where(eb => eb.or([
          eb("timestamp", "<", threshold.timestamp),
          eb.and([
            eb("timestamp", "=", threshold.timestamp),
            eb("id", "<", threshold.id),
          ]),
        ]))
        .execute();
    } catch (error) {
      logger.warn(`[TestExecutionRepository] Retention cleanup failed: ${error}`);
    } finally {
      cleanupInProgress = false;
    }
  }

  async getTimingStats(options: TestTimingQueryOptions): Promise<TestTimingStats[]> {
    const db = getDatabase();

    let query = db
      .selectFrom("test_executions")
      .select([
        "test_class as testClass",
        "test_method as testMethod",
        db.fn.avg<number>("duration_ms").as("avgDurationMs"),
        db.fn.avg<number>(sql`duration_ms * duration_ms`).as("avgDurationMsSquared"),
        db.fn.countAll<number>().as("sampleSize"),
        db.fn.max<number>("timestamp").as("lastRunTimestampMs"),
        db.fn.sum<number>(sql`case when status = 'passed' then 1 else 0 end`).as("passedCount"),
        db.fn.sum<number>(sql`case when status = 'failed' then 1 else 0 end`).as("failedCount"),
        db.fn.sum<number>(sql`case when status = 'skipped' then 1 else 0 end`).as("skippedCount"),
      ])
      .groupBy(["test_class", "test_method"]);

    if (options.lookbackDays && options.lookbackDays > 0) {
      const cutoff = Date.now() - options.lookbackDays * MS_PER_DAY;
      query = query.where("timestamp", ">=", cutoff);
    }

    if (options.testClass) {
      query = query.where("test_class", "=", options.testClass);
    }

    if (options.testMethod) {
      query = query.where("test_method", "=", options.testMethod);
    }

    if (options.deviceId) {
      query = query.where("device_id", "=", options.deviceId);
    }

    if (options.deviceName) {
      query = query.where("device_name", "=", options.deviceName);
    }

    if (options.devicePlatform) {
      query = query.where("device_platform", "=", options.devicePlatform);
    }

    if (options.deviceType) {
      query = query.where("device_type", "=", options.deviceType);
    }

    if (options.appVersion) {
      query = query.where("app_version", "=", options.appVersion);
    }

    if (options.gitCommit) {
      query = query.where("git_commit", "=", options.gitCommit);
    }

    if (options.targetSdk !== undefined) {
      query = query.where("target_sdk", "=", options.targetSdk);
    }

    if (options.jdkVersion) {
      query = query.where("jdk_version", "=", options.jdkVersion);
    }

    if (options.jvmTarget) {
      query = query.where("jvm_target", "=", options.jvmTarget);
    }

    if (options.gradleVersion) {
      query = query.where("gradle_version", "=", options.gradleVersion);
    }

    if (options.sessionUuid) {
      query = query.where("session_uuid", "=", options.sessionUuid);
    }

    if (typeof options.isCi === "boolean") {
      query = query.where("is_ci", "=", options.isCi ? 1 : 0);
    }

    if (options.minSamples && options.minSamples > 1) {
      query = query.having(db.fn.countAll(), ">=", options.minSamples);
    }

    const orderBy = options.orderBy ?? "lastRun";
    const orderDirection = options.orderDirection ?? "desc";

    switch (orderBy) {
      case "averageDuration":
        query = query.orderBy("avgDurationMs", orderDirection);
        break;
      case "sampleSize":
        query = query.orderBy("sampleSize", orderDirection);
        break;
      default:
        query = query.orderBy("lastRunTimestampMs", orderDirection);
        break;
    }

    if (options.limit && options.limit > 0) {
      query = query.limit(options.limit);
    }

    const rows = await query.execute();

    return rows.map(row => {
      const avgDuration = Number(row.avgDurationMs ?? 0);
      const avgSquare = Number(row.avgDurationMsSquared ?? 0);
      const variance = Math.max(0, avgSquare - avgDuration * avgDuration);
      const stdDev = Math.sqrt(variance);

      return {
        testClass: row.testClass,
        testMethod: row.testMethod,
        averageDurationMs: Math.round(avgDuration),
        sampleSize: Number(row.sampleSize ?? 0),
        lastRunTimestampMs: Number(row.lastRunTimestampMs ?? 0),
        passedCount: Number(row.passedCount ?? 0),
        failedCount: Number(row.failedCount ?? 0),
        skippedCount: Number(row.skippedCount ?? 0),
        stdDevDurationMs: Math.round(stdDev),
      };
    });
  }
}
