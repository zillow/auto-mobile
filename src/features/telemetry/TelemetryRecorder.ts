import { logger } from "../../utils/logger";
import { recordNetworkEvent, type RecordNetworkEventInput } from "../../db/networkEventRepository";
import { recordLogEvent, type RecordLogEventInput } from "../../db/logEventRepository";
import { recordCustomEvent, type RecordCustomEventInput } from "../../db/customEventRepository";
import { recordOsEvent, type RecordOsEventInput } from "../../db/osEventRepository";
import { getTelemetryPushServer } from "../../daemon/telemetryPushSocketServer";

export interface TelemetryEvent {
  category: "network" | "log" | "custom" | "os";
  timestamp: number;
  deviceId: string | null;
  data: unknown;
}

export interface TelemetryPushTarget {
  pushTelemetryEvent(event: TelemetryEvent): void;
}

export interface TelemetryRepository {
  recordNetworkEvent(input: RecordNetworkEventInput): Promise<void>;
  recordLogEvent(input: RecordLogEventInput): Promise<void>;
  recordCustomEvent(input: RecordCustomEventInput): Promise<void>;
  recordOsEvent(input: RecordOsEventInput): Promise<void>;
}

const defaultRepository: TelemetryRepository = {
  recordNetworkEvent: input => recordNetworkEvent(input),
  recordLogEvent: input => recordLogEvent(input),
  recordCustomEvent: input => recordCustomEvent(input),
  recordOsEvent: input => recordOsEvent(input),
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
  }): Promise<void> {
    const input: RecordNetworkEventInput = {
      deviceId: this.deviceId,
      sessionId: this.sessionId,
      ...event,
    };

    try {
      await this.repository.recordNetworkEvent(input);
    } catch (e) {
      logger.error(`[TelemetryRecorder] Failed to record network event: ${e}`);
    }

    this.pushToSocket({ category: "network", timestamp: event.timestamp, deviceId: this.deviceId, data: event });
  }

  async recordLogEvent(event: {
    timestamp: number;
    applicationId: string | null;
    level: number;
    tag: string;
    message: string;
    filterName: string;
  }): Promise<void> {
    const input: RecordLogEventInput = {
      deviceId: this.deviceId,
      sessionId: this.sessionId,
      ...event,
    };

    try {
      await this.repository.recordLogEvent(input);
    } catch (e) {
      logger.error(`[TelemetryRecorder] Failed to record log event: ${e}`);
    }

    this.pushToSocket({ category: "log", timestamp: event.timestamp, deviceId: this.deviceId, data: event });
  }

  async recordCustomEvent(event: {
    timestamp: number;
    applicationId: string | null;
    name: string;
    properties: Record<string, string>;
  }): Promise<void> {
    const input: RecordCustomEventInput = {
      deviceId: this.deviceId,
      sessionId: this.sessionId,
      ...event,
    };

    try {
      await this.repository.recordCustomEvent(input);
    } catch (e) {
      logger.error(`[TelemetryRecorder] Failed to record custom event: ${e}`);
    }

    this.pushToSocket({ category: "custom", timestamp: event.timestamp, deviceId: this.deviceId, data: event });
  }

  async recordOsEvent(event: {
    timestamp: number;
    applicationId: string | null;
    category: string;
    kind: string;
    details: Record<string, string> | null;
  }): Promise<void> {
    const input: RecordOsEventInput = {
      deviceId: this.deviceId,
      sessionId: this.sessionId,
      ...event,
    };

    try {
      await this.repository.recordOsEvent(input);
    } catch (e) {
      logger.error(`[TelemetryRecorder] Failed to record OS event: ${e}`);
    }

    this.pushToSocket({ category: "os", timestamp: event.timestamp, deviceId: this.deviceId, data: event });
  }

  private pushToSocket(event: TelemetryEvent): void {
    const server = this.getPushTarget();
    if (server) {
      server.pushTelemetryEvent(event);
    }
  }
}
