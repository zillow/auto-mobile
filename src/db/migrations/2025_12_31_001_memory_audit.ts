import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create memory_thresholds table for per-app threshold configuration
  await db.schema
    .createTable("memory_thresholds")
    .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
    .addColumn("device_id", "text", col => col.notNull())
    .addColumn("package_name", "text", col => col.notNull())
    .addColumn("heap_growth_threshold_mb", "real", col => col.notNull()) // Max heap growth after GC
    .addColumn("native_heap_growth_threshold_mb", "real", col => col.notNull()) // Max native heap growth
    .addColumn("gc_count_threshold", "integer", col => col.notNull()) // Max GC events per action
    .addColumn("gc_duration_threshold_ms", "real", col => col.notNull()) // Max total GC pause time
    .addColumn("unreachable_objects_threshold", "integer", col => col.notNull()) // Max unreachable objects
    .addColumn("weight", "real", col => col.notNull().defaultTo(1.0)) // For weighted threshold calculation
    .addColumn("created_at", "text", col =>
      col.notNull().defaultTo("datetime('now')")
    )
    .addColumn("ttl_hours", "integer", col => col.notNull().defaultTo(24)) // TTL in hours
    .execute();

  // Create index on device_id + package_name for fast lookups
  await db.schema
    .createIndex("idx_memory_thresholds_device_package")
    .on("memory_thresholds")
    .columns(["device_id", "package_name"])
    .execute();

  // Create memory_baselines table for adaptive baseline tracking
  await db.schema
    .createTable("memory_baselines")
    .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
    .addColumn("device_id", "text", col => col.notNull())
    .addColumn("package_name", "text", col => col.notNull())
    .addColumn("tool_name", "text", col => col.notNull()) // Which tool action this baseline is for
    .addColumn("java_heap_baseline_mb", "real", col => col.notNull())
    .addColumn("native_heap_baseline_mb", "real", col => col.notNull())
    .addColumn("gc_count_baseline", "real", col => col.notNull()) // Average GC count
    .addColumn("gc_duration_baseline_ms", "real", col => col.notNull()) // Average GC duration
    .addColumn("unreachable_objects_baseline", "real", col => col.notNull()) // Average unreachable count
    .addColumn("sample_count", "integer", col => col.notNull().defaultTo(1)) // Number of samples in baseline
    .addColumn("last_updated", "text", col => col.notNull())
    .addColumn("created_at", "text", col =>
      col.notNull().defaultTo("datetime('now')")
    )
    .execute();

  // Create unique index on device_id + package_name + tool_name
  await db.schema
    .createIndex("idx_memory_baselines_device_package_tool")
    .on("memory_baselines")
    .columns(["device_id", "package_name", "tool_name"])
    .unique()
    .execute();

  // Create memory_audit_results table to store audit outcomes
  await db.schema
    .createTable("memory_audit_results")
    .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
    .addColumn("device_id", "text", col => col.notNull())
    .addColumn("session_id", "text", col => col.notNull())
    .addColumn("package_name", "text", col => col.notNull())
    .addColumn("tool_name", "text", col => col.notNull())
    .addColumn("tool_args", "text") // JSON blob of tool arguments
    .addColumn("timestamp", "text", col => col.notNull())
    .addColumn("passed", "integer", col => col.notNull()) // 0 = failed, 1 = passed
    // Pre-action measurements
    .addColumn("pre_java_heap_mb", "real")
    .addColumn("pre_native_heap_mb", "real")
    .addColumn("pre_total_pss_mb", "real")
    // Post-action measurements (after explicit GC)
    .addColumn("post_java_heap_mb", "real")
    .addColumn("post_native_heap_mb", "real")
    .addColumn("post_total_pss_mb", "real")
    // Deltas
    .addColumn("java_heap_growth_mb", "real")
    .addColumn("native_heap_growth_mb", "real")
    .addColumn("total_pss_growth_mb", "real")
    // GC metrics
    .addColumn("gc_count", "integer")
    .addColumn("gc_total_duration_ms", "real")
    // Unreachable objects
    .addColumn("unreachable_objects_count", "integer")
    // Diagnostics
    .addColumn("violations_json", "text") // JSON array of MemoryViolation[]
    .addColumn("diagnostics_json", "text") // JSON blob for detailed diagnostics
    .addColumn("created_at", "text", col =>
      col.notNull().defaultTo("datetime('now')")
    )
    .execute();

  // Create index on device_id + timestamp for historical queries
  await db.schema
    .createIndex("idx_memory_audit_results_device_timestamp")
    .on("memory_audit_results")
    .columns(["device_id", "timestamp"])
    .execute();

  // Create index on package_name + timestamp for app-specific queries
  await db.schema
    .createIndex("idx_memory_audit_results_package_timestamp")
    .on("memory_audit_results")
    .columns(["package_name", "timestamp"])
    .execute();

  // Create index on passed for filtering failures
  await db.schema
    .createIndex("idx_memory_audit_results_passed")
    .on("memory_audit_results")
    .column("passed")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("memory_audit_results").execute();
  await db.schema.dropTable("memory_baselines").execute();
  await db.schema.dropTable("memory_thresholds").execute();
}
