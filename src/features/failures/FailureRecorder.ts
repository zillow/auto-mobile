import { FailureAnalyticsRepository, RecordFailureInput } from "../../db/failureAnalyticsRepository";
import type {
  FailureSeverity,
  FailureType,
  StackTraceElement,
  AggregatedToolCallInfo,
} from "../../server/failuresResources";
import { logger } from "../../utils/logger";
import { Timer, defaultTimer } from "../../utils/SystemTimer";
import crypto from "node:crypto";
import type { FailureRecorderService } from "./interfaces/FailureRecorderService";
import { getFailuresPushServer, FailureNotificationPush } from "../../daemon/failuresPushSocketServer";

/**
 * Input for recording a tool failure
 */
export interface RecordToolFailureInput {
  toolName: string;
  errorCode?: string;
  errorMessage: string;
  durationMs?: number;
  toolArgs?: Record<string, unknown>;

  // Device context
  deviceId?: string;
  deviceModel: string;
  os: string;
  appVersion: string;
  sessionId: string;

  // Screen context
  currentScreen?: string;
  screensVisited?: string[];

  // Test context
  testName?: string;
  testExecutionId?: number;

  // Capture
  screenshotPath?: string;
  videoPath?: string;
}

/**
 * Input for recording a crash
 */
export interface RecordCrashInput {
  exceptionType: string;
  exceptionMessage: string;
  stackTrace: StackTraceElement[];

  // Device context
  deviceId?: string;
  deviceModel: string;
  os: string;
  appVersion: string;
  sessionId: string;

  // Screen context
  currentScreen?: string;
  screensVisited?: string[];

  // Test context
  testName?: string;
  testExecutionId?: number;

  // Capture
  screenshotPath?: string;
  videoPath?: string;
}

/**
 * Input for recording an ANR
 */
export interface RecordAnrInput {
  reason: string;
  stackTrace?: StackTraceElement[];
  durationMs?: number;

  // Device context
  deviceId?: string;
  deviceModel: string;
  os: string;
  appVersion: string;
  sessionId: string;

  // Screen context
  currentScreen?: string;
  screensVisited?: string[];

  // Test context
  testName?: string;
  testExecutionId?: number;

  // Capture
  screenshotPath?: string;
  videoPath?: string;
}

/**
 * Input for recording a non-fatal (handled) exception
 */
export interface RecordNonFatalInput {
  exceptionType: string;
  exceptionMessage: string;
  stackTrace: StackTraceElement[];
  customMessage?: string;

  // Device context
  deviceId?: string;
  deviceModel: string;
  os: string;
  appVersion: string;
  sessionId: string;

  // Screen context
  currentScreen?: string;
  screensVisited?: string[];

  // Test context
  testName?: string;
  testExecutionId?: number;

  // Capture
  screenshotPath?: string;
  videoPath?: string;
}

/**
 * FailureRecorder provides a high-level API for recording various types of failures.
 * It handles signature generation, severity calculation, and stores failures in the database.
 */
export class FailureRecorder implements FailureRecorderService {
  private repository: FailureAnalyticsRepository;
  private timer: Timer;
  private static instance: FailureRecorder | null = null;

