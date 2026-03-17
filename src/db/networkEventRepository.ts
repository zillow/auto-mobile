import type { Kysely } from "kysely";
import type { Database } from "./types";
import { getDatabase } from "./database";

export interface RecordNetworkEventInput {
  deviceId: string | null;
  timestamp: number;
  applicationId: string | null;
  sessionId: string | null;
  url: string;
  method: string;
  statusCode: number;
  durationMs: number;
  requestBodySize: number;
  responseBodySize: number;
  protocol: string | null;
  host: string | null;
  path: string | null;
  error: string | null;
}

const RETENTION_MAX_ROWS = 10_000;
let cleanupInProgress = false;

function getDb(db?: Kysely<Database>): Kysely<Database> {
  return db ?? (getDatabase() as unknown as Kysely<Database>);
}

export async function recordNetworkEvent(
  input: RecordNetworkEventInput,
  db?: Kysely<Database>
): Promise<void> {
  await getDb(db)
    .insertInto("network_events")
    .values({
      device_id: input.deviceId,
      timestamp: input.timestamp,
      application_id: input.applicationId,
      session_id: input.sessionId,
      url: input.url,
      method: input.method,
      status_code: input.statusCode,
      duration_ms: input.durationMs,
      request_body_size: input.requestBodySize,
      response_body_size: input.responseBodySize,
      protocol: input.protocol,
      host: input.host,
      path: input.path,
      error: input.error,
    })
    .execute();

  cleanupIfNeeded(db);
}

export async function getNetworkEvents(
  query: { deviceId?: string; sinceTimestamp?: number; limit?: number },
  db?: Kysely<Database>
): Promise<RecordNetworkEventInput[]> {
  let q = getDb(db).selectFrom("network_events").selectAll();

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
    url: r.url,
    method: r.method,
    statusCode: r.status_code,
    durationMs: r.duration_ms,
    requestBodySize: r.request_body_size ?? -1,
    responseBodySize: r.response_body_size ?? -1,
    protocol: r.protocol,
    host: r.host,
    path: r.path,
    error: r.error,
  }));
}

async function cleanupIfNeeded(db?: Kysely<Database>): Promise<void> {
  if (cleanupInProgress) {return;}
  cleanupInProgress = true;
  try {
    const d = getDb(db);
    const count = await d
      .selectFrom("network_events")
      .select(d.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    if (Number(count.count) > RETENTION_MAX_ROWS) {
      const cutoff = await d
        .selectFrom("network_events")
        .select("timestamp")
        .orderBy("timestamp", "desc")
        .offset(RETENTION_MAX_ROWS)
        .limit(1)
        .executeTakeFirst();

      if (cutoff) {
        await d
          .deleteFrom("network_events")
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
