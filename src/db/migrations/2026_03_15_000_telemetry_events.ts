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
  // Network events table
  if (!(await tableExists(db, "network_events"))) {
    await db.schema
      .createTable("network_events")
      .ifNotExists()
      .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
      .addColumn("device_id", "text")
      .addColumn("timestamp", "integer", col => col.notNull())
      .addColumn("application_id", "text")
      .addColumn("session_id", "text")
      .addColumn("url", "text", col => col.notNull())
      .addColumn("method", "text", col => col.notNull())
      .addColumn("status_code", "integer", col => col.notNull().defaultTo(0))
      .addColumn("duration_ms", "integer", col => col.notNull().defaultTo(0))
      .addColumn("request_body_size", "integer", col => col.defaultTo(-1))
      .addColumn("response_body_size", "integer", col => col.defaultTo(-1))
      .addColumn("protocol", "text")
      .addColumn("host", "text")
      .addColumn("path", "text")
      .addColumn("error", "text")
      .addColumn("created_at", "text", col => col.notNull().defaultTo("datetime('now')"))
      .execute();

    await db.schema
      .createIndex("idx_network_events_timestamp")
      .ifNotExists()
      .on("network_events")
      .column("timestamp")
      .execute();

    await db.schema
      .createIndex("idx_network_events_host")
      .ifNotExists()
      .on("network_events")
      .column("host")
      .execute();

    await db.schema
      .createIndex("idx_network_events_device")
      .ifNotExists()
      .on("network_events")
      .column("device_id")
      .execute();
  }

  // Log events table
  if (!(await tableExists(db, "log_events"))) {
    await db.schema
      .createTable("log_events")
      .ifNotExists()
      .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
      .addColumn("device_id", "text")
      .addColumn("timestamp", "integer", col => col.notNull())
      .addColumn("application_id", "text")
      .addColumn("session_id", "text")
      .addColumn("level", "integer", col => col.notNull())
      .addColumn("tag", "text", col => col.notNull())
      .addColumn("message", "text", col => col.notNull())
      .addColumn("filter_name", "text", col => col.notNull())
      .addColumn("created_at", "text", col => col.notNull().defaultTo("datetime('now')"))
      .execute();

    await db.schema
      .createIndex("idx_log_events_timestamp")
      .ifNotExists()
      .on("log_events")
      .column("timestamp")
      .execute();

    await db.schema
      .createIndex("idx_log_events_tag")
      .ifNotExists()
      .on("log_events")
      .column("tag")
      .execute();

    await db.schema
      .createIndex("idx_log_events_device")
      .ifNotExists()
      .on("log_events")
      .column("device_id")
      .execute();
  }

  // Custom events table
  if (!(await tableExists(db, "custom_events"))) {
    await db.schema
      .createTable("custom_events")
      .ifNotExists()
      .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
      .addColumn("device_id", "text")
      .addColumn("timestamp", "integer", col => col.notNull())
      .addColumn("application_id", "text")
      .addColumn("session_id", "text")
      .addColumn("name", "text", col => col.notNull())
      .addColumn("properties_json", "text") // JSON of string key-value pairs
      .addColumn("created_at", "text", col => col.notNull().defaultTo("datetime('now')"))
      .execute();

    await db.schema
      .createIndex("idx_custom_events_timestamp")
      .ifNotExists()
      .on("custom_events")
      .column("timestamp")
      .execute();

    await db.schema
      .createIndex("idx_custom_events_name")
      .ifNotExists()
      .on("custom_events")
      .column("name")
      .execute();

    await db.schema
      .createIndex("idx_custom_events_device")
      .ifNotExists()
      .on("custom_events")
      .column("device_id")
      .execute();
  }

  // OS events table (lifecycle, broadcast, websocket_frame)
  if (!(await tableExists(db, "os_events"))) {
    await db.schema
      .createTable("os_events")
      .ifNotExists()
      .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
      .addColumn("device_id", "text")
      .addColumn("timestamp", "integer", col => col.notNull())
      .addColumn("application_id", "text")
      .addColumn("session_id", "text")
      .addColumn("category", "text", col => col.notNull()) // lifecycle, broadcast, websocket_frame
      .addColumn("kind", "text", col => col.notNull()) // e.g., foreground, screen_on, connectivity_change
      .addColumn("details_json", "text") // JSON of additional details
      .addColumn("created_at", "text", col => col.notNull().defaultTo("datetime('now')"))
      .execute();

    await db.schema
      .createIndex("idx_os_events_timestamp")
      .ifNotExists()
      .on("os_events")
      .column("timestamp")
      .execute();

    await db.schema
      .createIndex("idx_os_events_category")
      .ifNotExists()
      .on("os_events")
      .column("category")
      .execute();

    await db.schema
      .createIndex("idx_os_events_device")
      .ifNotExists()
      .on("os_events")
      .column("device_id")
      .execute();
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("os_events").ifExists().execute();
  await db.schema.dropTable("custom_events").ifExists().execute();
  await db.schema.dropTable("log_events").ifExists().execute();
  await db.schema.dropTable("network_events").ifExists().execute();
}
