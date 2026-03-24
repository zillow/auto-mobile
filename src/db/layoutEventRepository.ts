import type { Kysely } from "kysely";
import type { Database } from "./types";
import { getDatabase } from "./database";

export interface RecordLayoutEventInput {
  deviceId: string | null;
  timestamp: number;
  applicationId: string | null;
  sessionId: string | null;
  subType: string;
  composableName: string | null;
  composableId: string | null;
  recompositionCount: number | null;
  durationMs: number | null;
  likelyCause: string | null;
  detailsJson: string | null;
  screenName?: string | null;
}

const RETENTION_MAX_ROWS = 10_000;
let cleanupInProgress = false;

function getDb(db?: Kysely<Database>): Kysely<Database> {
  return db ?? (getDatabase() as unknown as Kysely<Database>);
}

export async function recordLayoutEvent(
  input: RecordLayoutEventInput,
  db?: Kysely<Database>
): Promise<void> {
  await getDb(db)
    .insertInto("layout_events")
    .values({
      device_id: input.deviceId,
      timestamp: input.timestamp,
      application_id: input.applicationId,
      session_id: input.sessionId,
      sub_type: input.subType,
      composable_name: input.composableName,
      composable_id: input.composableId,
      recomposition_count: input.recompositionCount,
      duration_ms: input.durationMs,
      likely_cause: input.likelyCause,
      details_json: input.detailsJson,
      screen_name: input.screenName ?? null,
    })
    .execute();

  cleanupIfNeeded(db);
}

export async function getLayoutEvents(
  query: { deviceId?: string; sinceTimestamp?: number; limit?: number },
  db?: Kysely<Database>
): Promise<RecordLayoutEventInput[]> {
  let q = getDb(db).selectFrom("layout_events").selectAll();

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
    subType: r.sub_type,
    composableName: r.composable_name,
    composableId: r.composable_id,
    recompositionCount: r.recomposition_count,
    durationMs: r.duration_ms,
    likelyCause: r.likely_cause,
    detailsJson: r.details_json,
    screenName: r.screen_name ?? null,
  }));
}

async function cleanupIfNeeded(db?: Kysely<Database>): Promise<void> {
  if (cleanupInProgress) {return;}
  cleanupInProgress = true;
  try {
    const d = getDb(db);
    const count = await d
      .selectFrom("layout_events")
      .select(d.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    if (Number(count.count) > RETENTION_MAX_ROWS) {
      const cutoff = await d
        .selectFrom("layout_events")
        .select("timestamp")
        .orderBy("timestamp", "desc")
        .offset(RETENTION_MAX_ROWS)
        .limit(1)
        .executeTakeFirst();

      if (cutoff) {
        await d
          .deleteFrom("layout_events")
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
