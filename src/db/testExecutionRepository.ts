import { getDatabase } from "./database";
import type { NewTestExecution } from "./types";
import { logger } from "../utils/logger";

const RETENTION_MAX_ROWS = 10_000;
const RETENTION_MAX_DAYS = 90;
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
      const cutoff = Date.now() - RETENTION_MAX_DAYS * MS_PER_DAY;

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
        .offset(RETENTION_MAX_ROWS - 1)
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
}
