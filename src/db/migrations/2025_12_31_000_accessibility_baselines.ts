import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create accessibility_baselines table
  await db.schema
    .createTable("accessibility_baselines")
    .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
    .addColumn("screen_id", "text", col => col.notNull().unique())
    .addColumn("violations_json", "text", col => col.notNull()) // JSON blob of WcagViolation[]
    .addColumn("created_at", "text", col =>
      col.notNull().defaultTo("datetime('now')")
    )
    .addColumn("updated_at", "text", col => col.notNull())
    .execute();

  // Create index on screen_id for fast lookups
  await db.schema
    .createIndex("idx_accessibility_baselines_screen_id")
    .on("accessibility_baselines")
    .column("screen_id")
    .execute();

  // Create index on updated_at for cleanup queries
  await db.schema
    .createIndex("idx_accessibility_baselines_updated_at")
    .on("accessibility_baselines")
    .column("updated_at")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("accessibility_baselines").execute();
}
