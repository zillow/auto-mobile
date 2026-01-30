import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add new columns to performance_audit_results table for live metrics
  await db.schema
    .alterTable("performance_audit_results")
    .addColumn("time_to_first_frame_ms", "real")
    .execute();

  await db.schema
    .alterTable("performance_audit_results")
    .addColumn("time_to_interactive_ms", "real")
    .execute();

  await db.schema
    .alterTable("performance_audit_results")
    .addColumn("frame_rate_fps", "real")
    .execute();

  await db.schema
    .alterTable("performance_audit_results")
    .addColumn("node_id", "integer")
    .execute();

  // Create index on node_id for navigation node lookups
  await db.schema
    .createIndex("idx_performance_audit_results_node_id")
    .on("performance_audit_results")
    .column("node_id")
    .execute();

  // Create composite index on (package_name, timestamp) for efficient pruning
  await db.schema
    .createIndex("idx_performance_audit_results_package_timestamp")
    .on("performance_audit_results")
    .columns(["package_name", "timestamp"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Drop indexes first
  await db.schema
    .dropIndex("idx_performance_audit_results_package_timestamp")
    .execute();

  await db.schema
    .dropIndex("idx_performance_audit_results_node_id")
    .execute();

  // SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
  // For simplicity in migration rollback, we'll just drop and recreate the table
  // This is acceptable for development but should be handled more carefully in production

  // Create a backup table with original schema
  await db.schema
    .createTable("performance_audit_results_backup")
    .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
    .addColumn("device_id", "text", col => col.notNull())
    .addColumn("session_id", "text", col => col.notNull())
    .addColumn("package_name", "text", col => col.notNull())
    .addColumn("timestamp", "text", col => col.notNull())
    .addColumn("passed", "integer", col => col.notNull())
    .addColumn("p50_ms", "real")
    .addColumn("p90_ms", "real")
    .addColumn("p95_ms", "real")
    .addColumn("p99_ms", "real")
    .addColumn("jank_count", "integer")
    .addColumn("missed_vsync_count", "integer")
    .addColumn("slow_ui_thread_count", "integer")
    .addColumn("frame_deadline_missed_count", "integer")
    .addColumn("cpu_usage_percent", "real")
    .addColumn("touch_latency_ms", "real")
    .addColumn("diagnostics_json", "text")
    .addColumn("created_at", "text", col =>
      col.notNull().defaultTo("datetime('now')")
    )
    .execute();

  // Copy data to backup
  await db.executeQuery(
    db.raw(`
      INSERT INTO performance_audit_results_backup
      SELECT id, device_id, session_id, package_name, timestamp, passed,
             p50_ms, p90_ms, p95_ms, p99_ms, jank_count, missed_vsync_count,
             slow_ui_thread_count, frame_deadline_missed_count, cpu_usage_percent,
             touch_latency_ms, diagnostics_json, created_at
      FROM performance_audit_results
    `).compile(db)
  );

  // Drop original table
  await db.schema.dropTable("performance_audit_results").execute();

  // Rename backup to original
  await db.executeQuery(
    db.raw("ALTER TABLE performance_audit_results_backup RENAME TO performance_audit_results").compile(db)
  );

  // Recreate original index
  await db.schema
    .createIndex("idx_performance_audit_results_device_timestamp")
    .on("performance_audit_results")
    .columns(["device_id", "timestamp"])
    .execute();
}
