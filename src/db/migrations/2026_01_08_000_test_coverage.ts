import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create test_coverage_sessions table to track test run sessions
  await db.schema
    .createTable("test_coverage_sessions")
    .ifNotExists()
    .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
    .addColumn("session_uuid", "text", col => col.notNull().unique())
    .addColumn("app_id", "text", col =>
      col.notNull().references("navigation_apps.app_id").onDelete("cascade")
    )
    .addColumn("start_time", "integer", col => col.notNull())
    .addColumn("end_time", "integer")
    .addColumn("total_nodes_visited", "integer", col => col.notNull().defaultTo(0))
    .addColumn("total_edges_traversed", "integer", col => col.notNull().defaultTo(0))
    .addColumn("created_at", "text", col =>
      col.notNull().defaultTo("datetime('now')")
    )
    .execute();

  // Create index on session_uuid for fast lookups
  await db.schema
    .createIndex("idx_test_coverage_sessions_uuid")
    .ifNotExists()
    .on("test_coverage_sessions")
    .column("session_uuid")
    .execute();

  // Create index on app_id for filtering by app
  await db.schema
    .createIndex("idx_test_coverage_sessions_app")
    .ifNotExists()
    .on("test_coverage_sessions")
    .column("app_id")
    .execute();

  // Create test_node_coverage table to track which nodes were visited during tests
  await db.schema
    .createTable("test_node_coverage")
    .ifNotExists()
    .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
    .addColumn("session_id", "integer", col =>
      col.notNull().references("test_coverage_sessions.id").onDelete("cascade")
    )
    .addColumn("node_id", "integer", col =>
      col.notNull().references("navigation_nodes.id").onDelete("cascade")
    )
    .addColumn("visit_count", "integer", col => col.notNull().defaultTo(1))
    .addColumn("first_visit_time", "integer", col => col.notNull())
    .addColumn("last_visit_time", "integer", col => col.notNull())
    .addColumn("created_at", "text", col =>
      col.notNull().defaultTo("datetime('now')")
    )
    .execute();

  // Create unique constraint on (session_id, node_id)
  await db.schema
    .createIndex("idx_test_node_coverage_session_node")
    .ifNotExists()
    .on("test_node_coverage")
    .columns(["session_id", "node_id"])
    .unique()
    .execute();

  // Create index on session_id for efficient queries
  await db.schema
    .createIndex("idx_test_node_coverage_session")
    .ifNotExists()
    .on("test_node_coverage")
    .column("session_id")
    .execute();

  // Create test_edge_coverage table to track which edges were traversed during tests
  await db.schema
    .createTable("test_edge_coverage")
    .ifNotExists()
    .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
    .addColumn("session_id", "integer", col =>
      col.notNull().references("test_coverage_sessions.id").onDelete("cascade")
    )
    .addColumn("edge_id", "integer", col =>
      col.notNull().references("navigation_edges.id").onDelete("cascade")
    )
    .addColumn("traversal_count", "integer", col => col.notNull().defaultTo(1))
    .addColumn("first_traversal_time", "integer", col => col.notNull())
    .addColumn("last_traversal_time", "integer", col => col.notNull())
    .addColumn("created_at", "text", col =>
      col.notNull().defaultTo("datetime('now')")
    )
    .execute();

  // Create unique constraint on (session_id, edge_id)
  await db.schema
    .createIndex("idx_test_edge_coverage_session_edge")
    .ifNotExists()
    .on("test_edge_coverage")
    .columns(["session_id", "edge_id"])
    .unique()
    .execute();

  // Create index on session_id for efficient queries
  await db.schema
    .createIndex("idx_test_edge_coverage_session")
    .ifNotExists()
    .on("test_edge_coverage")
    .column("session_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("test_edge_coverage").execute();
  await db.schema.dropTable("test_node_coverage").execute();
  await db.schema.dropTable("test_coverage_sessions").execute();
}
