import os from "node:os";
import path from "node:path";
import { logger } from "../utils/logger";
import { Timer, defaultTimer } from "../utils/SystemTimer";
import { RequestResponseSocketServer, getSocketPath, SocketServerConfig } from "./socketServer/index";
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

const SOCKET_CONFIG: SocketServerConfig = {
  defaultPath: path.join(os.homedir(), ".auto-mobile", "appearance.sock"),
  externalPath: "/tmp/auto-mobile-appearance.sock",
};

const VALID_MODES = new Set(["light", "dark", "auto"]);

/**
 * Socket server for appearance configuration.
 * Handles get_appearance_config, set_appearance_sync, and set_appearance commands.
 */
export class AppearanceSocketServer extends RequestResponseSocketServer<
  AppearanceSocketRequest,
  AppearanceSocketResponse
> {
  constructor(socketPath: string = getSocketPath(SOCKET_CONFIG), timer: Timer = defaultTimer) {
    super(socketPath, timer, "Appearance");
  }

  protected async handleRequest(
    request: AppearanceSocketRequest
  ): Promise<AppearanceSocketResponse> {
    const command = (request.command ?? request.method) as AppearanceSocketCommand | undefined;

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
  }

  protected createErrorResponse(id: string | undefined, error: string): AppearanceSocketResponse {
    return {
      id: id ?? "unknown",
      type: "appearance_response",
      success: false,
      error,
    };
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
          name: device.name,
          platform: device.platform,
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
