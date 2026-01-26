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

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add screenshot_path column to navigation_nodes table (if not already present)
  const hasColumn = await columnExists(db, "navigation_nodes", "screenshot_path");
  if (!hasColumn) {
    await db.schema
      .alterTable("navigation_nodes")
      .addColumn("screenshot_path", "text")
      .execute();
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // SQLite doesn't support dropping columns directly, so we need to recreate the table
  // For simplicity, we'll use a workaround since SQLite 3.35.0+ supports DROP COLUMN
  await db.schema
    .alterTable("navigation_nodes")
    .dropColumn("screenshot_path")
    .execute();
}
