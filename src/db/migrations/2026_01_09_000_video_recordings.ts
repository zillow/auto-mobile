import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("video_recordings")
    .ifNotExists()
    .addColumn("recording_id", "text", col => col.primaryKey())
    .addColumn("device_id", "text", col => col.notNull())
    .addColumn("platform", "text", col => col.notNull())
    .addColumn("status", "text", col => col.notNull())
    .addColumn("output_name", "text")
    .addColumn("file_name", "text", col => col.notNull())
    .addColumn("file_path", "text", col => col.notNull())
    .addColumn("format", "text", col => col.notNull())
    .addColumn("size_bytes", "integer", col => col.notNull().defaultTo(0))
    .addColumn("duration_ms", "integer")
    .addColumn("codec", "text")
    .addColumn("created_at", "text", col => col.notNull())
    .addColumn("started_at", "text", col => col.notNull())
    .addColumn("ended_at", "text")
    .addColumn("last_accessed_at", "text", col => col.notNull())
    .addColumn("config_json", "text", col => col.notNull())
    .execute();

  await db.schema
    .createIndex("idx_video_recordings_status")
    .ifNotExists()
    .on("video_recordings")
    .column("status")
    .execute();

  await db.schema
    .createIndex("idx_video_recordings_device_status")
    .ifNotExists()
    .on("video_recordings")
    .columns(["device_id", "status"])
    .execute();

  await db.schema
    .createIndex("idx_video_recordings_last_accessed_at")
    .ifNotExists()
    .on("video_recordings")
    .column("last_accessed_at")
    .execute();

  await db.schema
    .createIndex("idx_video_recordings_created_at")
    .ifNotExists()
    .on("video_recordings")
    .column("created_at")
    .execute();

  await db.schema
    .createTable("video_recording_configs")
    .ifNotExists()
    .addColumn("key", "text", col => col.primaryKey())
    .addColumn("config_json", "text", col => col.notNull())
    .addColumn("updated_at", "text", col => col.notNull())
    .addColumn("created_at", "text", col =>
      col.notNull().defaultTo("datetime('now')")
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("video_recordings").execute();
  await db.schema.dropTable("video_recording_configs").execute();
}
