import { createServer, Server as NetServer, Socket } from "node:net";
import { existsSync } from "node:fs";
import { unlink, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { logger } from "../utils/logger";
import {
  VideoRecordingSocketRequest,
  VideoRecordingSocketResponse,
} from "./videoRecordingSocketTypes";
import { getVideoRecordingConfig, updateVideoRecordingConfig } from "../server/videoRecordingManager";

const DEFAULT_SOCKET_PATH = path.join(
  os.homedir(),
  ".auto-mobile",
  "video-recording.sock"
);

export class VideoRecordingSocketServer {
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
        logger.info(`Video recording socket listening on ${this.socketPath}`);
        resolve();
      });

      this.server!.on("error", error => {
        logger.error(`Video recording socket error: ${error}`);
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
            logger.error(`Video recording socket request error: ${error}`);
          });
      }
    });

    socket.on("error", error => {
      logger.error(`Video recording socket connection error: ${error}`);
    });
  }

  private async processLine(socket: Socket, line: string): Promise<void> {
    if (!line.trim()) {
      return;
    }

    try {
      const request = JSON.parse(line) as VideoRecordingSocketRequest;
      const response = await this.handleRequest(request);
      socket.write(JSON.stringify(response) + "\n");
    } catch (error) {
      logger.error(`Video recording socket request error: ${error}`);
      const errorResponse: VideoRecordingSocketResponse = {
        id: "unknown",
        type: "video_recording_response",
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
      socket.write(JSON.stringify(errorResponse) + "\n");
    }
  }

  private async handleRequest(
    request: VideoRecordingSocketRequest
  ): Promise<VideoRecordingSocketResponse> {
    try {
      switch (request.method) {
        case "config/get": {
          const config = await getVideoRecordingConfig();
          return {
            id: request.id,
            type: "video_recording_response",
            success: true,
            result: { config },
          };
        }
        case "config/set": {
          if (!request.params || !("config" in request.params)) {
            throw new Error("config/set requires params.config");
          }
          const update = request.params.config ?? null;
          const { config, evictedRecordingIds } = await updateVideoRecordingConfig(update);
          return {
            id: request.id,
            type: "video_recording_response",
            success: true,
            result: {
              config,
              evictedRecordingIds: evictedRecordingIds.length > 0 ? evictedRecordingIds : undefined,
            },
          };
        }
        default:
          throw new Error(`Unsupported video recording method: ${request.method}`);
      }
    } catch (error) {
      return {
        id: request.id,
        type: "video_recording_response",
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

let socketServer: VideoRecordingSocketServer | null = null;

export async function startVideoRecordingSocketServer(): Promise<void> {
  if (!socketServer) {
    socketServer = new VideoRecordingSocketServer();
  }
  if (!socketServer.isListening()) {
    await socketServer.start();
  }
}

export async function stopVideoRecordingSocketServer(): Promise<void> {
  if (!socketServer) {
    return;
  }
  await socketServer.close();
  socketServer = null;
}
