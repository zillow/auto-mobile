import type { Kysely } from "kysely";
import { getDatabase } from "./database";
import type { Database, NewToolCall } from "./types";
import { logger } from "../utils/logger";

interface ToolCallRecord {
  toolName: string;
  timestamp: string;
  sessionUuid?: string | null;
}

export class ToolCallRepository {
  private db: Kysely<Database> | null;

  constructor(db?: Kysely<Database>) {
    this.db = db ?? null;
  }

  private getDb(): Kysely<Database> {
    if (this.db) {
      return this.db;
    }
    return getDatabase();
  }

  async recordToolCall(record: ToolCallRecord): Promise<void> {
    try {
      const db = this.getDb();
      const entry: NewToolCall = {
        tool_name: record.toolName,
        timestamp: record.timestamp,
        session_uuid: record.sessionUuid ?? null,
      };

      await db.insertInto("tool_calls").values(entry).execute();
    } catch (error) {
      logger.warn(`[ToolCallRepository] Failed to record tool call: ${error}`);
    }
  }

  async listToolNamesBetween(
    startTime: string,
    endTime: string,
    excludeTools: string[] = []
  ): Promise<string[]> {
    try {
      const db = this.getDb();
      const rows = await db
        .selectFrom("tool_calls")
        .select(["tool_name", "timestamp"])
        .where("timestamp", ">=", startTime)
        .where("timestamp", "<=", endTime)
        .orderBy("timestamp", "asc")
        .orderBy("id", "asc")
        .execute();

      const seen = new Set<string>();
      const results: string[] = [];
      const excludeSet = new Set(excludeTools);

      for (const row of rows) {
        if (excludeSet.has(row.tool_name)) {
          continue;
        }
        if (!seen.has(row.tool_name)) {
          results.push(row.tool_name);
          seen.add(row.tool_name);
        }
      }

      return results;
    } catch (error) {
      logger.warn(`[ToolCallRepository] Failed to list tool calls: ${error}`);
      return [];
    }
  }
}
