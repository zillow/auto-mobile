import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("tool_calls")
    .ifNotExists()
    .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
    .addColumn("tool_name", "text", col => col.notNull())
    .addColumn("timestamp", "text", col => col.notNull())
    .addColumn("session_uuid", "text")
    .addColumn("created_at", "text", col =>
      col.notNull().defaultTo("datetime('now')")
    )
    .execute();

  await db.schema
    .createIndex("idx_tool_calls_timestamp")
    .ifNotExists()
    .on("tool_calls")
    .column("timestamp")
    .execute();

  await db.schema
    .createIndex("idx_tool_calls_session_uuid")
    .ifNotExists()
    .on("tool_calls")
    .column("session_uuid")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("tool_calls").execute();
}
