import os from "node:os";
import path from "node:path";
import { Timer, defaultTimer } from "../utils/SystemTimer";
import { RequestResponseSocketServer, getSocketPath, SocketServerConfig } from "./socketServer/index";
import { PerformanceAuditRepository } from "../db/performanceAuditRepository";
import {
  PerformanceStreamSocketRequest,
  PerformanceStreamSocketResponse,
} from "./performanceStreamSocketTypes";

const SOCKET_CONFIG: SocketServerConfig = {
  defaultPath: path.join(os.homedir(), ".auto-mobile", "performance-stream.sock"),
  externalPath: "/tmp/auto-mobile-performance-stream.sock",
};

const DEFAULT_LIMIT = 200;
const auditRepository = new PerformanceAuditRepository();

const normalizeTimestamp = (value: unknown, label: string): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error(`Invalid ${label}: ${String(value)}`);
  }
  const raw = typeof value === "string" ? value.trim() : value;
  if (raw === "") {
    return undefined;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${label}: ${String(value)}`);
  }
  return date.toISOString();
};

const normalizeLimit = (value: unknown): number => {
  if (value === undefined || value === null) {
    return DEFAULT_LIMIT;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid limit: ${String(value)}`);
  }
  return parsed;
};

const normalizeSinceId = (value: unknown): number | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid sinceId: ${String(value)}`);
  }
  return parsed;
};

/**
 * Socket server for performance stream polling.
 * Handles poll command to retrieve performance audit results.
 */
export class PerformanceStreamSocketServer extends RequestResponseSocketServer<
  PerformanceStreamSocketRequest,
  PerformanceStreamSocketResponse
> {
  constructor(socketPath: string = getSocketPath(SOCKET_CONFIG), timer: Timer = defaultTimer) {
    super(socketPath, timer, "PerformanceStream");
  }

  protected async handleRequest(
    request: PerformanceStreamSocketRequest
  ): Promise<PerformanceStreamSocketResponse> {
    if (request.command !== "poll") {
      throw new Error(`Unsupported performance stream command: ${String(request.command)}`);
    }

    const startTime = normalizeTimestamp(request.startTime, "startTime");
    const endTime = normalizeTimestamp(request.endTime, "endTime");
    const sinceTimestamp = normalizeTimestamp(request.sinceTimestamp, "sinceTimestamp");
    const sinceId = normalizeSinceId(request.sinceId);
    const limit = normalizeLimit(request.limit);

    const results = await auditRepository.listResultsSince({
      startTime,
      endTime,
      limit,
      deviceId: request.deviceId?.trim() || undefined,
      sessionId: request.sessionId?.trim() || undefined,
      packageName: request.packageName?.trim() || undefined,
      sinceTimestamp,
      sinceId,
    });

    const last = results.length > 0 ? results[results.length - 1] : undefined;

    return {
      success: true,
      results,
      lastTimestamp: last?.timestamp ?? sinceTimestamp,
      lastId: last?.id ?? sinceId,
    };
  }

  protected createErrorResponse(_id: string | undefined, error: string): PerformanceStreamSocketResponse {
    return {
      success: false,
      error,
    };
  }
}

let socketServer: PerformanceStreamSocketServer | null = null;

export async function startPerformanceStreamSocketServer(): Promise<void> {
  if (!socketServer) {
    socketServer = new PerformanceStreamSocketServer();
  }
  if (!socketServer.isListening()) {
    await socketServer.start();
  }
}

export async function stopPerformanceStreamSocketServer(): Promise<void> {
  if (!socketServer) {
    return;
  }
  await socketServer.close();
  socketServer = null;
}
