import path from "path";
import { logger } from "./logger";
import { LOG_DIR } from "./constants";
import { ensureDirExists, writeJsonToFile } from "./io";

// Ensure log directory exists
const ensureLogDir = async () => {
  try {
    await ensureDirExists(LOG_DIR);
  } catch (error) {
    logger.error(`Failed to create log directory: ${error}`);
  }
};

// Initialize log directory
ensureLogDir().catch(err => {
  logger.error(`Failed to initialize log directory: ${err}`);
});

// Generate a filename based on timestamp
const getLogFilename = () => {
  const now = new Date();
  const dateStr = now.toISOString().replace(/:/g, "-").replace(/\..+/, "");
  return `${dateStr}.json`;
};

// Log a tool call
export const logToolCall = async (
  name: string,
  params: Record<string, any>,
  result: { success: boolean; data?: any; error?: string }
) => {
  try {
    // Ensure log directory exists
    await ensureLogDir();

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      tool: name,
      params,
      result
    };

    const logFile = path.join(LOG_DIR, getLogFilename());
    await writeJsonToFile(logFile, logEntry, true);

    logger.debug(`Tool call logged to ${logFile}`);
    return logFile;
  } catch (error) {
    logger.error(`Failed to log tool call: ${error}`);
    return null;
  }
};

// Log a session with multiple tool calls
export const logToolSession = async (
  sessionId: string,
  toolCalls: Array<{
    timestamp: string;
    tool: string;
    params: Record<string, any>;
    result: { success: boolean; data?: any; error?: string };
  }>
) => {
  try {
    // Ensure log directory exists
    await ensureDirExists(LOG_DIR);

    const logFile = path.join(LOG_DIR, `session_${sessionId}.json`);
    await writeJsonToFile(logFile, toolCalls, true);

    logger.debug(`Tool session logged to ${logFile}`);
    return logFile;
  } catch (error) {
    logger.error(`Failed to log tool session: ${error}`);
    return null;
  }
};
