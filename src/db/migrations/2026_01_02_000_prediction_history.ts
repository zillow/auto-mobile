import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("prediction_outcomes")
    .ifNotExists()
    .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
    .addColumn("app_id", "text", col =>
      col.notNull().references("navigation_apps.app_id").onDelete("cascade")
    )
    .addColumn("prediction_id", "text", col => col.notNull())
    .addColumn("timestamp", "integer", col => col.notNull())
    .addColumn("from_screen", "text", col => col.notNull())
    .addColumn("predicted_screen", "text", col => col.notNull())
    .addColumn("actual_screen", "text", col => col.notNull())
    .addColumn("tool_name", "text", col => col.notNull())
    .addColumn("tool_args", "text", col => col.notNull().defaultTo(""))
    .addColumn("predicted_elements", "text")
    .addColumn("found_elements", "text")
    .addColumn("confidence", "real", col => col.notNull())
    .addColumn("match_score", "real", col => col.notNull())
    .addColumn("correct", "integer", col => col.notNull())
    .addColumn("partial_match", "integer", col => col.notNull())
    .addColumn("error_type", "text")
    .addColumn("created_at", "text", col =>
      col.notNull().defaultTo("datetime('now')")
    )
    .execute();

  await db.schema
    .createIndex("idx_prediction_outcomes_app")
    .ifNotExists()
    .on("prediction_outcomes")
    .column("app_id")
    .execute();

  await db.schema
    .createIndex("idx_prediction_outcomes_from")
    .ifNotExists()
    .on("prediction_outcomes")
    .column("from_screen")
    .execute();

  await db.schema
    .createIndex("idx_prediction_outcomes_predicted")
    .ifNotExists()
    .on("prediction_outcomes")
    .column("predicted_screen")
    .execute();

  await db.schema
    .createIndex("idx_prediction_outcomes_tool")
    .ifNotExists()
    .on("prediction_outcomes")
    .column("tool_name")
    .execute();

  await db.schema
    .createTable("prediction_transition_stats")
    .ifNotExists()
    .addColumn("id", "integer", col => col.primaryKey().autoIncrement())
    .addColumn("app_id", "text", col =>
      col.notNull().references("navigation_apps.app_id").onDelete("cascade")
    )
    .addColumn("from_screen", "text", col => col.notNull())
    .addColumn("to_screen", "text", col => col.notNull())
    .addColumn("tool_name", "text", col => col.notNull())
    .addColumn("tool_args", "text", col => col.notNull().defaultTo(""))
    .addColumn("attempts", "integer", col => col.notNull())
    .addColumn("successes", "integer", col => col.notNull())
    .addColumn("total_confidence", "real", col => col.notNull())
    .addColumn("brier_score_sum", "real", col => col.notNull())
    .addColumn("updated_at", "text", col => col.notNull())
    .addColumn("created_at", "text", col =>
      col.notNull().defaultTo("datetime('now')")
    )
    .execute();

  await db.schema
    .createIndex("idx_prediction_transition_key")
    .ifNotExists()
    .on("prediction_transition_stats")
    .columns(["app_id", "from_screen", "to_screen", "tool_name", "tool_args"])
    .unique()
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("prediction_transition_stats").execute();
  await db.schema.dropTable("prediction_outcomes").execute();
}
