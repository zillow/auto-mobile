import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("navigation_events")
    .ifNotExists()
    .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
    .addColumn("device_id", "text")
    .addColumn("timestamp", "integer", col => col.notNull())
    .addColumn("application_id", "text")
    .addColumn("session_id", "text")
    .addColumn("destination", "text", col => col.notNull())
    .addColumn("source", "text")
    .addColumn("arguments_json", "text")
    .addColumn("metadata_json", "text")
    .addColumn("created_at", "text", col => col.notNull().defaultTo("datetime('now')"))
    .execute();

  await db.schema
    .createIndex("idx_navigation_events_timestamp")
    .ifNotExists()
    .on("navigation_events")
    .column("timestamp")
    .execute();

  await db.schema
    .createIndex("idx_navigation_events_device")
    .ifNotExists()
    .on("navigation_events")
    .column("device_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("navigation_events").ifExists().execute();
}
