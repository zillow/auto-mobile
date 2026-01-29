import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create device_configs table
  await db.schema
    .createTable("device_configs")
    .ifNotExists()
    .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
    .addColumn("device_id", "text", col => col.notNull().unique())
    .addColumn("platform", "text", col => col.notNull())
    .addColumn("active_mode", "text")
    .addColumn("config_json", "text", col => col.notNull().defaultTo("{}"))
    .addColumn("created_at", "text", col =>
      col.notNull().defaultTo("datetime('now')")
    )
    .addColumn("updated_at", "text", col => col.notNull())
    .execute();

  // Create index on device_id for fast lookups
  await db.schema
    .createIndex("idx_device_configs_device_id")
    .ifNotExists()
    .on("device_configs")
    .column("device_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("device_configs").execute();
}
