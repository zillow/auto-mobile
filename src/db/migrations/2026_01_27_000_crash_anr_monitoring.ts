import type { Kysely } from "kysely";
import { sql } from "kysely";

async function columnExists(
  db: Kysely<unknown>,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const result = await sql<{ name: string }>`
    SELECT name FROM pragma_table_info(${tableName}) WHERE name = ${columnName}
  `.execute(db);
  return result.rows.length > 0;
}

async function tableExists(
  db: Kysely<unknown>,
  tableName: string
): Promise<boolean> {
  const result = await sql<{ name: string }>`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${tableName}
  `.execute(db);
  return result.rows.length > 0;
}

export async function up(db: Kysely<unknown>): Promise<void> {
  // Extend tool_calls table with failure tracking columns
  if (!(await columnExists(db, "tool_calls", "status"))) {
    await db.schema
      .alterTable("tool_calls")
      .addColumn("status", "text", col => col.defaultTo("success"))
      .execute();
  }

  if (!(await columnExists(db, "tool_calls", "error_message"))) {
    await db.schema
      .alterTable("tool_calls")
      .addColumn("error_message", "text")
      .execute();
  }

  if (!(await columnExists(db, "tool_calls", "error_type"))) {
    await db.schema
      .alterTable("tool_calls")
      .addColumn("error_type", "text")
      .execute();
  }

  if (!(await columnExists(db, "tool_calls", "device_id"))) {
    await db.schema
      .alterTable("tool_calls")
      .addColumn("device_id", "text")
      .execute();
  }

  if (!(await columnExists(db, "tool_calls", "package_name"))) {
    await db.schema
      .alterTable("tool_calls")
      .addColumn("package_name", "text")
      .execute();
  }

  if (!(await columnExists(db, "tool_calls", "duration_ms"))) {
    await db.schema
      .alterTable("tool_calls")
      .addColumn("duration_ms", "integer")
      .execute();
  }

  if (!(await columnExists(db, "tool_calls", "tool_args"))) {
    await db.schema
      .alterTable("tool_calls")
      .addColumn("tool_args", "text")
      .execute();
  }

  // Create index for failed tool calls
  await db.schema
    .createIndex("idx_tool_calls_status")
    .ifNotExists()
    .on("tool_calls")
    .column("status")
    .ifNotExists()
    .execute();

  // Create crashes table
  if (!(await tableExists(db, "crashes"))) {
    await db.schema
      .createTable("crashes")
      .ifNotExists()
      .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
      .addColumn("device_id", "text", col => col.notNull())
      .addColumn("package_name", "text", col => col.notNull())
      .addColumn("crash_type", "text", col => col.notNull()) // java, native, system
      .addColumn("timestamp", "integer", col => col.notNull())
      .addColumn("process_name", "text")
      .addColumn("pid", "integer")
      .addColumn("exception_class", "text") // e.g., NullPointerException
      .addColumn("exception_message", "text")
      .addColumn("stacktrace", "text")
      .addColumn("signal", "text") // For native crashes (SIGSEGV, SIGABRT, etc.)
      .addColumn("fault_address", "text") // For native crashes
      .addColumn("tombstone_path", "text") // Path to tombstone file if available
      .addColumn("detection_source", "text", col => col.notNull()) // logcat, tombstone, dropbox, accessibility, process_monitor
      .addColumn("raw_log", "text") // Raw crash log output
      // Nullable FKs for linking to navigation and test runs
      .addColumn("navigation_node_id", "integer", col =>
        col.references("navigation_nodes.id").onDelete("set null")
      )
      .addColumn("test_execution_id", "integer", col =>
        col.references("test_executions.id").onDelete("set null")
      )
      .addColumn("session_uuid", "text")
      .addColumn("created_at", "text", col =>
        col.notNull().defaultTo("datetime('now')")
      )
      .execute();

    await db.schema
      .createIndex("idx_crashes_device_id")
      .ifNotExists()
      .on("crashes")
      .column("device_id")
      .execute();

    await db.schema
      .createIndex("idx_crashes_package_name")
      .ifNotExists()
      .on("crashes")
      .column("package_name")
      .execute();

    await db.schema
      .createIndex("idx_crashes_timestamp")
      .ifNotExists()
      .on("crashes")
      .column("timestamp")
      .execute();

    await db.schema
      .createIndex("idx_crashes_navigation_node")
      .ifNotExists()
      .on("crashes")
      .column("navigation_node_id")
      .execute();

    await db.schema
      .createIndex("idx_crashes_test_execution")
      .ifNotExists()
      .on("crashes")
      .column("test_execution_id")
      .execute();
  }

  // Create ANRs table
  if (!(await tableExists(db, "anrs"))) {
    await db.schema
      .createTable("anrs")
      .ifNotExists()
      .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
      .addColumn("device_id", "text", col => col.notNull())
      .addColumn("package_name", "text", col => col.notNull())
      .addColumn("timestamp", "integer", col => col.notNull())
      .addColumn("process_name", "text")
      .addColumn("pid", "integer")
      .addColumn("reason", "text") // e.g., "Input dispatching timed out"
      .addColumn("activity", "text") // Activity that was ANR'd
      .addColumn("wait_duration_ms", "integer") // How long the wait was
      .addColumn("cpu_usage", "text") // CPU usage info at time of ANR
      .addColumn("main_thread_state", "text") // State of main thread
      .addColumn("stacktrace", "text") // Main thread stacktrace
      .addColumn("detection_source", "text", col => col.notNull()) // logcat, dropbox, accessibility
      .addColumn("raw_log", "text") // Raw ANR log output
      // Nullable FKs for linking to navigation and test runs
      .addColumn("navigation_node_id", "integer", col =>
        col.references("navigation_nodes.id").onDelete("set null")
      )
      .addColumn("test_execution_id", "integer", col =>
        col.references("test_executions.id").onDelete("set null")
      )
      .addColumn("session_uuid", "text")
      .addColumn("created_at", "text", col =>
        col.notNull().defaultTo("datetime('now')")
      )
      .execute();

    await db.schema
      .createIndex("idx_anrs_device_id")
      .ifNotExists()
      .on("anrs")
      .column("device_id")
      .execute();

    await db.schema
      .createIndex("idx_anrs_package_name")
      .ifNotExists()
      .on("anrs")
      .column("package_name")
      .execute();

    await db.schema
      .createIndex("idx_anrs_timestamp")
      .ifNotExists()
      .on("anrs")
      .column("timestamp")
      .execute();

    await db.schema
      .createIndex("idx_anrs_navigation_node")
      .ifNotExists()
      .on("anrs")
      .column("navigation_node_id")
      .execute();

    await db.schema
      .createIndex("idx_anrs_test_execution")
      .ifNotExists()
      .on("anrs")
      .column("test_execution_id")
      .execute();
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("anrs").ifExists().execute();
  await db.schema.dropTable("crashes").ifExists().execute();

  // Note: SQLite doesn't support DROP COLUMN, so we can't remove the added columns
  // from tool_calls. In production, would need to recreate the table without these columns.
}
