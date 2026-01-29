import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Clear all existing navigation data (cascade handles related tables)
  // This is a breaking change - navigation graphs will need to be rebuilt
  await db.deleteFrom("navigation_edges" as never).execute();
  await db.deleteFrom("navigation_nodes" as never).execute();

  // 2. Create navigation_node_fingerprints table
  // Tracks view hierarchy fingerprints associated with named navigation nodes
  // Fingerprints are scoped per app to prevent cross-app collisions
  await db.schema
    .createTable("navigation_node_fingerprints")
    .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
    .addColumn("app_id", "text", col =>
      col.notNull().references("navigation_apps.app_id").onDelete("cascade")
    )
    .addColumn("node_id", "integer", col =>
      col.notNull().references("navigation_nodes.id").onDelete("cascade")
    )
    .addColumn("fingerprint_hash", "text", col => col.notNull())
    .addColumn("fingerprint_data", "text", col => col.notNull())
    .addColumn("first_seen_at", "integer", col => col.notNull())
    .addColumn("last_seen_at", "integer", col => col.notNull())
    .addColumn("occurrence_count", "integer", col => col.notNull().defaultTo(1))
    .addColumn("created_at", "text", col =>
      col.notNull().defaultTo("datetime('now')")
    )
    .execute();

  // Create unique index on (app_id, fingerprint_hash) - fingerprints are unique per app
  await db.schema
    .createIndex("idx_navigation_node_fingerprints_app_hash")
    .on("navigation_node_fingerprints")
    .columns(["app_id", "fingerprint_hash"])
    .unique()
    .execute();

  // Create index on node_id for efficient lookups
  await db.schema
    .createIndex("idx_navigation_node_fingerprints_node")
    .on("navigation_node_fingerprints")
    .column("node_id")
    .execute();

  // 3. Create navigation_suggestions table
  // Stores uncorrelated fingerprints for apps that have named nodes
  await db.schema
    .createTable("navigation_suggestions")
    .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
    .addColumn("app_id", "text", col =>
      col.notNull().references("navigation_apps.app_id").onDelete("cascade")
    )
    .addColumn("fingerprint_hash", "text", col => col.notNull())
    .addColumn("fingerprint_data", "text", col => col.notNull())
    .addColumn("first_seen_at", "integer", col => col.notNull())
    .addColumn("last_seen_at", "integer", col => col.notNull())
    .addColumn("occurrence_count", "integer", col => col.notNull().defaultTo(1))
    .addColumn("promoted_to_fingerprint_id", "integer", col =>
      col.references("navigation_node_fingerprints.id").onDelete("set null")
    )
    .addColumn("created_at", "text", col =>
      col.notNull().defaultTo("datetime('now')")
    )
    .execute();

  // Create unique index on (app_id, fingerprint_hash) for deduplication
  await db.schema
    .createIndex("idx_navigation_suggestions_app_hash")
    .on("navigation_suggestions")
    .columns(["app_id", "fingerprint_hash"])
    .unique()
    .execute();

  // Create index on app_id for efficient queries
  await db.schema
    .createIndex("idx_navigation_suggestions_app")
    .on("navigation_suggestions")
    .column("app_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("navigation_suggestions").execute();
  await db.schema.dropTable("navigation_node_fingerprints").execute();
}
