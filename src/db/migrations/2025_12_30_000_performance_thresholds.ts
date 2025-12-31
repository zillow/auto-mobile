import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create performance_thresholds table
  await db.schema
    .createTable("performance_thresholds")
    .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
    .addColumn("device_id", "text", col => col.notNull())
    .addColumn("session_id", "text", col => col.notNull())
    .addColumn("refresh_rate", "integer", col => col.notNull()) // Hz: 60, 90, 120, etc.
    .addColumn("frame_time_threshold_ms", "real", col => col.notNull()) // 16ms for 60Hz, 8.3ms for 120Hz
    .addColumn("p50_threshold_ms", "real", col => col.notNull())
    .addColumn("p90_threshold_ms", "real", col => col.notNull())
    .addColumn("p95_threshold_ms", "real", col => col.notNull())
    .addColumn("p99_threshold_ms", "real", col => col.notNull())
    .addColumn("jank_count_threshold", "integer", col => col.notNull()) // Max allowed jank frames
    .addColumn("cpu_usage_threshold_percent", "real", col => col.notNull()) // Max CPU %
    .addColumn("touch_latency_threshold_ms", "real", col => col.notNull())
    .addColumn("weight", "real", col => col.notNull().defaultTo(1.0)) // For weighted average
    .addColumn("created_at", "text", col =>
      col.notNull().defaultTo("datetime('now')")
    )
    .addColumn("ttl_hours", "integer", col => col.notNull().defaultTo(24)) // TTL in hours
    .execute();

  // Create index on device_id for fast lookups
  await db.schema
    .createIndex("idx_performance_thresholds_device_id")
    .on("performance_thresholds")
    .column("device_id")
    .execute();

  // Create index on session_id for session-specific queries
  await db.schema
    .createIndex("idx_performance_thresholds_session_id")
    .on("performance_thresholds")
    .column("session_id")
    .execute();

  // Create composite index for device + created_at for TTL queries
  await db.schema
    .createIndex("idx_performance_thresholds_device_created")
    .on("performance_thresholds")
    .columns(["device_id", "created_at"])
    .execute();

  // Create performance_audit_results table to store audit outcomes
  await db.schema
    .createTable("performance_audit_results")
    .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
    .addColumn("device_id", "text", col => col.notNull())
    .addColumn("session_id", "text", col => col.notNull())
    .addColumn("package_name", "text", col => col.notNull())
    .addColumn("timestamp", "text", col => col.notNull())
    .addColumn("passed", "integer", col => col.notNull()) // 0 = failed, 1 = passed
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
    .addColumn("diagnostics_json", "text") // JSON blob for detailed diagnostics
    .addColumn("created_at", "text", col =>
      col.notNull().defaultTo("datetime('now')")
    )
    .execute();

  // Create index on device_id + timestamp for historical queries
  await db.schema
    .createIndex("idx_performance_audit_results_device_timestamp")
    .on("performance_audit_results")
    .columns(["device_id", "timestamp"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("performance_audit_results").execute();
  await db.schema.dropTable("performance_thresholds").execute();
}
