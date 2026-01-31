import os from "node:os";
import path from "node:path";
import { Timer, defaultTimer } from "../utils/SystemTimer";
import { RequestResponseSocketServer, getSocketPath, SocketServerConfig } from "./socketServer/index";
import {
  DeviceSnapshotSocketRequest,
  DeviceSnapshotSocketResponse,
} from "./deviceSnapshotSocketTypes";
import { getDeviceSnapshotConfig, updateDeviceSnapshotConfig } from "../server/deviceSnapshotManager";

const SOCKET_CONFIG: SocketServerConfig = {
  defaultPath: path.join(os.homedir(), ".auto-mobile", "device-snapshot.sock"),
  externalPath: "/tmp/auto-mobile-device-snapshot.sock",
};

/**
 * Socket server for device snapshot configuration.
 * Handles config/get and config/set requests.
 */
export class DeviceSnapshotSocketServer extends RequestResponseSocketServer<
  DeviceSnapshotSocketRequest,
  DeviceSnapshotSocketResponse
> {
  constructor(socketPath: string = getSocketPath(SOCKET_CONFIG), timer: Timer = defaultTimer) {
    super(socketPath, timer, "DeviceSnapshot");
  }

  protected async handleRequest(
    request: DeviceSnapshotSocketRequest
  ): Promise<DeviceSnapshotSocketResponse> {
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
  }

  protected createErrorResponse(id: string | undefined, error: string): DeviceSnapshotSocketResponse {
    return {
      id: id ?? "unknown",
      type: "device_snapshot_response",
      success: false,
      error,
    };
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
