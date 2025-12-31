import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create navigation_apps table
  await db.schema
    .createTable("navigation_apps")
    .addColumn("app_id", "text", col => col.primaryKey())
    .addColumn("created_at", "text", col =>
      col.notNull().defaultTo("datetime('now')")
    )
    .addColumn("updated_at", "text", col => col.notNull())
    .execute();

  // Create navigation_nodes table
  await db.schema
    .createTable("navigation_nodes")
    .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
    .addColumn("app_id", "text", col =>
      col.notNull().references("navigation_apps.app_id").onDelete("cascade")
    )
    .addColumn("screen_name", "text", col => col.notNull())
    .addColumn("first_seen_at", "integer", col => col.notNull())
    .addColumn("last_seen_at", "integer", col => col.notNull())
    .addColumn("visit_count", "integer", col => col.notNull().defaultTo(1))
    .addColumn("back_stack_depth", "integer")
    .addColumn("task_id", "integer")
    .addColumn("created_at", "text", col =>
      col.notNull().defaultTo("datetime('now')")
    )
    .execute();

  // Create unique constraint on (app_id, screen_name)
  await db.schema
    .createIndex("idx_navigation_nodes_app_screen")
    .on("navigation_nodes")
    .columns(["app_id", "screen_name"])
    .unique()
    .execute();

  // Create navigation_edges table
  await db.schema
    .createTable("navigation_edges")
    .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
    .addColumn("app_id", "text", col =>
      col.notNull().references("navigation_apps.app_id").onDelete("cascade")
    )
    .addColumn("from_screen", "text", col => col.notNull())
    .addColumn("to_screen", "text", col => col.notNull())
    .addColumn("tool_name", "text")
    .addColumn("tool_args", "text")
    .addColumn("timestamp", "integer", col => col.notNull())
    .addColumn("created_at", "text", col =>
      col.notNull().defaultTo("datetime('now')")
    )
    .execute();

  // Create indices for navigation_edges
  await db.schema
    .createIndex("idx_navigation_edges_app")
    .on("navigation_edges")
    .column("app_id")
    .execute();

  await db.schema
    .createIndex("idx_navigation_edges_from")
    .on("navigation_edges")
    .column("from_screen")
    .execute();

  await db.schema
    .createIndex("idx_navigation_edges_to")
    .on("navigation_edges")
    .column("to_screen")
    .execute();

  // Create ui_elements table
  await db.schema
    .createTable("ui_elements")
    .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
    .addColumn("app_id", "text", col =>
      col.notNull().references("navigation_apps.app_id").onDelete("cascade")
    )
    .addColumn("text", "text")
    .addColumn("resource_id", "text")
    .addColumn("content_description", "text")
    .addColumn("class_name", "text")
    .addColumn("bounds_left", "integer")
    .addColumn("bounds_top", "integer")
    .addColumn("bounds_right", "integer")
    .addColumn("bounds_bottom", "integer")
    .addColumn("clickable", "integer")
    .addColumn("scrollable", "integer")
    .addColumn("first_seen_at", "integer", col => col.notNull())
    .addColumn("last_seen_at", "integer", col => col.notNull())
    .addColumn("created_at", "text", col =>
      col.notNull().defaultTo("datetime('now')")
    )
    .execute();

  // Create index on app_id for ui_elements
  await db.schema
    .createIndex("idx_ui_elements_app")
    .on("ui_elements")
    .column("app_id")
    .execute();

  // Create edge_ui_elements junction table
  await db.schema
    .createTable("edge_ui_elements")
    .addColumn("edge_id", "integer", col =>
      col.notNull().references("navigation_edges.id").onDelete("cascade")
    )
    .addColumn("ui_element_id", "integer", col =>
      col.notNull().references("ui_elements.id").onDelete("cascade")
    )
    .addColumn("selection_order", "integer", col => col.notNull().defaultTo(0))
    .execute();

  // Create primary key for edge_ui_elements
  await db.schema
    .createIndex("idx_edge_ui_elements_pk")
    .on("edge_ui_elements")
    .columns(["edge_id", "ui_element_id"])
    .unique()
    .execute();

  // Create node_modals table
  await db.schema
    .createTable("node_modals")
    .addColumn("node_id", "integer", col =>
      col.notNull().references("navigation_nodes.id").onDelete("cascade")
    )
    .addColumn("modal_identifier", "text", col => col.notNull())
    .addColumn("stack_level", "integer", col => col.notNull())
    .addColumn("created_at", "text", col =>
      col.notNull().defaultTo("datetime('now')")
    )
    .execute();

  // Create primary key for node_modals
  await db.schema
    .createIndex("idx_node_modals_pk")
    .on("node_modals")
    .columns(["node_id", "stack_level"])
    .unique()
    .execute();

  // Create edge_modals table
  await db.schema
    .createTable("edge_modals")
    .addColumn("edge_id", "integer", col =>
      col.notNull().references("navigation_edges.id").onDelete("cascade")
    )
    .addColumn("position", "text", col => col.notNull())
    .addColumn("modal_identifier", "text", col => col.notNull())
    .addColumn("stack_level", "integer", col => col.notNull())
    .addColumn("created_at", "text", col =>
      col.notNull().defaultTo("datetime('now')")
    )
    .execute();

  // Create primary key for edge_modals
  await db.schema
    .createIndex("idx_edge_modals_pk")
    .on("edge_modals")
    .columns(["edge_id", "position", "stack_level"])
    .unique()
    .execute();

  // Create scroll_positions table
  await db.schema
    .createTable("scroll_positions")
    .addColumn("edge_id", "integer", col =>
      col.primaryKey().references("navigation_edges.id").onDelete("cascade")
    )
    .addColumn("target_element_id", "integer", col =>
      col.notNull().references("ui_elements.id")
    )
    .addColumn("container_element_id", "integer", col =>
      col.references("ui_elements.id")
    )
    .addColumn("direction", "text", col => col.notNull())
    .addColumn("speed", "text")
    .addColumn("swipe_count", "integer")
    .addColumn("created_at", "text", col =>
      col.notNull().defaultTo("datetime('now')")
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("scroll_positions").execute();
  await db.schema.dropTable("edge_modals").execute();
  await db.schema.dropTable("node_modals").execute();
  await db.schema.dropTable("edge_ui_elements").execute();
  await db.schema.dropTable("ui_elements").execute();
  await db.schema.dropTable("navigation_edges").execute();
  await db.schema.dropTable("navigation_nodes").execute();
  await db.schema.dropTable("navigation_apps").execute();
}
