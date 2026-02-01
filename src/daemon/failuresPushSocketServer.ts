import os from "node:os";
import path from "node:path";
import { logger } from "../utils/logger";
import { Timer, defaultTimer } from "../utils/SystemTimer";
import { PushSubscriptionSocketServer, getSocketPath, SocketServerConfig } from "./socketServer/index";
import type { FailureType, FailureSeverity } from "../server/failuresResources";

const SOCKET_CONFIG: SocketServerConfig = {
  defaultPath: path.join(os.homedir(), ".auto-mobile", "failures-push.sock"),
  externalPath: "/tmp/auto-mobile-failures-push.sock",
};

/**
 * Failure notification data pushed to clients
 */
export interface FailureNotificationPush {
  occurrenceId: string;
  groupId: string;
  type: FailureType;
  severity: FailureSeverity;
  title: string;
  message: string;
  timestamp: number;
}

/**
 * Filter for failure push subscriptions.
 */
interface FailureFilter {
  type: FailureType | null;
  severity: FailureSeverity | null;
}

/**
 * Push message format.
 */
interface FailurePushMessage {
  type: "failure_push";
  timestamp: number;
  data: FailureNotificationPush;
}

/**
 * Socket server that pushes live failure notifications to connected IDE plugins.
 *
 * Protocol:
 * - Client sends: {"id": "1", "command": "subscribe", "type": "crash", "severity": "high"}
 * - Server responds: {"id": "1", "type": "subscription_response", "success": true}
 * - Server pushes: {"type": "failure_push", "timestamp": 123, "data": {...}}
 * - Server sends ping every 10s: {"type": "ping", "timestamp": 123}
 * - Client responds: {"id": "x", "command": "pong"}
 */
export class FailuresPushSocketServer extends PushSubscriptionSocketServer<
  FailureFilter,
  FailureNotificationPush
> {
  constructor(socketPath: string = getSocketPath(SOCKET_CONFIG), timer: Timer = defaultTimer) {
    super(socketPath, timer, "FailuresPush");
  }

  /**
   * Push a failure notification to all interested subscribers.
   */
  pushFailure(data: FailureNotificationPush): void {
    logger.info(`[FailuresPush] Pushing failure: ${data.type} - ${data.title} (subscribers: ${this.getSubscriberCount()})`);
    const sentCount = this.pushToSubscribers(data);
    logger.info(`[FailuresPush] Pushed failure to ${sentCount} subscribers: ${data.title}`);
  }

  protected parseSubscriptionFilter(request: Record<string, unknown>): FailureFilter {
    return {
      type: (request.type as FailureType) ?? null,
      severity: (request.severity as FailureSeverity) ?? null,
    };
  }

  protected matchesFilter(filter: FailureFilter, data: FailureNotificationPush): boolean {
    const matchesType = filter.type === null || filter.type === data.type;
    const matchesSeverity = filter.severity === null || filter.severity === data.severity;
    return matchesType && matchesSeverity;
  }

  protected createPushMessage(data: FailureNotificationPush): FailurePushMessage {
    return {
      type: "failure_push",
      timestamp: this.timer.now(),
      data,
    };
  }
}

// Singleton instance
let socketServer: FailuresPushSocketServer | null = null;

export function getFailuresPushServer(): FailuresPushSocketServer | null {
  return socketServer;
}

export async function startFailuresPushSocketServer(): Promise<FailuresPushSocketServer> {
  if (!socketServer) {
    socketServer = new FailuresPushSocketServer();
  }
  if (!socketServer.isListening()) {
    await socketServer.start();
  }
  return socketServer;
}

export async function stopFailuresPushSocketServer(): Promise<void> {
  if (!socketServer) {
    return;
  }
  await socketServer.close();
  socketServer = null;
}
