import path from "path";
import { logger } from "./logger";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LOG_DIR } from "./constants";
import { FileSystem, DefaultFileSystem } from "./filesystem/DefaultFileSystem";
import { ToolRegistry, DefaultToolRegistry } from "./server/ToolRegistry";

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

class ReplayToolsService {
  private fileSystem: FileSystem;
  private toolRegistry: ToolRegistry;

  constructor(fileSystem?: FileSystem, toolRegistry?: ToolRegistry) {
    this.fileSystem = fileSystem || new DefaultFileSystem();
    this.toolRegistry = toolRegistry || new DefaultToolRegistry();
  }

  /**
   * Replays a single tool call from a log file
   */
  async replayToolCall(server: McpServer, logFilePath: string): Promise<boolean> {
    try {
      if (!this.fileSystem.existsSync(logFilePath)) {
        logger.error(`Log file not found: ${logFilePath}`);
        return false;
      }

      const logContent = await this.fileSystem.readFile(logFilePath, "utf8");
      const toolCall: ToolCallLog = JSON.parse(logContent);

      logger.info(`Replaying tool call: ${toolCall.tool} from ${toolCall.timestamp}`);

      try {
        // Use the tool registry to execute the tool call directly
        const tool = this.toolRegistry.getTool(toolCall.tool);
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
  }

  /**
   * Replays all tool calls from a session log file
   */
  async replayToolSession(server: McpServer, sessionId: string): Promise<boolean> {
    try {
      const sessionFilePath = path.join(LOG_DIR, `session_${sessionId}.json`);

      if (!this.fileSystem.existsSync(sessionFilePath)) {
        logger.error(`Session log file not found: ${sessionFilePath}`);
        return false;
      }

      const logContent = await this.fileSystem.readFile(sessionFilePath, "utf8");
      const toolCalls: ToolCallLog[] = JSON.parse(logContent);

      logger.info(`Replaying ${toolCalls.length} tool calls from session ${sessionId}`);

      for (const toolCall of toolCalls) {
        logger.info(`Replaying: ${toolCall.tool} from ${toolCall.timestamp}`);

        try {
          // Use the tool registry to execute the tool call directly
          const tool = this.toolRegistry.getTool(toolCall.tool);
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
  }

  /**
   * Lists all available tool call logs
   */
  async listToolLogs(): Promise<string[]> {
    try {
      if (!this.fileSystem.existsSync(LOG_DIR)) {
        logger.error(`Log directory not found: ${LOG_DIR}`);
        return [];
      }

      const files = await this.fileSystem.readdir(LOG_DIR);
      return files
        .filter(file => file.endsWith(".json"))
        .map(file => path.join(LOG_DIR, file));
    } catch (error) {
      logger.error(`Failed to list tool logs: ${error}`);
      return [];
    }
  }
}

// Export singleton instance
const replayToolsService = new ReplayToolsService();

/**
 * Replays a single tool call from a log file
 */
export const replayToolCall = (server: McpServer, logFilePath: string): Promise<boolean> => {
  return replayToolsService.replayToolCall(server, logFilePath);
};

/**
 * Replays all tool calls from a session log file
 */
export const replayToolSession = (server: McpServer, sessionId: string): Promise<boolean> => {
  return replayToolsService.replayToolSession(server, sessionId);
};

/**
 * Lists all available tool call logs
 */
export const listToolLogs = (): Promise<string[]> => {
  return replayToolsService.listToolLogs();
};

// Export the service class for testing
export { ReplayToolsService };
