import type { Kysely } from "kysely";
import type { Database } from "./types";
import { getDatabase } from "./database";

export interface RecordStorageEventInput {
  deviceId: string | null;
  timestamp: number;
  applicationId: string | null;
  sessionId: string | null;
  fileName: string;
  key: string | null;
  value: string | null;
  valueType: string | null;
  changeType: string;
  previousValue?: string | null;
}

const RETENTION_MAX_ROWS = 10_000;
let cleanupInProgress = false;

function getDb(db?: Kysely<Database>): Kysely<Database> {
  return db ?? (getDatabase() as unknown as Kysely<Database>);
}

export async function recordStorageEvent(
  input: RecordStorageEventInput,
  db?: Kysely<Database>
): Promise<void> {
  const d = getDb(db);

  // Look up the previous value for this key if not already provided
  let previousValue: string | null = input.previousValue ?? null;
  if (previousValue === null && input.key !== null && input.deviceId !== null) {
    try {
      const q = d
        .selectFrom("storage_events")
        .select("value")
        .where("device_id", "=", input.deviceId)
        .where("file_name", "=", input.fileName)
        .where("key", "=", input.key)
        .orderBy("timestamp", "desc")
        .limit(1);
      const prev = await q.executeTakeFirst();
      if (prev) {
        previousValue = prev.value;
      }
    } catch {
      // best-effort lookup
    }
  }

  await d
    .insertInto("storage_events")
    .values({
      device_id: input.deviceId,
      timestamp: input.timestamp,
      application_id: input.applicationId,
      session_id: input.sessionId,
      file_name: input.fileName,
      key: input.key,
      value: input.value,
      value_type: input.valueType,
      change_type: input.changeType,
      previous_value: previousValue,
    })
    .execute();

  cleanupIfNeeded(db);
}

export async function getStorageEvents(
  query: { deviceId?: string; sinceTimestamp?: number; limit?: number },
  db?: Kysely<Database>
): Promise<RecordStorageEventInput[]> {
  let q = getDb(db).selectFrom("storage_events").selectAll();

  if (query.deviceId) {
    q = q.where("device_id", "=", query.deviceId);
  }
  if (query.sinceTimestamp) {
    q = q.where("timestamp", ">=", query.sinceTimestamp);
  }

  q = q.orderBy("timestamp", "desc").limit(query.limit ?? 100);

  const rows = await q.execute();
  return rows.map(r => ({
    deviceId: r.device_id,
    timestamp: r.timestamp,
    applicationId: r.application_id,
    sessionId: r.session_id,
    fileName: r.file_name,
    key: r.key,
    value: r.value,
    valueType: r.value_type,
    changeType: r.change_type,
    previousValue: r.previous_value ?? null,
  }));
}

async function cleanupIfNeeded(db?: Kysely<Database>): Promise<void> {
  if (cleanupInProgress) {return;}
  cleanupInProgress = true;
  try {
    const d = getDb(db);
    const count = await d
      .selectFrom("storage_events")
      .select(d.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    if (Number(count.count) > RETENTION_MAX_ROWS) {
      const cutoff = await d
        .selectFrom("storage_events")
        .select("timestamp")
        .orderBy("timestamp", "desc")
        .offset(RETENTION_MAX_ROWS)
        .limit(1)
        .executeTakeFirst();

      if (cutoff) {
        await d
          .deleteFrom("storage_events")
          .where("timestamp", "<", cutoff.timestamp)
          .execute();
      }
    }
  } catch {
    // best-effort cleanup
  } finally {
    cleanupInProgress = false;
  }
}
