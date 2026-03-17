import type { Kysely } from "kysely";
import type { Database } from "./types";
import { getDatabase } from "./database";

export interface RecordCustomEventInput {
  deviceId: string | null;
  timestamp: number;
  applicationId: string | null;
  sessionId: string | null;
  name: string;
  properties: Record<string, string>;
}

const RETENTION_MAX_ROWS = 10_000;
let cleanupInProgress = false;

function getDb(db?: Kysely<Database>): Kysely<Database> {
  return db ?? (getDatabase() as unknown as Kysely<Database>);
}

export async function recordCustomEvent(
  input: RecordCustomEventInput,
  db?: Kysely<Database>
): Promise<void> {
  await getDb(db)
    .insertInto("custom_events")
    .values({
      device_id: input.deviceId,
      timestamp: input.timestamp,
      application_id: input.applicationId,
      session_id: input.sessionId,
      name: input.name,
      properties_json:
        Object.keys(input.properties).length > 0
          ? JSON.stringify(input.properties)
          : null,
    })
    .execute();

  cleanupIfNeeded(db);
}

export async function getCustomEvents(
  query: { deviceId?: string; sinceTimestamp?: number; name?: string; limit?: number },
  db?: Kysely<Database>
): Promise<RecordCustomEventInput[]> {
  let q = getDb(db).selectFrom("custom_events").selectAll();

  if (query.deviceId) {
    q = q.where("device_id", "=", query.deviceId);
  }
  if (query.sinceTimestamp) {
    q = q.where("timestamp", ">=", query.sinceTimestamp);
  }
  if (query.name) {
    q = q.where("name", "=", query.name);
  }

  q = q.orderBy("timestamp", "desc").limit(query.limit ?? 100);

  const rows = await q.execute();
  return rows.map(r => ({
    deviceId: r.device_id,
    timestamp: r.timestamp,
    applicationId: r.application_id,
    sessionId: r.session_id,
    name: r.name,
    properties: r.properties_json ? JSON.parse(r.properties_json) : {},
  }));
}

async function cleanupIfNeeded(db?: Kysely<Database>): Promise<void> {
  if (cleanupInProgress) {return;}
  cleanupInProgress = true;
  try {
    const d = getDb(db);
    const count = await d
      .selectFrom("custom_events")
      .select(d.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    if (Number(count.count) > RETENTION_MAX_ROWS) {
      const cutoff = await d
        .selectFrom("custom_events")
        .select("timestamp")
        .orderBy("timestamp", "desc")
        .offset(RETENTION_MAX_ROWS)
        .limit(1)
        .executeTakeFirst();

      if (cutoff) {
        await d
          .deleteFrom("custom_events")
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
