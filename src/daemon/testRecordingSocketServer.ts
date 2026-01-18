import { createServer, Server as NetServer, Socket } from "node:net";
import { existsSync } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DeviceSessionManager } from "../utils/DeviceSessionManager";
import { logger } from "../utils/logger";
import type { BootedDevice, Platform, SomePlatform } from "../models";
import {
  getTestRecordingStatus,
  startTestRecording,
  stopTestRecording,
} from "../server/testRecordingManager";
import {
  TestRecordingCommand,
  TestRecordingResponse,
} from "./testRecordingSocketTypes";

// Use /tmp for socket when running with external emulator (Docker container with mounted home)
// because Unix sockets don't work on Docker Desktop's mounted volumes
const isExternalMode = process.env.AUTOMOBILE_EMULATOR_EXTERNAL === "true";
const DEFAULT_SOCKET_PATH = isExternalMode
  ? "/tmp/auto-mobile-test-recording.sock"
  : path.join(os.homedir(), ".auto-mobile", "test-recording.sock");

const resolveDevice = async (
  deviceId?: string,
  platform?: Platform
): Promise<BootedDevice> => {
  const deviceSessionManager = DeviceSessionManager.getInstance();

  let resolvedPlatform: SomePlatform = platform ?? "either";
  if (deviceId && !platform) {
    const connectedDevices = await deviceSessionManager.detectConnectedPlatforms();
    const match = connectedDevices.find(device => device.deviceId === deviceId);
    if (!match) {
      throw new Error(`Device ${deviceId} not found among connected devices.`);
    }
    resolvedPlatform = match.platform;
  }

  return deviceSessionManager.ensureDeviceReady(resolvedPlatform, deviceId);
};

const ensurePlatform = (value: unknown): Platform | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value === "android" || value === "ios") {
    return value;
  }

  throw new Error(`Unsupported platform value: ${String(value)}`);
};

export class TestRecordingSocketServer {
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
        logger.info(`Test recording socket listening on ${this.socketPath}`);
        resolve();
      });

      this.server!.on("error", error => {
        logger.error(`Test recording socket error: ${error}`);
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
            logger.error(`Test recording socket request error: ${error}`);
          });
      }
    });

    socket.on("error", error => {
      logger.error(`Test recording socket connection error: ${error}`);
    });
  }

  private async processLine(socket: Socket, line: string): Promise<void> {
    if (!line.trim()) {
      return;
    }

    try {
      const request = JSON.parse(line) as TestRecordingCommand;
      const response = await this.handleRequest(request);
      socket.write(JSON.stringify(response) + "\n");
    } catch (error) {
      logger.error(`Test recording socket request error: ${error}`);
      const errorResponse: TestRecordingResponse = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
      socket.write(JSON.stringify(errorResponse) + "\n");
    }
  }

  private async handleRequest(
    request: TestRecordingCommand
  ): Promise<TestRecordingResponse> {
    try {
      const command = request?.command;
      if (!command) {
        throw new Error("Request missing command field.");
      }

      switch (command) {
        case "start": {
          const platform = ensurePlatform(request.platform);
          const device = await resolveDevice(request.deviceId, platform);
          const result = await startTestRecording(device);
          return {
            success: true,
            recordingId: result.recordingId,
            startedAt: result.startedAt,
            deviceId: result.deviceId,
            platform: result.platform,
          };
        }
        case "stop": {
          const result = await stopTestRecording(request.recordingId, request.planName);
          return {
            success: true,
            recordingId: result.recordingId,
            startedAt: result.startedAt,
            stoppedAt: result.stoppedAt,
            deviceId: result.deviceId,
            platform: result.platform,
            planName: result.planName,
            planContent: result.planContent,
            stepCount: result.stepCount,
            durationMs: result.durationMs,
          };
        }
        case "status": {
          const recording = getTestRecordingStatus();
          if (!recording) {
            return { success: true };
          }
          return { success: true, recording };
        }
        default:
          throw new Error(`Unsupported test recording command: ${String(command)}`);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

let socketServer: TestRecordingSocketServer | null = null;

export async function startTestRecordingSocketServer(): Promise<void> {
  if (!socketServer) {
    socketServer = new TestRecordingSocketServer();
  }
  if (!socketServer.isListening()) {
    await socketServer.start();
  }
}

export async function stopTestRecordingSocketServer(): Promise<void> {
  if (!socketServer) {
    return;
  }
  await socketServer.close();
  socketServer = null;
}