  constructor(repository?: FailureAnalyticsRepository, timer: Timer = defaultTimer) {
    this.repository = repository ?? new FailureAnalyticsRepository();
    this.timer = timer;
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): FailureRecorder {
    if (!FailureRecorder.instance) {
      FailureRecorder.instance = new FailureRecorder();
    }
    return FailureRecorder.instance;
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static resetInstance(): void {
    FailureRecorder.instance = null;
  }

  /**
   * Create a new instance for testing with injected dependencies.
   */
  static createForTesting(repository?: FailureAnalyticsRepository): FailureRecorder {
    return new FailureRecorder(repository);
  }

  /**
   * Record a tool call failure
   */
  async recordToolFailure(input: RecordToolFailureInput): Promise<string> {
    const signature = this.generateToolFailureSignature(input.toolName, input.errorCode ?? "UNKNOWN");
    const severity = this.calculateToolFailureSeverity(input.errorCode);

    const toolCallInfo: AggregatedToolCallInfo = {
      toolName: input.toolName,
      errorCodes: input.errorCode ? { [input.errorCode]: 1 } : {},
      parameterVariants: this.extractParameterVariants(input.toolArgs),
      durationStats: input.durationMs
        ? {
          minMs: input.durationMs,
          maxMs: input.durationMs,
          avgMs: input.durationMs,
          medianMs: input.durationMs,
          p95Ms: input.durationMs,
        }
        : null,
    };

    const failureInput: RecordFailureInput = {
      type: "tool_failure",
      signature,
      title: `${input.toolName}: ${input.errorCode ?? "Failed"}`,
      message: input.errorMessage,
      severity,
      toolCallInfo,
      occurrence: {
        deviceId: input.deviceId,
        deviceModel: input.deviceModel,
        os: input.os,
        appVersion: input.appVersion,
        sessionId: input.sessionId,
        screenAtFailure: input.currentScreen,
        screensVisited: input.screensVisited,
        testName: input.testName,
        testExecutionId: input.testExecutionId,
        errorCode: input.errorCode,
        durationMs: input.durationMs,
        toolArgs: input.toolArgs,
      },
      capture: this.selectCapture(input.screenshotPath, input.videoPath),
    };

    try {
      const occurrenceId = await this.repository.recordFailure(failureInput);
      logger.debug(`[FailureRecorder] Recorded tool failure: ${input.toolName} (${occurrenceId})`);

      // Push notification to connected IDE plugins
      this.pushFailureNotification(
        occurrenceId,
        signature, // groupId is based on signature
        "tool_failure",
        severity,
        failureInput.title,
        input.errorMessage
      );

      return occurrenceId;
    } catch (error) {
      logger.error(`[FailureRecorder] Failed to record tool failure: ${error}`);
      throw error;
    }
  }

  /**
   * Record a crash (exception)
   */
  async recordCrash(input: RecordCrashInput): Promise<string> {
    const signature = this.generateCrashSignature(input.exceptionType, input.stackTrace);
    const severity = this.calculateCrashSeverity(input.exceptionType);
    const title = this.generateCrashTitle(input.exceptionType, input.stackTrace);

    const failureInput: RecordFailureInput = {
      type: "crash",
      signature,
      title,
      message: `${input.exceptionType}: ${input.exceptionMessage}`,
      severity,
      stackTrace: input.stackTrace,
      occurrence: {
        deviceId: input.deviceId,
        deviceModel: input.deviceModel,
        os: input.os,
        appVersion: input.appVersion,
        sessionId: input.sessionId,
        screenAtFailure: input.currentScreen,
        screensVisited: input.screensVisited,
        testName: input.testName,
        testExecutionId: input.testExecutionId,
      },
      capture: this.selectCapture(input.screenshotPath, input.videoPath),
    };

    try {
      const occurrenceId = await this.repository.recordFailure(failureInput);
      logger.debug(`[FailureRecorder] Recorded crash: ${title} (${occurrenceId})`);

      // Push notification to connected IDE plugins
      this.pushFailureNotification(
        occurrenceId,
        signature,
        "crash",
        severity,
        title,
        `${input.exceptionType}: ${input.exceptionMessage}`
      );

      return occurrenceId;
    } catch (error) {
      logger.error(`[FailureRecorder] Failed to record crash: ${error}`);
      throw error;
    }
  }

  /**
   * Record an ANR (Application Not Responding)
   */
  async recordAnr(input: RecordAnrInput): Promise<string> {
    const signature = this.generateAnrSignature(input.reason, input.stackTrace);
    const title = this.generateAnrTitle(input.reason, input.stackTrace);

    const failureInput: RecordFailureInput = {
      type: "anr",
      signature,
      title,
      message: input.reason,
      severity: "high", // ANRs are always high severity
      stackTrace: input.stackTrace,
      occurrence: {
        deviceId: input.deviceId,
        deviceModel: input.deviceModel,
        os: input.os,
        appVersion: input.appVersion,
        sessionId: input.sessionId,
        screenAtFailure: input.currentScreen,
        screensVisited: input.screensVisited,
        testName: input.testName,
        testExecutionId: input.testExecutionId,
        durationMs: input.durationMs,
      },
      capture: this.selectCapture(input.screenshotPath, input.videoPath),
    };

    try {
      const occurrenceId = await this.repository.recordFailure(failureInput);
      logger.debug(`[FailureRecorder] Recorded ANR: ${title} (${occurrenceId})`);

      // Push notification to connected IDE plugins
      this.pushFailureNotification(
        occurrenceId,
        signature,
        "anr",
        "high", // ANRs are always high severity
        title,
        input.reason
      );

      return occurrenceId;
    } catch (error) {
      logger.error(`[FailureRecorder] Failed to record ANR: ${error}`);
      throw error;
    }
  }

  /**
   * Record a non-fatal (handled) exception
   */
  async recordNonFatal(input: RecordNonFatalInput): Promise<string> {
    const signature = this.generateNonFatalSignature(input.exceptionType, input.stackTrace);
    const severity = this.calculateNonFatalSeverity(input.exceptionType);
    const title = this.generateNonFatalTitle(input.exceptionType, input.stackTrace);

    const failureInput: RecordFailureInput = {
      type: "nonfatal",
      signature,
      title,
      message: input.customMessage
        ? `${input.exceptionType}: ${input.exceptionMessage} - ${input.customMessage}`
        : `${input.exceptionType}: ${input.exceptionMessage}`,
      severity,
      stackTrace: input.stackTrace,
      occurrence: {
        deviceId: input.deviceId,
        deviceModel: input.deviceModel,
        os: input.os,
        appVersion: input.appVersion,
        sessionId: input.sessionId,
        screenAtFailure: input.currentScreen,
        screensVisited: input.screensVisited,
        testName: input.testName,
        testExecutionId: input.testExecutionId,
      },
      capture: this.selectCapture(input.screenshotPath, input.videoPath),
    };

    try {
      const occurrenceId = await this.repository.recordFailure(failureInput);
      logger.debug(`[FailureRecorder] Recorded non-fatal: ${title} (${occurrenceId})`);

      // Push notification to connected IDE plugins
      this.pushFailureNotification(
        occurrenceId,
        signature,
        "nonfatal",
        severity,
        title,
        failureInput.message
      );

      return occurrenceId;
    } catch (error) {
      logger.error(`[FailureRecorder] Failed to record non-fatal: ${error}`);
      throw error;
    }
  }

  // Private helper methods

  /**
   * Push a failure notification to connected IDE plugins
   */
  private pushFailureNotification(
    occurrenceId: string,
    groupId: string,
    type: FailureType,
    severity: FailureSeverity,
    title: string,
    message: string
  ): void {
    const server = getFailuresPushServer();
    if (server) {
      const notification: FailureNotificationPush = {
        occurrenceId,
        groupId,
        type,
        severity,
        title,
        message,
        timestamp: this.timer.now(),
      };
      logger.debug(`[FailureRecorder] Pushing failure notification: ${type} - ${title}`);
      server.pushFailure(notification);
    } else {
      logger.warn(`[FailureRecorder] Push server not available, cannot push failure notification: ${type} - ${title}`);
    }
  }

  private generateToolFailureSignature(toolName: string, errorCode: string): string {
    return `tool:${toolName}:${errorCode}`;
  }

  private generateCrashSignature(exceptionType: string, stackTrace: StackTraceElement[]): string {
    // Find the first app code frame for signature
    const appFrame = stackTrace.find(frame => frame.isAppCode);
    if (appFrame) {
      return `crash:${exceptionType}:${appFrame.className}.${appFrame.methodName}`;
    }
    // Fall back to just exception type
    return `crash:${exceptionType}`;
  }

  private generateAnrSignature(reason: string, stackTrace?: StackTraceElement[]): string {
    // Find the first app code frame for signature
    const appFrame = stackTrace?.find(frame => frame.isAppCode);
    if (appFrame) {
      return `anr:${appFrame.className}.${appFrame.methodName}`;
    }
    // Hash the reason for consistency
    const hash = crypto.createHash("md5").update(reason).digest("hex").substring(0, 8);
    return `anr:${hash}`;
  }

  private generateNonFatalSignature(exceptionType: string, stackTrace: StackTraceElement[]): string {
    // Find the first app code frame for signature
    const appFrame = stackTrace.find(frame => frame.isAppCode);
    if (appFrame) {
      return `nonfatal:${exceptionType}:${appFrame.className}.${appFrame.methodName}`;
    }
    // Fall back to just exception type
    return `nonfatal:${exceptionType}`;
  }

  private generateCrashTitle(exceptionType: string, stackTrace: StackTraceElement[]): string {
    const appFrame = stackTrace.find(frame => frame.isAppCode);
    if (appFrame) {
      const fileName = appFrame.fileName ?? appFrame.className.split(".").pop();
      const line = appFrame.lineNumber ? `:${appFrame.lineNumber}` : "";
      return `${exceptionType} in ${appFrame.methodName} (${fileName}${line})`;
    }
    return `${exceptionType}`;
  }

  private generateAnrTitle(reason: string, stackTrace?: StackTraceElement[]): string {
    const appFrame = stackTrace?.find(frame => frame.isAppCode);
    if (appFrame) {
      return `ANR: ${appFrame.className.split(".").pop()}.${appFrame.methodName}`;
    }
    // Truncate reason for title
    const truncatedReason = reason.length > 50 ? reason.substring(0, 50) + "..." : reason;
    return `ANR: ${truncatedReason}`;
  }

  private generateNonFatalTitle(exceptionType: string, stackTrace: StackTraceElement[]): string {
    const appFrame = stackTrace.find(frame => frame.isAppCode);
    if (appFrame) {
      const fileName = appFrame.fileName ?? appFrame.className.split(".").pop();
      const line = appFrame.lineNumber ? `:${appFrame.lineNumber}` : "";
      return `${exceptionType} in ${appFrame.methodName} (${fileName}${line})`;
    }
    return `${exceptionType}`;
  }

  private calculateToolFailureSeverity(errorCode?: string): FailureSeverity {
    if (!errorCode) {return "medium";}

    // Critical errors
    if (errorCode.includes("CRASH") || errorCode.includes("FATAL")) {
      return "critical";
    }

    // High severity errors
    if (
      errorCode.includes("TIMEOUT") ||
      errorCode.includes("CONNECTION") ||
      errorCode.includes("NOT_FOUND")
    ) {
      return "high";
    }

    // Low severity errors
    if (errorCode.includes("SKIPPED") || errorCode.includes("IGNORED")) {
      return "low";
    }

    return "medium";
  }

  private calculateCrashSeverity(exceptionType: string): FailureSeverity {
    // Critical crashes
    if (
      exceptionType.includes("OutOfMemory") ||
      exceptionType.includes("StackOverflow") ||
      exceptionType.includes("Fatal")
    ) {
      return "critical";
    }

    // High severity crashes
    if (
      exceptionType.includes("NullPointer") ||
      exceptionType.includes("IllegalState") ||
      exceptionType.includes("SecurityException")
    ) {
      return "high";
    }

    // Low severity crashes (usually recoverable)
    if (
      exceptionType.includes("NumberFormat") ||
      exceptionType.includes("ParseException")
    ) {
      return "low";
    }

    return "medium";
  }

  private calculateNonFatalSeverity(exceptionType: string): FailureSeverity {
    // Non-fatal errors are generally lower severity since they're handled
    // Medium severity for potentially serious errors that were handled
    if (
      exceptionType.includes("SecurityException") ||
      exceptionType.includes("IllegalState") ||
      exceptionType.includes("NullPointer")
    ) {
      return "medium";
    }

    // Most non-fatal errors are low severity
    return "low";
  }

  private extractParameterVariants(
    toolArgs?: Record<string, unknown>
  ): Record<string, string[]> {
    if (!toolArgs) {return {};}

    const variants: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(toolArgs)) {
      if (value !== undefined && value !== null) {
        const stringValue = typeof value === "string" ? value : JSON.stringify(value);
        variants[key] = [stringValue];
      }
    }
    return variants;
  }

  private selectCapture(
    screenshotPath?: string,
    videoPath?: string
  ): RecordFailureInput["capture"] | undefined {
    // Prefer video over screenshot
    if (videoPath) {
      return { type: "video", path: videoPath };
    }
    if (screenshotPath) {
      return { type: "screenshot", path: screenshotPath };
    }
    return undefined;
  }
}

/**
 * Default singleton instance of FailureRecorder.
 * Use this for production code. For testing, use FailureRecorder.createForTesting().
 */
export const defaultFailureRecorder: FailureRecorderService = FailureRecorder.getInstance();

// Export singleton instance getter (uses defaultFailureRecorder)
export const getFailureRecorder = (): FailureRecorderService => defaultFailureRecorder;
