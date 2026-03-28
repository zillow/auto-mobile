import { logger } from "../../utils/logger";
import { recordNetworkEvent, type RecordNetworkEventInput } from "../../db/networkEventRepository";
import { NetworkState } from "../../server/NetworkState";
import { recordLogEvent, type RecordLogEventInput } from "../../db/logEventRepository";
import { recordCustomEvent, type RecordCustomEventInput } from "../../db/customEventRepository";
import { recordOsEvent, type RecordOsEventInput } from "../../db/osEventRepository";
import { recordNavigationEvent, type RecordNavigationEventInput } from "../../db/navigationEventRepository";
import { recordStorageEvent, type RecordStorageEventInput } from "../../db/storageEventRepository";
import { recordLayoutEvent, type RecordLayoutEventInput } from "../../db/layoutEventRepository";
import { getTelemetryPushServer } from "../../daemon/telemetryPushSocketServer";

export type TelemetryCategory =
  | "network" | "log" | "custom" | "os" | "navigation"
  | "crash" | "anr" | "nonfatal" | "storage" | "layout"
  | "performance" | "toolcall";

export interface TelemetryEvent {
  category: TelemetryCategory;
  timestamp: number;
  deviceId: string | null;
  data: unknown;
}

export interface TelemetryPushTarget {
  pushTelemetryEvent(event: TelemetryEvent): void;
}

export interface TelemetryRepository {
  recordNetworkEvent(input: RecordNetworkEventInput): Promise<number>;
  recordLogEvent(input: RecordLogEventInput): Promise<void>;
  recordCustomEvent(input: RecordCustomEventInput): Promise<void>;
  recordOsEvent(input: RecordOsEventInput): Promise<void>;
  recordNavigationEvent(input: RecordNavigationEventInput): Promise<void>;
  recordStorageEvent(input: RecordStorageEventInput): Promise<void>;
  recordLayoutEvent(input: RecordLayoutEventInput): Promise<void>;
}

const defaultRepository: TelemetryRepository = {
  recordNetworkEvent: input => recordNetworkEvent(input),
  recordLogEvent: input => recordLogEvent(input),
  recordCustomEvent: input => recordCustomEvent(input),
  recordOsEvent: input => recordOsEvent(input),
  recordNavigationEvent: input => recordNavigationEvent(input),
  recordStorageEvent: input => recordStorageEvent(input),
  recordLayoutEvent: input => recordLayoutEvent(input),
};

export class TelemetryRecorder {
  private static instance: TelemetryRecorder | null = null;
  private deviceId: string | null = null;
  private sessionId: string | null = null;
  private readonly repository: TelemetryRepository;
  private readonly getPushTarget: () => TelemetryPushTarget | null;

  constructor(
    repository: TelemetryRepository = defaultRepository,
    getPushTarget: () => TelemetryPushTarget | null = () => getTelemetryPushServer(),
  ) {
    this.repository = repository;
    this.getPushTarget = getPushTarget;
  }

  static getInstance(): TelemetryRecorder {
    if (!TelemetryRecorder.instance) {
      TelemetryRecorder.instance = new TelemetryRecorder();
    }
    return TelemetryRecorder.instance;
  }

  /** Reset the singleton (for testing only). */
  static resetInstance(): void {
    TelemetryRecorder.instance = null;
  }

  setContext(deviceId: string | null, sessionId: string | null): void {
    this.deviceId = deviceId;
    this.sessionId = sessionId;
  }

  getContext(): { deviceId: string | null; sessionId: string | null } {
    return { deviceId: this.deviceId, sessionId: this.sessionId };
  }

  async recordNetworkEvent(event: {
    timestamp: number;
    applicationId: string | null;
    url: string;
    method: string;
    statusCode: number;
    durationMs: number;
    requestBodySize: number;
    responseBodySize: number;
    protocol: string | null;
    host: string | null;
    path: string | null;
    error: string | null;
    requestHeaders?: Record<string, string> | null;
    responseHeaders?: Record<string, string> | null;
    requestBody?: string | null;
    responseBody?: string | null;
    contentType?: string | null;
  }): Promise<void> {
    // Snapshot context before async work to avoid race with concurrent setContext() calls
    const { deviceId, sessionId } = this.snapshotContext();
    const input: RecordNetworkEventInput = { deviceId, sessionId, ...event };

    this.pushToSocket({ category: "network", timestamp: event.timestamp, deviceId, data: event });

    // Only persist and notify when capture is enabled
    if (!NetworkState.getInstance().capturing) {
      return;
    }

    let recordId: number | null = null;
    try {
      recordId = await this.repository.recordNetworkEvent(input);
    } catch (e) {
      logger.error(`[TelemetryRecorder] Failed to record network event: ${e}`);
    }

    // Notify NetworkState for resource subscription dispatch (only if we got the DB id)
    if (recordId !== null) {
      NetworkState.getInstance().onNetworkEvent({
        id: recordId,
        timestamp: event.timestamp,
        method: event.method,
        url: event.url,
        host: event.host,
        path: event.path,
        statusCode: event.statusCode,
        durationMs: event.durationMs,
        contentType: event.contentType ?? null,
        error: event.error,
      });
    }
  }

  async recordLogEvent(event: {
    timestamp: number;
    applicationId: string | null;
    level: number;
    tag: string;
    message: string;
    filterName: string;
  }): Promise<void> {
    const { deviceId, sessionId } = this.snapshotContext();
    const input: RecordLogEventInput = { deviceId, sessionId, ...event };

    try {
      await this.repository.recordLogEvent(input);
    } catch (e) {
      logger.error(`[TelemetryRecorder] Failed to record log event: ${e}`);
    }

    this.pushToSocket({ category: "log", timestamp: event.timestamp, deviceId, data: event });
  }

