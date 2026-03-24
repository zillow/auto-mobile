import type { Kysely } from "kysely";
import { sql } from "kysely";

async function columnExists(db: Kysely<unknown>, tableName: string, columnName: string): Promise<boolean> {
  const result = await sql<{ name: string }>`
    SELECT name FROM pragma_table_info(${tableName}) WHERE name = ${columnName}
  `.execute(db);
  return result.rows.length > 0;
}

export async function up(db: Kysely<unknown>): Promise<void> {
  const columns = ["request_headers_json", "response_headers_json", "request_body", "response_body", "content_type"];
  for (const col of columns) {
    if (!(await columnExists(db, "network_events", col))) {
      await db.schema
        .alterTable("network_events")
        .addColumn(col, "text")
        .execute();
    }
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // SQLite doesn't support DROP COLUMN easily; these columns are nullable and safe to leave
}
