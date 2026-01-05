import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("test_executions")
    .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
    .addColumn("test_class", "text", col => col.notNull())
    .addColumn("test_method", "text", col => col.notNull())
    .addColumn("duration_ms", "integer", col => col.notNull())
    .addColumn("status", "text", col => col.notNull())
    .addColumn("timestamp", "integer", col => col.notNull())
    .addColumn("device_id", "text")
    .addColumn("device_name", "text")
    .addColumn("device_platform", "text")
    .addColumn("device_type", "text")
    .addColumn("app_version", "text")
    .addColumn("git_commit", "text")
    .addColumn("target_sdk", "integer")
    .addColumn("jdk_version", "text")
    .addColumn("jvm_target", "text")
    .addColumn("gradle_version", "text")
    .addColumn("is_ci", "integer")
    .addColumn("session_uuid", "text")
    .addColumn("created_at", "text", col =>
      col.notNull().defaultTo("datetime('now')")
    )
    .execute();

  await db.schema
    .createIndex("idx_test_executions_lookup")
    .on("test_executions")
    .columns(["test_class", "test_method"])
    .execute();

  await db.schema
    .createIndex("idx_test_executions_timestamp")
    .on("test_executions")
    .column("timestamp")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("test_executions").execute();
}
