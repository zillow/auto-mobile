/**
 * Simple logger utility with different log levels
 */
import fs from "fs";
import path from "path";
import { ensureDirExists, statAsync, renameAsync } from "./io";

export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
} as const;

export type LogLevel = typeof LogLevel[keyof typeof LogLevel];

// Default to INFO level in production, can be overridden
let currentLogLevel: LogLevel = LogLevel.INFO;

// Flag to control whether to also log to STDOUT (in addition to files)
let logToStdout = false;

// Create logs directory if it doesn't exist
const logsDir = path.join("/tmp/auto-mobile/logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}
ensureDirExists(logsDir).catch(err => {
  console.error("Failed to create logs directory:", err);
});

// Log file path
const logFilePath = path.join(logsDir, `server.log`);
let logStream = fs.createWriteStream(logFilePath, { flags: "a" });

// Maximum log file size (10MB)
const MAX_LOG_SIZE = 10 * 1024 * 1024;

// Function to check log file size and rotate if necessary
const checkAndRotateLog = async (): Promise<void> => {
  try {
    if (fs.existsSync(logFilePath)) {
      const stats = await statAsync(logFilePath);
      if (stats.size >= MAX_LOG_SIZE) {
        // Close current stream
        logStream.end();

        // Create backup filename with timestamp
        const timestamp = new Date().toISOString().replace(/:/g, "-");
        const backupPath = path.join(logsDir, `server-${timestamp}.log`);

        // Check if file still exists right before rename to avoid race condition
        if (fs.existsSync(logFilePath)) {
          // Rename current log file to backup
          await renameAsync(logFilePath, backupPath);
        }

        // Always create a new log stream after rotation attempt
        logStream = fs.createWriteStream(logFilePath, { flags: "a" });
      }
    }
  } catch (err) {
    // If rotation fails, ensure we have a valid log stream
    if (logStream.destroyed || !logStream.writable) {
      logStream = fs.createWriteStream(logFilePath, { flags: "a" });
    }
    console.error("Log rotation failed:", err);
  }
};

// Function to write to log file
const writeToLogFile = async (level: string, message: string, args: any[]) => {
  try {
    // Check and rotate log if needed before writing
    await checkAndRotateLog();

    const timestamp = new Date().toISOString();
    let logMessage = `${timestamp} [${level}] ${message}`;

    if (args.length > 0) {
      // Handle objects by converting them to strings
      const argsStr = args.map(arg => {
        if (typeof arg === "object") {
          return JSON.stringify(arg);
        }
        return String(arg);
      }).join(" ");
      logMessage += ` ${argsStr}`;
    }
    if (logMessage.length > 1000) {
      logMessage = logMessage.substring(0, 1000) + "... (truncated)";
    }
    logStream.write(logMessage + "\n");

    // Also write to STDOUT if enabled
    if (logToStdout) {
      console.log(logMessage);
    }
  } catch (err) {
    console.error("Failed to write log:", err);
  }
};

// Logger object with all methods
export const logger = {
  /**
   * Sets the current log level
   */
  setLogLevel(level: LogLevel): void {
    currentLogLevel = level;
  },

  /**
   * Gets the current log level
   */
  getLogLevel(): LogLevel {
    return currentLogLevel;
  },

  /**
   * Enables logging to STDOUT in addition to log files
   */
  enableStdoutLogging(): void {
    logToStdout = true;
  },

  /**
   * Disables logging to STDOUT
   */
  disableStdoutLogging(): void {
    logToStdout = false;
  },

  /**
   * Logs a debug message
   */
  debug(message: string, ...args: any[]): void {
    if (currentLogLevel <= LogLevel.DEBUG) {
      writeToLogFile("DEBUG", message, args).catch(err => {
        console.error("Failed to write debug log:", err);
      });
    }
  },

  /**
   * Logs an info message
   */
  info(message: string, ...args: any[]): void {
    if (currentLogLevel <= LogLevel.INFO) {
      writeToLogFile("INFO", message, args).catch(err => {
        console.error("Failed to write info log:", err);
      });
    }
  },

  /**
   * Logs a warning message
   */
  warn(message: string, ...args: any[]): void {
    if (currentLogLevel <= LogLevel.WARN) {
      writeToLogFile("WARN", message, args).catch(err => {
        console.error("Failed to write warn log:", err);
      });
    }
  },

  /**
   * Logs an error message
   */
  error(message: string, ...args: any[]): void {
    if (currentLogLevel <= LogLevel.ERROR) {
      writeToLogFile("ERROR", message, args).catch(err => {
        console.error("Failed to write error log:", err);
      });
    }
  },

  /**
   * Closes the log stream
   */
  close(): void {
    logStream.end();
  }
};
