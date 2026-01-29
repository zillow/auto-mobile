import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("installed_apps")
    .ifNotExists()
    .addColumn("device_id", "text", col => col.notNull())
    .addColumn("user_id", "integer", col => col.notNull())
    .addColumn("package_name", "text", col => col.notNull())
    .addColumn("is_system", "integer", col => col.notNull().defaultTo(0))
    .addColumn("installed_at", "integer", col => col.notNull())
    .addColumn("last_verified_at", "integer", col => col.notNull())
    .addPrimaryKeyConstraint("installed_apps_pk", ["device_id", "user_id", "package_name"])
    .execute();

  await db.schema
    .createIndex("idx_installed_apps_lookup")
    .ifNotExists()
    .on("installed_apps")
    .columns(["device_id", "package_name"])
    .execute();

  await db.schema
    .createIndex("idx_installed_apps_last_verified")
    .ifNotExists()
    .on("installed_apps")
    .columns(["device_id", "last_verified_at"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("installed_apps").execute();
}
