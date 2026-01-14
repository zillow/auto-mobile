import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("video_recordings")
    .addColumn("highlights_json", "text")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("video_recordings")
    .dropColumn("highlights_json")
    .execute();
}
