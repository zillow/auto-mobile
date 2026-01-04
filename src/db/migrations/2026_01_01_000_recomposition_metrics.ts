import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("recomposition_metrics")
    .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
    .addColumn("device_id", "text", col => col.notNull())
    .addColumn("session_id", "text", col => col.notNull())
    .addColumn("package_name", "text", col => col.notNull())
    .addColumn("composable_id", "text", col => col.notNull())
    .addColumn("composable_name", "text")
    .addColumn("resource_id", "text")
    .addColumn("test_tag", "text")
    .addColumn("total_count", "integer", col => col.notNull())
    .addColumn("skip_count", "integer", col => col.notNull())
    .addColumn("rolling_1s_avg", "real")
    .addColumn("duration_ms", "real")
    .addColumn("likely_cause", "text")
    .addColumn("parent_chain_json", "text")
    .addColumn("stable_annotated", "integer")
    .addColumn("remembered_count", "integer")
    .addColumn("timestamp", "text", col => col.notNull())
    .addColumn("created_at", "text", col => col.notNull().defaultTo("CURRENT_TIMESTAMP"))
    .execute();

  await db.schema
    .createIndex("idx_recomposition_metrics_timestamp")
    .on("recomposition_metrics")
    .column("timestamp")
    .execute();

  await db.schema
    .createIndex("idx_recomposition_metrics_composable")
    .on("recomposition_metrics")
    .columns(["package_name", "composable_id", "timestamp"])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("recomposition_metrics").execute();
}
