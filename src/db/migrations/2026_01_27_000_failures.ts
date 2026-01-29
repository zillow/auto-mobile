import type { Kysely } from "kysely";

async function tableExists(
  db: Kysely<unknown>,
  tableName: string
): Promise<boolean> {
  const result = await db
    .selectFrom("sqlite_master" as never)
    .select("name")
    .where("type", "=", "table")
    .where("name", "=", tableName)
    .execute();
  return result.length > 0;
}

export async function up(db: Kysely<unknown>): Promise<void> {
  // Main failure groups table - groups similar failures by signature
  if (!(await tableExists(db, "failure_groups"))) {
    await db.schema
      .createTable("failure_groups")
    .ifNotExists()
      .addColumn("id", "text", col => col.primaryKey())
      .addColumn("type", "text", col => col.notNull()) // crash, anr, tool_failure
      .addColumn("signature", "text", col => col.notNull()) // Stack trace hash or tool+error
      .addColumn("title", "text", col => col.notNull())
      .addColumn("message", "text", col => col.notNull())
      .addColumn("severity", "text", col => col.notNull()) // critical, high, medium, low
      .addColumn("first_occurrence", "integer", col => col.notNull())
      .addColumn("last_occurrence", "integer", col => col.notNull())
      .addColumn("total_count", "integer", col => col.notNull().defaultTo(0))
      .addColumn("unique_sessions", "integer", col => col.notNull().defaultTo(0))
      .addColumn("stack_trace_json", "text") // JSON array of StackTraceElement
      .addColumn("tool_call_info_json", "text") // JSON of AggregatedToolCallInfo
      .addColumn("created_at", "text", col => col.notNull().defaultTo("datetime('now')"))
      .addColumn("updated_at", "text", col => col.notNull().defaultTo("datetime('now')"))
      .execute();

    await db.schema
      .createIndex("idx_failure_groups_type")
    .ifNotExists()
      .on("failure_groups")
      .column("type")
      .execute();

    await db.schema
      .createIndex("idx_failure_groups_signature")
    .ifNotExists()
      .on("failure_groups")
      .column("signature")
      .execute();

    await db.schema
      .createIndex("idx_failure_groups_last_occurrence")
    .ifNotExists()
      .on("failure_groups")
      .column("last_occurrence")
      .execute();
  }

  // Individual failure occurrences
  if (!(await tableExists(db, "failure_occurrences"))) {
    await db.schema
      .createTable("failure_occurrences")
    .ifNotExists()
      .addColumn("id", "text", col => col.primaryKey())
      .addColumn("group_id", "text", col =>
        col.notNull().references("failure_groups.id").onDelete("cascade")
      )
      .addColumn("timestamp", "integer", col => col.notNull())
      .addColumn("device_id", "text")
      .addColumn("device_model", "text", col => col.notNull())
      .addColumn("os", "text", col => col.notNull())
      .addColumn("app_version", "text", col => col.notNull())
      .addColumn("session_id", "text", col => col.notNull())
      .addColumn("screen_at_failure", "text")
      .addColumn("test_name", "text")
      .addColumn("test_execution_id", "integer") // FK to test_executions if from a test
      .addColumn("error_code", "text") // For tool failures
      .addColumn("duration_ms", "integer") // For tool failures
      .addColumn("tool_args_json", "text") // For tool failures - JSON of parameters
      .addColumn("created_at", "text", col => col.notNull().defaultTo("datetime('now')"))
      .execute();

    await db.schema
      .createIndex("idx_failure_occurrences_group")
    .ifNotExists()
      .on("failure_occurrences")
      .column("group_id")
      .execute();

    await db.schema
      .createIndex("idx_failure_occurrences_timestamp")
    .ifNotExists()
      .on("failure_occurrences")
      .column("timestamp")
      .execute();

    await db.schema
      .createIndex("idx_failure_occurrences_session")
    .ifNotExists()
      .on("failure_occurrences")
      .column("session_id")
      .execute();

    await db.schema
      .createIndex("idx_failure_occurrences_device")
    .ifNotExists()
      .on("failure_occurrences")
      .column("device_id")
      .execute();
  }

  // Screens visited during a failure occurrence
  if (!(await tableExists(db, "failure_occurrence_screens"))) {
    await db.schema
      .createTable("failure_occurrence_screens")
    .ifNotExists()
      .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
      .addColumn("occurrence_id", "text", col =>
        col.notNull().references("failure_occurrences.id").onDelete("cascade")
      )
      .addColumn("screen_name", "text", col => col.notNull())
      .addColumn("visit_order", "integer", col => col.notNull())
      .addColumn("created_at", "text", col => col.notNull().defaultTo("datetime('now')"))
      .execute();

    await db.schema
      .createIndex("idx_failure_occurrence_screens_occurrence")
    .ifNotExists()
      .on("failure_occurrence_screens")
      .column("occurrence_id")
      .execute();
  }

  // Captures (screenshots/videos) associated with failures
  if (!(await tableExists(db, "failure_captures"))) {
    await db.schema
      .createTable("failure_captures")
    .ifNotExists()
      .addColumn("id", "text", col => col.primaryKey())
      .addColumn("occurrence_id", "text", col =>
        col.notNull().references("failure_occurrences.id").onDelete("cascade")
      )
      .addColumn("type", "text", col => col.notNull()) // screenshot, video
      .addColumn("path", "text", col => col.notNull())
      .addColumn("timestamp", "integer", col => col.notNull())
      .addColumn("device_model", "text", col => col.notNull())
      .addColumn("created_at", "text", col => col.notNull().defaultTo("datetime('now')"))
      .execute();

    await db.schema
      .createIndex("idx_failure_captures_occurrence")
    .ifNotExists()
      .on("failure_captures")
      .column("occurrence_id")
      .execute();
  }

  // Notifications for real-time streaming - tracks which occurrences are new
  if (!(await tableExists(db, "failure_notifications"))) {
    await db.schema
      .createTable("failure_notifications")
    .ifNotExists()
      .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
      .addColumn("occurrence_id", "text", col =>
        col.notNull().references("failure_occurrences.id").onDelete("cascade")
      )
      .addColumn("group_id", "text", col => col.notNull())
      .addColumn("type", "text", col => col.notNull()) // crash, anr, tool_failure
      .addColumn("severity", "text", col => col.notNull())
      .addColumn("title", "text", col => col.notNull())
      .addColumn("timestamp", "integer", col => col.notNull())
      .addColumn("acknowledged", "integer", col => col.notNull().defaultTo(0)) // SQLite boolean
      .addColumn("created_at", "text", col => col.notNull().defaultTo("datetime('now')"))
      .execute();

    await db.schema
      .createIndex("idx_failure_notifications_timestamp")
    .ifNotExists()
      .on("failure_notifications")
      .column("timestamp")
      .execute();

    await db.schema
      .createIndex("idx_failure_notifications_acknowledged")
    .ifNotExists()
      .on("failure_notifications")
      .column("acknowledged")
      .execute();
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("failure_notifications").ifExists().execute();
  await db.schema.dropTable("failure_captures").ifExists().execute();
  await db.schema.dropTable("failure_occurrence_screens").ifExists().execute();
  await db.schema.dropTable("failure_occurrences").ifExists().execute();
  await db.schema.dropTable("failure_groups").ifExists().execute();
}
