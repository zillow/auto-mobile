import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("storage_events")
    .ifNotExists()
    .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
    .addColumn("device_id", "text")
    .addColumn("timestamp", "integer", col => col.notNull())
    .addColumn("application_id", "text")
    .addColumn("session_id", "text")
    .addColumn("file_name", "text", col => col.notNull())
    .addColumn("key", "text")
    .addColumn("value", "text")
    .addColumn("value_type", "text")
    .addColumn("change_type", "text", col => col.notNull())
    .addColumn("created_at", "text", col => col.notNull().defaultTo("datetime('now')"))
    .execute();

  await db.schema
    .createIndex("idx_storage_events_timestamp")
    .ifNotExists()
    .on("storage_events")
    .column("timestamp")
    .execute();

  await db.schema
    .createIndex("idx_storage_events_device")
    .ifNotExists()
    .on("storage_events")
    .column("device_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("storage_events").ifExists().execute();
}
