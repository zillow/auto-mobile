import { getDatabase } from "./database";
import type { NewToolCall } from "./types";
import { logger } from "../utils/logger";

export interface ToolCallRecord {
  toolName: string;
  timestamp: string;
  sessionUuid?: string | null;
}

export class ToolCallRepository {
  async recordToolCall(record: ToolCallRecord): Promise<void> {
    try {
      const db = getDatabase();
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
      const db = getDatabase();
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
