import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("appearance_configs")
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
  await db.schema.dropTable("appearance_configs").execute();
}