  async recordCustomEvent(event: {
    timestamp: number;
    applicationId: string | null;
    name: string;
    properties: Record<string, string>;
  }): Promise<void> {
    const { deviceId, sessionId } = this.snapshotContext();
    const input: RecordCustomEventInput = { deviceId, sessionId, ...event };

    try {
      await this.repository.recordCustomEvent(input);
    } catch (e) {
      logger.error(`[TelemetryRecorder] Failed to record custom event: ${e}`);
    }

    this.pushToSocket({ category: "custom", timestamp: event.timestamp, deviceId, data: event });
  }

  async recordOsEvent(event: {
    timestamp: number;
    applicationId: string | null;
    category: string;
    kind: string;
    details: Record<string, string> | null;
  }): Promise<void> {
    const { deviceId, sessionId } = this.snapshotContext();
    const input: RecordOsEventInput = { deviceId, sessionId, ...event };

    try {
      await this.repository.recordOsEvent(input);
    } catch (e) {
      logger.error(`[TelemetryRecorder] Failed to record OS event: ${e}`);
    }

    this.pushToSocket({ category: "os", timestamp: event.timestamp, deviceId, data: event });
  }

  async recordNavigationEvent(event: {
    timestamp: number;
    applicationId: string | null;
    destination: string;
    source: string | null;
    arguments: Record<string, string> | null;
    metadata: Record<string, string> | null;
    triggeringInteraction?: { type: string; elementText?: string; elementResourceId?: string } | null;
    screenshotUri?: string | null;
  }): Promise<void> {
    const { deviceId, sessionId } = this.snapshotContext();
    const input: RecordNavigationEventInput = { deviceId, sessionId, ...event };

    try {
      await this.repository.recordNavigationEvent(input);
    } catch (e) {
      logger.error(`[TelemetryRecorder] Failed to record navigation event: ${e}`);
    }

    this.pushToSocket({ category: "navigation", timestamp: event.timestamp, deviceId, data: event });
  }

  /**
   * Record a failure (crash/anr/nonfatal) as a telemetry event.
   * No separate DB write — failures are already stored in failure_occurrences.
   */
  recordFailureTelemetry(event: {
    type: "crash" | "anr" | "nonfatal";
    occurrenceId: string;
    groupId: string;
    severity: string;
    title: string;
    exceptionType?: string;
    screen?: string | null;
    timestamp: number;
    stackTrace?: Array<{ className: string; methodName: string; fileName: string | null; lineNumber: number | null; isAppCode: boolean }> | null;
  }): void {
    const { deviceId } = this.snapshotContext();
    this.pushToSocket({
      category: event.type,
      timestamp: event.timestamp,
      deviceId,
      data: event,
    });
  }

  async recordStorageEvent(event: {
    timestamp: number;
    applicationId: string | null;
    fileName: string;
    key: string | null;
    value: string | null;
    valueType: string | null;
    changeType: string;
  }): Promise<void> {
    const { deviceId, sessionId } = this.snapshotContext();
    const input: RecordStorageEventInput = { deviceId, sessionId, ...event };

    try {
      await this.repository.recordStorageEvent(input);
    } catch (e) {
      logger.error(`[TelemetryRecorder] Failed to record storage event: ${e}`);
    }

    this.pushToSocket({ category: "storage", timestamp: event.timestamp, deviceId, data: event });
  }

  async recordLayoutEvent(event: {
    timestamp: number;
    applicationId: string | null;
    subType: string;
    composableName: string | null;
    composableId: string | null;
    recompositionCount: number | null;
    durationMs: number | null;
    likelyCause: string | null;
    detailsJson: string | null;
    screenName?: string | null;
  }): Promise<void> {
    const { deviceId, sessionId } = this.snapshotContext();
    const input: RecordLayoutEventInput = { deviceId, sessionId, ...event };

    try {
      await this.repository.recordLayoutEvent(input);
    } catch (e) {
      logger.error(`[TelemetryRecorder] Failed to record layout event: ${e}`);
    }

    this.pushToSocket({ category: "layout", timestamp: event.timestamp, deviceId, data: event });
  }

  /**
   * Record a performance metric change as a telemetry event.
   * Emitted when metrics cross health thresholds (healthy→warning→critical).
   * Push-only — no separate DB write (performance data is already stored in performance_audit_results).
   */
  recordPerformanceEvent(event: {
    timestamp: number;
    packageName: string | null;
    fps: number | null;
    frameTimeMs: number | null;
    jankFrames: number | null;
    touchLatencyMs: number | null;
    memoryUsageMb: number | null;
    cpuUsagePercent: number | null;
    health: string;
    changedMetrics: string[];
  }): void {
    const { deviceId } = this.snapshotContext();
    this.pushToSocket({
      category: "performance",
      timestamp: event.timestamp,
      deviceId,
      data: event,
    });
  }

  /** Record a tool call execution with timing and status. */
  recordToolCallEvent(event: {
    timestamp: number;
    toolName: string;
    durationMs: number;
    success: boolean;
    error?: string | null;
    args?: Record<string, unknown> | null;
  }): void {
    const { deviceId } = this.snapshotContext();
    this.pushToSocket({ category: "toolcall", timestamp: event.timestamp, deviceId, data: event });
  }


  private snapshotContext(): { deviceId: string | null; sessionId: string | null } {
    return { deviceId: this.deviceId, sessionId: this.sessionId };
  }

  private pushToSocket(event: TelemetryEvent): void {
    const server = this.getPushTarget();
    if (server) {
      server.pushTelemetryEvent(event);
    }
  }
}
