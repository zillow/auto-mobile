import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("device_snapshots")
    .ifNotExists()
    .addColumn("snapshot_name", "text", col => col.primaryKey())
    .addColumn("device_id", "text", col => col.notNull())
    .addColumn("device_name", "text", col => col.notNull())
    .addColumn("platform", "text", col => col.notNull())
    .addColumn("snapshot_type", "text", col => col.notNull())
    .addColumn("include_app_data", "integer", col => col.notNull())
    .addColumn("include_settings", "integer", col => col.notNull())
    .addColumn("created_at", "text", col => col.notNull())
    .addColumn("last_accessed_at", "text", col => col.notNull())
    .addColumn("size_bytes", "integer", col => col.notNull().defaultTo(0))
    .addColumn("manifest_json", "text", col => col.notNull())
    .execute();

  await db.schema
    .createIndex("idx_device_snapshots_device_id")
    .ifNotExists()
    .on("device_snapshots")
    .column("device_id")
    .execute();

  await db.schema
    .createIndex("idx_device_snapshots_last_accessed_at")
    .ifNotExists()
    .on("device_snapshots")
    .column("last_accessed_at")
    .execute();

  await db.schema
    .createIndex("idx_device_snapshots_created_at")
    .ifNotExists()
    .on("device_snapshots")
    .column("created_at")
    .execute();

  await db.schema
    .createTable("device_snapshot_configs")
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
  await db.schema.dropTable("device_snapshots").execute();
  await db.schema.dropTable("device_snapshot_configs").execute();
}
