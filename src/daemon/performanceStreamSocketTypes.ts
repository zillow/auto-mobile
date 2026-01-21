import type { PerformanceAuditHistoryEntry } from "../db/performanceAuditRepository";

export interface PerformanceStreamSocketRequest {
  command: "poll";
  sinceTimestamp?: string;
  sinceId?: number;
  startTime?: string;
  endTime?: string;
  limit?: number;
  deviceId?: string;
  sessionId?: string;
  packageName?: string;
}

export interface PerformanceStreamSocketResponse {
  success: boolean;
  results?: PerformanceAuditHistoryEntry[];
  lastTimestamp?: string;
  lastId?: number;
  error?: string;
}
