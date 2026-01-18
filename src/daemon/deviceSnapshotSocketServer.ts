import { createServer, Server as NetServer, Socket } from "node:net";
import { existsSync } from "node:fs";
import { unlink, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { logger } from "../utils/logger";
import {
  DeviceSnapshotSocketRequest,
  DeviceSnapshotSocketResponse,
} from "./deviceSnapshotSocketTypes";
import { getDeviceSnapshotConfig, updateDeviceSnapshotConfig } from "../server/deviceSnapshotManager";

// Use /tmp for socket when running with external emulator (Docker container with mounted home)
// because Unix sockets don't work on Docker Desktop's mounted volumes
const isExternalMode = process.env.AUTOMOBILE_EMULATOR_EXTERNAL === "true";
const DEFAULT_SOCKET_PATH = isExternalMode
  ? "/tmp/auto-mobile-device-snapshot.sock"
  : path.join(os.homedir(), ".auto-mobile", "device-snapshot.sock");

export class DeviceSnapshotSocketServer {
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
        logger.info(`Device snapshot socket listening on ${this.socketPath}`);
        resolve();
      });

      this.server!.on("error", error => {
        logger.error(`Device snapshot socket error: ${error}`);
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
            logger.error(`Device snapshot socket request error: ${error}`);
          });
      }
    });

    socket.on("error", error => {
      logger.error(`Device snapshot socket connection error: ${error}`);
    });
  }

  private async processLine(socket: Socket, line: string): Promise<void> {
    if (!line.trim()) {
      return;
    }

    try {
      const request = JSON.parse(line) as DeviceSnapshotSocketRequest;
      const response = await this.handleRequest(request);
      socket.write(JSON.stringify(response) + "\n");
    } catch (error) {
      logger.error(`Device snapshot socket request error: ${error}`);
      const errorResponse: DeviceSnapshotSocketResponse = {
        id: "unknown",
        type: "device_snapshot_response",
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
      socket.write(JSON.stringify(errorResponse) + "\n");
    }
  }

  private async handleRequest(
    request: DeviceSnapshotSocketRequest
  ): Promise<DeviceSnapshotSocketResponse> {
    try {
      switch (request.method) {
        case "config/get": {
          const config = await getDeviceSnapshotConfig();
          return {
            id: request.id,
            type: "device_snapshot_response",
            success: true,
            result: { config },
          };
        }
        case "config/set": {
          if (!request.params || !("config" in request.params)) {
            throw new Error("config/set requires params.config");
          }
          const update = request.params.config ?? null;
          const { config, evictedSnapshotNames } = await updateDeviceSnapshotConfig(update);
          return {
            id: request.id,
            type: "device_snapshot_response",
            success: true,
            result: {
              config,
              evictedSnapshotNames: evictedSnapshotNames.length > 0
                ? evictedSnapshotNames
                : undefined,
            },
          };
        }
        default:
          throw new Error(`Unsupported device snapshot method: ${request.method}`);
      }
    } catch (error) {
      return {
        id: request.id,
        type: "device_snapshot_response",
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

let socketServer: DeviceSnapshotSocketServer | null = null;

export async function startDeviceSnapshotSocketServer(): Promise<void> {
  if (!socketServer) {
    socketServer = new DeviceSnapshotSocketServer();
  }
  if (!socketServer.isListening()) {
    await socketServer.start();
  }
}

export async function stopDeviceSnapshotSocketServer(): Promise<void> {
  if (!socketServer) {
    return;
  }
  await socketServer.close();
  socketServer = null;
}
