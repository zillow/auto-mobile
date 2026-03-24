import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("layout_events")
    .ifNotExists()
    .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
    .addColumn("device_id", "text")
    .addColumn("timestamp", "integer", col => col.notNull())
    .addColumn("application_id", "text")
    .addColumn("session_id", "text")
    .addColumn("sub_type", "text", col => col.notNull())
    .addColumn("composable_name", "text")
    .addColumn("composable_id", "text")
    .addColumn("recomposition_count", "integer")
    .addColumn("duration_ms", "integer")
    .addColumn("likely_cause", "text")
    .addColumn("details_json", "text")
    .addColumn("created_at", "text", col => col.notNull().defaultTo("datetime('now')"))
    .execute();

  await db.schema
    .createIndex("idx_layout_events_timestamp")
    .ifNotExists()
    .on("layout_events")
    .column("timestamp")
    .execute();

  await db.schema
    .createIndex("idx_layout_events_device")
    .ifNotExists()
    .on("layout_events")
    .column("device_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("layout_events").ifExists().execute();
}
