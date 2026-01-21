import { createServer, Server as NetServer, Socket } from "node:net";
import { existsSync } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { logger } from "../utils/logger";
import { PerformanceAuditRepository } from "../db/performanceAuditRepository";
import {
  PerformanceStreamSocketRequest,
  PerformanceStreamSocketResponse,
} from "./performanceStreamSocketTypes";

const DEFAULT_LIMIT = 200;

// Use /tmp for socket when running with external emulator (Docker container with mounted home)
// because Unix sockets don't work on Docker Desktop's mounted volumes
const isExternalMode = process.env.AUTOMOBILE_EMULATOR_EXTERNAL === "true";
const DEFAULT_SOCKET_PATH = isExternalMode
  ? "/tmp/auto-mobile-performance-stream.sock"
  : path.join(os.homedir(), ".auto-mobile", "performance-stream.sock");

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

export class PerformanceStreamSocketServer {
  private server: NetServer | null = null;
  private socketPath: string;

  constructor(socketPath: string = DEFAULT_SOCKET_PATH) {
    this.socketPath = socketPath;
  }

  async start(): Promise<void> {
    const directory = path.dirname(this.socketPath);
    if (!existsSync(directory)) {
      await mkdir(directory, { recursive: true });
    }

    if (existsSync(this.socketPath)) {
      await unlink(this.socketPath);
    }

    this.server = createServer(socket => {
      this.handleConnection(socket);
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(this.socketPath, () => {
        logger.info(`Performance stream socket listening on ${this.socketPath}`);
        resolve();
      });

      this.server!.on("error", error => {
        logger.error(`Performance stream socket error: ${error}`);
        reject(error);
      });
    });
  }

  async close(): Promise<void> {
    if (!this.server) {
      return;
    }

    await new Promise<void>(resolve => {
      this.server!.close(() => resolve());
    });
    this.server = null;

    if (existsSync(this.socketPath)) {
      await unlink(this.socketPath);
    }
  }

  isListening(): boolean {
    return this.server?.listening ?? false;
  }

  private handleConnection(socket: Socket): void {
    let buffer = "";
    let pending = Promise.resolve();

    socket.on("data", data => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        pending = pending
          .then(() => this.processLine(socket, line))
          .catch(error => {
            logger.error(`Performance stream socket request error: ${error}`);
          });
      }
    });

    socket.on("error", error => {
      logger.error(`Performance stream socket connection error: ${error}`);
    });
  }

  private async processLine(socket: Socket, line: string): Promise<void> {
    if (!line.trim()) {
      return;
    }

    try {
      const request = JSON.parse(line) as PerformanceStreamSocketRequest;
      const response = await this.handleRequest(request);
      socket.write(JSON.stringify(response) + "\n");
    } catch (error) {
      logger.error(`Performance stream socket request error: ${error}`);
      const errorResponse: PerformanceStreamSocketResponse = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
      socket.write(JSON.stringify(errorResponse) + "\n");
    }
  }

  private async handleRequest(
    request: PerformanceStreamSocketRequest
  ): Promise<PerformanceStreamSocketResponse> {
    try {
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
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
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
