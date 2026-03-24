import type { Kysely } from "kysely";
import { sql } from "kysely";

async function columnExists(db: Kysely<unknown>, tableName: string, columnName: string): Promise<boolean> {
  const result = await sql<{ name: string }>`
    SELECT name FROM pragma_table_info(${tableName}) WHERE name = ${columnName}
  `.execute(db);
  return result.rows.length > 0;
}

export async function up(db: Kysely<unknown>): Promise<void> {
  if (!(await columnExists(db, "storage_events", "previous_value"))) {
    await db.schema
      .alterTable("storage_events")
      .addColumn("previous_value", "text")
      .execute();
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("storage_events")
    .dropColumn("previous_value")
    .execute();
}
