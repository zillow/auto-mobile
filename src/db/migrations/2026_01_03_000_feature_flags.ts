import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("feature_flags")
    .addColumn("key", "text", col => col.primaryKey())
    .addColumn("enabled", "integer", col => col.notNull().defaultTo(0))
    .addColumn("config_json", "text")
    .addColumn("created_at", "text", col =>
      col.notNull().defaultTo("datetime('now')")
    )
    .addColumn("updated_at", "text", col => col.notNull())
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("feature_flags").execute();
}
