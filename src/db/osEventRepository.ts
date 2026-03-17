import type { Kysely } from "kysely";
import type { Database } from "./types";
import { getDatabase } from "./database";

export interface RecordOsEventInput {
  deviceId: string | null;
  timestamp: number;
  applicationId: string | null;
  sessionId: string | null;
  category: string; // lifecycle, broadcast, websocket_frame
  kind: string;
  details: Record<string, string> | null;
}

const RETENTION_MAX_ROWS = 10_000;
let cleanupInProgress = false;

function getDb(db?: Kysely<Database>): Kysely<Database> {
  return db ?? (getDatabase() as unknown as Kysely<Database>);
}

export async function recordOsEvent(
  input: RecordOsEventInput,
  db?: Kysely<Database>
): Promise<void> {
  await getDb(db)
    .insertInto("os_events")
    .values({
      device_id: input.deviceId,
      timestamp: input.timestamp,
      application_id: input.applicationId,
      session_id: input.sessionId,
      category: input.category,
      kind: input.kind,
      details_json: input.details ? JSON.stringify(input.details) : null,
    })
    .execute();

  cleanupIfNeeded(db);
}

export async function getOsEvents(
  query: { deviceId?: string; sinceTimestamp?: number; category?: string; limit?: number },
  db?: Kysely<Database>
): Promise<RecordOsEventInput[]> {
  let q = getDb(db).selectFrom("os_events").selectAll();

  if (query.deviceId) {
    q = q.where("device_id", "=", query.deviceId);
  }
  if (query.sinceTimestamp) {
    q = q.where("timestamp", ">=", query.sinceTimestamp);
  }
  if (query.category) {
    q = q.where("category", "=", query.category);
  }

  q = q.orderBy("timestamp", "desc").limit(query.limit ?? 100);

  const rows = await q.execute();
  return rows.map(r => ({
    deviceId: r.device_id,
    timestamp: r.timestamp,
    applicationId: r.application_id,
    sessionId: r.session_id,
    category: r.category,
    kind: r.kind,
    details: r.details_json ? JSON.parse(r.details_json) : null,
  }));
}

async function cleanupIfNeeded(db?: Kysely<Database>): Promise<void> {
  if (cleanupInProgress) {return;}
  cleanupInProgress = true;
  try {
    const d = getDb(db);
    const count = await d
      .selectFrom("os_events")
      .select(d.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    if (Number(count.count) > RETENTION_MAX_ROWS) {
      const cutoff = await d
        .selectFrom("os_events")
        .select("timestamp")
        .orderBy("timestamp", "desc")
        .offset(RETENTION_MAX_ROWS)
        .limit(1)
        .executeTakeFirst();

      if (cutoff) {
        await d
          .deleteFrom("os_events")
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
