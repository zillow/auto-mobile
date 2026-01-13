/**
 * Fake logger implementation for testing
 * Captures logs in memory instead of writing to files
 */
import { Logger, LogLevel } from "../../src/utils/logger";

export interface CapturedLog {
  level: string;
  message: string;
  args: any[];
  timestamp: Date;
}

export class FakeLogger implements Logger {
  private currentLogLevel: LogLevel = LogLevel.INFO;
  private logs: CapturedLog[] = [];
  private logToStdout = false;

  /**
   * Logs a debug message
   */
  debug(message: string, ...args: any[]): void {
    if (this.currentLogLevel <= LogLevel.DEBUG) {
      this.captureLog("DEBUG", message, args);
    }
  }

  /**
   * Logs an info message
   */
  info(message: string, ...args: any[]): void {
    if (this.currentLogLevel <= LogLevel.INFO) {
      this.captureLog("INFO", message, args);
    }
  }

  /**
   * Logs a warning message
   */
  warn(message: string, ...args: any[]): void {
    if (this.currentLogLevel <= LogLevel.WARN) {
      this.captureLog("WARN", message, args);
    }
  }

  /**
   * Logs an error message
   */
  error(message: string, ...args: any[]): void {
    if (this.currentLogLevel <= LogLevel.ERROR) {
      this.captureLog("ERROR", message, args);
    }
  }

  /**
   * Sets the current log level
   */
  setLogLevel(level: LogLevel): void {
    this.currentLogLevel = level;
  }

  /**
   * Sets the log level using a string or number
   */
  setLevel(level: LogLevel | string): void {
    if (typeof level === "string") {
      const levelStr = level.toUpperCase();
      const levelValue = (LogLevel as any)[levelStr];
      if (levelValue !== undefined) {
        this.currentLogLevel = levelValue;
      }
    } else {
      this.currentLogLevel = level;
    }
  }

  /**
   * Gets the current log level
   */
  getLogLevel(): LogLevel {
    return this.currentLogLevel;
  }

  /**
   * Enables logging to STDOUT in addition to capturing logs
   */
  enableStdoutLogging(): void {
    this.logToStdout = true;
  }

  /**
   * Disables logging to STDOUT
   */
  disableStdoutLogging(): void {
    this.logToStdout = false;
  }

  /**
   * Closes the log stream (no-op for fake logger)
   */
  close(): void {
    // no-op
  }

  // Query methods for testing

  /**
   * Gets all captured debug logs
   */
  getDebugLogs(): CapturedLog[] {
    return this.getLogs("DEBUG");
  }

  /**
   * Gets all captured info logs
   */
  getInfoLogs(): CapturedLog[] {
    return this.getLogs("INFO");
  }

  /**
   * Gets all captured warn logs
   */
  getWarnLogs(): CapturedLog[] {
    return this.getLogs("WARN");
  }

  /**
   * Gets all captured error logs
   */
  getErrorLogs(): CapturedLog[] {
    return this.getLogs("ERROR");
  }

  /**
   * Gets all captured logs
   */
  getAllLogs(): CapturedLog[] {
    return [...this.logs];
  }

  /**
   * Gets logs by level
   */
  private getLogs(level: string): CapturedLog[] {
    return this.logs.filter(log => log.level === level);
  }

  /**
   * Filters logs by regex pattern in message
   */
  filterByMessage(pattern: RegExp | string): CapturedLog[] {
    const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;
    return this.logs.filter(log => regex.test(log.message));
  }

  /**
   * Filters logs by level and regex pattern
   */
  filterByLevelAndMessage(level: string, pattern: RegExp | string): CapturedLog[] {
    const levelLogs = this.getLogs(level);
    const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;
    return levelLogs.filter(log => regex.test(log.message));
  }

  /**
   * Gets count of logs by level
   */
  getLogCount(level?: string): number {
    if (level) {
      return this.getLogs(level).length;
    }
    return this.logs.length;
  }

  /**
   * Gets the first log of a given level
   */
  getFirstLog(level?: string): CapturedLog | undefined {
    if (level) {
      return this.getLogs(level)[0];
    }
    return this.logs[0];
  }

  /**
   * Gets the last log of a given level
   */
  getLastLog(level?: string): CapturedLog | undefined {
    const logsToCheck = level ? this.getLogs(level) : this.logs;
    return logsToCheck[logsToCheck.length - 1];
  }

  /**
   * Clears all captured logs
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Resets the logger to initial state
   */
  reset(): void {
    this.clearLogs();
    this.currentLogLevel = LogLevel.INFO;
    this.logToStdout = false;
  }

  // Private helper

  private captureLog(level: string, message: string, args: any[]): void {
    const log: CapturedLog = {
      level,
      message,
      args: [...args],
      timestamp: new Date()
    };
    this.logs.push(log);

    // Also log to stdout if enabled
    if (this.logToStdout) {
      const argsStr =
        args.length > 0
          ? " " +
            args
              .map(arg => (typeof arg === "object" ? JSON.stringify(arg) : String(arg)))
              .join(" ")
          : "";
      console.log(`[${level}] ${message}${argsStr}`);
    }
  }
}
