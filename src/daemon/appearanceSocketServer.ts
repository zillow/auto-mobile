import { createServer, Server as NetServer, Socket } from "node:net";
import { existsSync } from "node:fs";
import { unlink, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { logger } from "../utils/logger";
import {
  AppearanceSocketRequest,
  AppearanceSocketResponse,
  AppearanceSocketCommand,
} from "./appearanceSocketTypes";
import {
  getAppearanceConfig,
  resolveAppearanceMode,
  updateAppearanceConfig,
} from "../server/appearanceManager";
import { DeviceSessionManager } from "../utils/DeviceSessionManager";
import { applyAppearanceToDevice } from "../utils/deviceAppearance";
import { triggerAppearanceSync } from "../utils/appearance/AppearanceSyncScheduler";
import { DaemonState } from "./daemonState";
import type { AppearanceMode, BootedDevice } from "../models";

// Use /tmp for socket when running with external emulator (Docker container with mounted home)
// because Unix sockets don't work on Docker Desktop's mounted volumes
const isExternalMode = process.env.AUTOMOBILE_EMULATOR_EXTERNAL === "true";
const DEFAULT_SOCKET_PATH = isExternalMode
  ? "/tmp/auto-mobile-appearance.sock"
  : path.join(os.homedir(), ".auto-mobile", "appearance.sock");

const VALID_MODES = new Set(["light", "dark", "auto"]);

export class AppearanceSocketServer {
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
        logger.info(`Appearance socket listening on ${this.socketPath}`);
        resolve();
      });

      this.server!.on("error", error => {
        logger.error(`Appearance socket error: ${error}`);
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
            logger.error(`Appearance socket request error: ${error}`);
          });
      }
    });

    socket.on("error", error => {
      logger.error(`Appearance socket connection error: ${error}`);
    });
  }

  private async processLine(socket: Socket, line: string): Promise<void> {
    if (!line.trim()) {
      return;
    }

    try {
      const request = JSON.parse(line) as AppearanceSocketRequest;
      const response = await this.handleRequest(request);
      socket.write(JSON.stringify(response) + "\n");
    } catch (error) {
      logger.error(`Appearance socket request error: ${error}`);
      const errorResponse: AppearanceSocketResponse = {
        id: "unknown",
        type: "appearance_response",
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
      socket.write(JSON.stringify(errorResponse) + "\n");
    }
  }

  private async handleRequest(
    request: AppearanceSocketRequest
  ): Promise<AppearanceSocketResponse> {
    const command = (request.command ?? request.method) as AppearanceSocketCommand | undefined;
    try {
      switch (command) {
        case "get_appearance_config": {
          const config = await getAppearanceConfig();
          return {
            id: request.id,
            type: "appearance_response",
            success: true,
            result: { config },
          };
        }
        case "set_appearance_sync": {
          const enabled = request.params?.enabled ?? request.enabled;
          if (typeof enabled !== "boolean") {
            throw new Error("set_appearance_sync requires enabled boolean");
          }
          const config = await updateAppearanceConfig({ syncWithHost: enabled });
          const appliedMode = await this.applyToTargets(config);
          await triggerAppearanceSync();
          return {
            id: request.id,
            type: "appearance_response",
            success: true,
            result: {
              config,
              appliedMode: appliedMode ?? undefined,
            },
          };
        }
        case "set_appearance": {
          const mode = request.params?.mode ?? request.mode;
          if (!mode || !VALID_MODES.has(String(mode).toLowerCase())) {
            throw new Error("set_appearance requires mode: light | dark | auto");
          }
          const normalizedMode = String(mode).toLowerCase();
          const config = await updateAppearanceConfig({
            defaultMode: normalizedMode,
            syncWithHost: normalizedMode === "auto",
          });
          const appliedMode = await this.applyToTargets(config, normalizedMode);
          await triggerAppearanceSync();
          return {
            id: request.id,
            type: "appearance_response",
            success: true,
            result: {
              config,
              appliedMode: appliedMode ?? undefined,
            },
          };
        }
        default:
          throw new Error(`Unsupported appearance command: ${command}`);
      }
    } catch (error) {
      return {
        id: request.id ?? "unknown",
        type: "appearance_response",
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async applyToTargets(
    config: Awaited<ReturnType<typeof getAppearanceConfig>>,
    explicitMode?: string
  ): Promise<AppearanceMode | null> {
    const mode = explicitMode && explicitMode !== "auto"
      ? (explicitMode as AppearanceMode)
      : await resolveAppearanceMode(config);

    const targets = this.getTargets();
    if (targets.length === 0) {
      return null;
    }

    for (const device of targets) {
      try {
        await applyAppearanceToDevice(device, mode);
      } catch (error) {
        logger.warn(`[Appearance] Failed to apply appearance to ${device.deviceId}: ${error}`);
      }
    }

    return mode;
  }

  private getTargets(): BootedDevice[] {
    const daemonState = DaemonState.getInstance();
    const targets = new Map<string, BootedDevice>();

    if (daemonState.isInitialized()) {
      const pool = daemonState.getDevicePool();
      const pooledDevices = pool.getAllDevices();
      for (const device of pooledDevices) {
        targets.set(device.id, {
          deviceId: device.id,
          name: device.id,
          platform: "android",
        });
      }
    }

    const current = DeviceSessionManager.getInstance().getCurrentDevice();
    if (current) {
      targets.set(current.deviceId, current);
    }

    return Array.from(targets.values());
  }
}

let socketServer: AppearanceSocketServer | null = null;

export async function startAppearanceSocketServer(): Promise<void> {
  if (!socketServer) {
    socketServer = new AppearanceSocketServer();
  }
  if (!socketServer.isListening()) {
    await socketServer.start();
  }
}

export async function stopAppearanceSocketServer(): Promise<void> {
  if (!socketServer) {
    return;
  }
  await socketServer.close();
  socketServer = null;
}
