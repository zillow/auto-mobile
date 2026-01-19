import { beforeEach, afterEach, describe, expect, test } from "bun:test";
import { Database as BunDatabase } from "bun:sqlite";
import { Kysely, sql } from "kysely";
import { BunSqliteDialect } from "../../src/db/bunSqliteDialect";
import { runMigrations } from "../../src/db/migrator";

describe("runMigrations recovery", () => {
  let db: Kysely<unknown>;

  beforeEach(() => {
    process.env.AUTOMOBILE_MIGRATION_RECOVERY = "1";
    db = new Kysely<unknown>({
      dialect: new BunSqliteDialect({
        database: new BunDatabase(":memory:"),
      }),
    });
  });

  afterEach(async () => {
    await db.destroy();
    delete process.env.AUTOMOBILE_MIGRATION_RECOVERY;
  });

  test("prunes missing migrations from history", async () => {
    await runMigrations(db);

    const missingName = "2099_01_01_000_missing_migration";
    await sql`insert into kysely_migration (name, timestamp) values (${missingName}, ${new Date().toISOString()})`.execute(
      db
    );

    await runMigrations(db);

    const rows = await db
      .selectFrom("kysely_migration" as any)
      .select("name")
      .execute();
    const names = rows.map(row => String(row.name));

    expect(names).not.toContain(missingName);
  });
});
