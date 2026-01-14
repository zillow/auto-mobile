import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add session tracking columns to installed_apps table
  await db.schema
    .alterTable("installed_apps")
    .addColumn("daemon_session_id", "text")
    .execute();

  await db.schema
    .alterTable("installed_apps")
    .addColumn("device_session_start", "integer")
    .execute();

  // Create index for efficient session-based cleanup queries
  await db.schema
    .createIndex("idx_installed_apps_session")
    .on("installed_apps")
    .columns(["daemon_session_id", "device_session_start"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("idx_installed_apps_session").execute();

  await db.schema
    .alterTable("installed_apps")
    .dropColumn("daemon_session_id")
    .execute();

  await db.schema
    .alterTable("installed_apps")
    .dropColumn("device_session_start")
    .execute();
}
