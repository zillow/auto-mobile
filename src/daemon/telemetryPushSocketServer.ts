import os from "node:os";
import path from "node:path";
import { logger } from "../utils/logger";
import { Timer, defaultTimer } from "../utils/SystemTimer";
import { PushSubscriptionSocketServer, getSocketPath, SocketServerConfig } from "./socketServer/index";
import type { TelemetryEvent } from "../features/telemetry/TelemetryRecorder";

const SOCKET_CONFIG: SocketServerConfig = {
  defaultPath: path.join(os.homedir(), ".auto-mobile", "telemetry-push.sock"),
  externalPath: "/tmp/auto-mobile-telemetry-push.sock",
};

interface TelemetryFilter {
  category: string | null; // "network", "log", "custom", "os", or null for all
  deviceId: string | null;
}

interface TelemetryPushMessage {
  type: "telemetry_push";
  timestamp: number;
  data: TelemetryEvent;
}

export class TelemetryPushSocketServer extends PushSubscriptionSocketServer<
  TelemetryFilter,
  TelemetryEvent
> {
  constructor(socketPath: string = getSocketPath(SOCKET_CONFIG), timer: Timer = defaultTimer) {
    super(socketPath, timer, "TelemetryPush");
  }

  pushTelemetryEvent(event: TelemetryEvent): void {
    const sentCount = this.pushToSubscribers(event);
    if (sentCount > 0) {
      logger.debug(`[TelemetryPush] Pushed ${event.category} event to ${sentCount} subscribers`);
    }
  }

  protected parseSubscriptionFilter(request: Record<string, unknown>): TelemetryFilter {
    return {
      category: (request.category as string) ?? null,
      deviceId: (request.deviceId as string) ?? null,
    };
  }

  protected matchesFilter(filter: TelemetryFilter, data: TelemetryEvent): boolean {
    if (filter.category !== null && filter.category !== data.category) {
      return false;
    }
    if (filter.deviceId !== null && filter.deviceId !== data.deviceId) {
      return false;
    }
    return true;
  }

  protected createPushMessage(data: TelemetryEvent): TelemetryPushMessage {
    return {
      type: "telemetry_push",
      timestamp: this.timer.now(),
      data,
    };
  }
}

// Singleton instance
let socketServer: TelemetryPushSocketServer | null = null;

export function getTelemetryPushServer(): TelemetryPushSocketServer | null {
  return socketServer;
}

export async function startTelemetryPushSocketServer(): Promise<TelemetryPushSocketServer> {
  if (!socketServer) {
    socketServer = new TelemetryPushSocketServer();
  }
  if (!socketServer.isListening()) {
    await socketServer.start();
  }
  return socketServer;
}

export async function stopTelemetryPushSocketServer(): Promise<void> {
  if (!socketServer) {
    return;
  }
  await socketServer.close();
  socketServer = null;
}
