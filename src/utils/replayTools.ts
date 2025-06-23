import fs from "fs";
import path from "path";
import { logger } from "./logger";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LOG_DIR } from "./constants";
import { ToolRegistry } from "../server/toolRegistry";
import { readFileAsync, readdirAsync } from "./io";

// Interface for a logged tool call
interface ToolCallLog {
  timestamp: string;
  tool: string;
  params: Record<string, any>;
  result: {
    success: boolean;
    data?: any;
    error?: string
  };
}

/**
 * Replays a single tool call from a log file
 */
export const replayToolCall = async (server: McpServer, logFilePath: string): Promise<boolean> => {
  try {
    if (!fs.existsSync(logFilePath)) {
      logger.error(`Log file not found: ${logFilePath}`);
      return false;
    }

    const logContent = await readFileAsync(logFilePath, "utf8");
    const toolCall: ToolCallLog = JSON.parse(logContent);

    logger.info(`Replaying tool call: ${toolCall.tool} from ${toolCall.timestamp}`);

    try {
      // Use the tool registry to execute the tool call directly
      const tool = ToolRegistry.getTool(toolCall.tool);
      if (!tool) {
        logger.error(`Tool not found: ${toolCall.tool}`);
        return false;
      }

      const result = await tool.handler(toolCall.params);
      logger.info(`Replay result: ${JSON.stringify(result)}`);
      return true;
    } catch (error) {
      logger.error(`Failed to replay tool call: ${error}`);
      return false;
    }
  } catch (error) {
    logger.error(`Failed to replay tool call: ${error}`);
    return false;
  }
};

/**
 * Replays all tool calls from a session log file
 */
export const replayToolSession = async (server: McpServer, sessionId: string): Promise<boolean> => {
  try {
    const sessionFilePath = path.join(LOG_DIR, `session_${sessionId}.json`);

    if (!fs.existsSync(sessionFilePath)) {
      logger.error(`Session log file not found: ${sessionFilePath}`);
      return false;
    }

    const logContent = await readFileAsync(sessionFilePath, "utf8");
    const toolCalls: ToolCallLog[] = JSON.parse(logContent);

    logger.info(`Replaying ${toolCalls.length} tool calls from session ${sessionId}`);

    for (const toolCall of toolCalls) {
      logger.info(`Replaying: ${toolCall.tool} from ${toolCall.timestamp}`);

      try {
        // Use the tool registry to execute the tool call directly
        const tool = ToolRegistry.getTool(toolCall.tool);
        if (!tool) {
          logger.error(`Tool not found: ${toolCall.tool}`);
          continue;
        }

        const result = await tool.handler(toolCall.params);
        logger.info(`Result: ${JSON.stringify(result)}`);
      } catch (error) {
        logger.error(`Failed to replay tool call ${toolCall.tool}: ${error}`);
      }
    }

    return true;
  } catch (error) {
    logger.error(`Failed to replay tool session: ${error}`);
    return false;
  }
};

/**
 * Lists all available tool call logs
 */
export const listToolLogs = async (): Promise<string[]> => {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      logger.error(`Log directory not found: ${LOG_DIR}`);
      return [];
    }

    const files = await readdirAsync(LOG_DIR);
    return files
      .filter(file => file.endsWith(".json"))
      .map(file => path.join(LOG_DIR, file));
  } catch (error) {
    logger.error(`Failed to list tool logs: ${error}`);
    return [];
  }
};
