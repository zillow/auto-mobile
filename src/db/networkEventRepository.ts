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
  requestHeaders?: Record<string, string> | null;
  responseHeaders?: Record<string, string> | null;
  requestBody?: string | null;
  responseBody?: string | null;
  contentType?: string | null;
}

const RETENTION_MAX_ROWS = 10_000;
let cleanupInProgress = false;

function getDb(db?: Kysely<Database>): Kysely<Database> {
  return db ?? (getDatabase() as unknown as Kysely<Database>);
}

export async function recordNetworkEvent(
  input: RecordNetworkEventInput,
  db?: Kysely<Database>
): Promise<number> {
  const result = await getDb(db)
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
      request_headers_json: input.requestHeaders ? JSON.stringify(input.requestHeaders) : null,
      response_headers_json: input.responseHeaders ? JSON.stringify(input.responseHeaders) : null,
      request_body: input.requestBody ?? null,
      response_body: input.responseBody ?? null,
      content_type: input.contentType ?? null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  cleanupIfNeeded(db);

  return result.id;
}

export interface NetworkEventWithId extends RecordNetworkEventInput {
  id: number;
}

export interface NetworkEventQuery {
  deviceId?: string;
  sinceTimestamp?: number;
  limit?: number;
  host?: string;
  method?: string;
  statusCode?: string;
  minStatusCode?: number;
}

const BODY_TRUNCATION_LIMIT = 10_240; // 10KB

function mapRow(r: any): NetworkEventWithId {
  return {
    id: r.id,
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
    requestHeaders: r.request_headers_json ? JSON.parse(r.request_headers_json) : null,
    responseHeaders: r.response_headers_json ? JSON.parse(r.response_headers_json) : null,
    requestBody: r.request_body ?? null,
    responseBody: r.response_body ?? null,
    contentType: r.content_type ?? null,
  };
}

export async function getNetworkEventById(
  id: number,
  db?: Kysely<Database>
): Promise<NetworkEventWithId | null> {
  const row = await getDb(db)
    .selectFrom("network_events")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!row) {
    return null;
  }

  const event = mapRow(row);

  // Truncate bodies to 10KB
  if (event.requestBody && event.requestBody.length > BODY_TRUNCATION_LIMIT) {
    event.requestBody = event.requestBody.slice(0, BODY_TRUNCATION_LIMIT);
  }
  if (event.responseBody && event.responseBody.length > BODY_TRUNCATION_LIMIT) {
    event.responseBody = event.responseBody.slice(0, BODY_TRUNCATION_LIMIT);
  }

  return event;
}

export async function getNetworkEvents(
  query: NetworkEventQuery,
  db?: Kysely<Database>
): Promise<NetworkEventWithId[]> {
  let q = getDb(db).selectFrom("network_events").selectAll();

  if (query.deviceId) {
    q = q.where("device_id", "=", query.deviceId);
  }
  if (query.sinceTimestamp) {
    q = q.where("timestamp", ">=", query.sinceTimestamp);
  }
  if (query.host) {
    q = q.where("host", "=", query.host);
  }
  if (query.method) {
    q = q.where("method", "=", query.method.toUpperCase());
  }
  if (query.statusCode) {
    if (/^\d+$/.test(query.statusCode)) {
      q = q.where("status_code", "=", parseInt(query.statusCode, 10));
    } else if (/^\dxx$/i.test(query.statusCode)) {
      const base = parseInt(query.statusCode[0], 10) * 100;
      q = q.where("status_code", ">=", base).where("status_code", "<", base + 100);
    }
  }
  if (query.minStatusCode !== undefined) {
    q = q.where("status_code", ">=", query.minStatusCode);
  }

  q = q.orderBy("timestamp", "desc").limit(query.limit ?? 100);

  const rows = await q.execute();
  return rows.map(mapRow);
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
