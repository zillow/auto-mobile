import { createServer, Server as NetServer, Socket } from "node:net";
import { existsSync } from "node:fs";
import { unlink, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { logger } from "../utils/logger";
import { Timer, defaultTimer } from "../utils/SystemTimer";

// Use /tmp for socket when running with external emulator (Docker container with mounted home)
const isExternalMode = process.env.AUTOMOBILE_EMULATOR_EXTERNAL === "true";
const DEFAULT_SOCKET_PATH = isExternalMode
  ? "/tmp/auto-mobile-performance-push.sock"
  : path.join(os.homedir(), ".auto-mobile", "performance-push.sock");

// Keepalive configuration
const KEEPALIVE_INTERVAL_MS = 10_000; // Send ping every 10 seconds
const KEEPALIVE_TIMEOUT_MS = 30_000; // Consider dead if no activity for 30 seconds

/**
 * Performance thresholds for health status calculation
 */
export interface PerformanceThresholds {
  fpsWarning: number;
  fpsCritical: number;
  frameTimeWarning: number;
  frameTimeCritical: number;
  jankWarning: number;
  jankCritical: number;
  touchLatencyWarning: number;
  touchLatencyCritical: number;
  ttffWarning: number;
  ttffCritical: number;
  ttiWarning: number;
  ttiCritical: number;
}

/**
 * Default thresholds
 */
export const DEFAULT_THRESHOLDS: PerformanceThresholds = {
  fpsWarning: 55,
  fpsCritical: 45,
  frameTimeWarning: 18, // 16.67ms is 60fps, 18ms allows some margin
  frameTimeCritical: 33, // 33ms is 30fps
  jankWarning: 5,
  jankCritical: 10,
  touchLatencyWarning: 100,
  touchLatencyCritical: 200,
  ttffWarning: 500,
  ttffCritical: 1000,
  ttiWarning: 700,
  ttiCritical: 1500,
};

/**
 * Health status
 */
export type HealthStatus = "healthy" | "warning" | "critical";

/**
 * Live performance data pushed to clients
 */
export interface LivePerformanceData {
  deviceId: string;
  packageName: string;
  timestamp: number;
  nodeId: number | null;
  screenName: string | null;
  metrics: {
    fps: number | null;
    frameTimeMs: number | null;
    jankFrames: number | null;
    touchLatencyMs: number | null;
    ttffMs: number | null;
    ttiMs: number | null;
    cpuUsagePercent: number | null;
    memoryUsageMb: number | null;
  };
  thresholds: PerformanceThresholds;
  health: HealthStatus;
}

/**
 * Request format for performance push socket
 */
interface PerformancePushRequest {
  id: string;
  command: "subscribe" | "unsubscribe" | "pong";
  deviceId?: string;
  packageName?: string;
}

/**
 * Response/push message format
 */
interface PerformancePushMessage {
  id?: string;
  type: "subscription_response" | "performance_push" | "ping" | "pong" | "error";
  success?: boolean;
  error?: string;
  data?: LivePerformanceData;
  timestamp?: number;
}

/**
 * Subscriber info
 */
interface Subscriber {
  socket: Socket;
  deviceId: string | null; // null means subscribe to all devices
  packageName: string | null; // null means subscribe to all packages
  subscriptionId: string;
  lastActivity: number;
}

/**
 * Socket server that pushes live performance data to connected IDE plugins.
 *
 * Protocol:
 * - Client sends: {"id": "1", "command": "subscribe", "deviceId": "emulator-5554", "packageName": "com.example.app"}
 * - Server responds: {"id": "1", "type": "subscription_response", "success": true}
 * - Server pushes: {"type": "performance_push", "data": {...}}
 * - Server sends ping every 10s: {"type": "ping", "timestamp": 123}
 * - Client responds: {"id": "x", "command": "pong"}
 */
export class PerformancePushSocketServer {
  private server: NetServer | null = null;
  private socketPath: string;
  private subscribers: Map<string, Subscriber> = new Map();
  private subscriptionCounter = 0;
  private keepaliveInterval: ReturnType<typeof setInterval> | null = null;
  private timer: Timer;

  constructor(socketPath: string = DEFAULT_SOCKET_PATH, timer: Timer = defaultTimer) {
    this.socketPath = socketPath;
    this.timer = timer;
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
        logger.info(`[PerformancePush] Socket listening on ${this.socketPath}`);
        this.startKeepalive();
        resolve();
      });

      this.server!.on("error", error => {
        logger.error(`[PerformancePush] Socket error: ${error}`);
        reject(error);
      });
    });
  }

  private startKeepalive(): void {
    if (this.keepaliveInterval) {
      return;
    }

    this.keepaliveInterval = this.timer.setInterval(() => {
      this.checkKeepalive();
    }, KEEPALIVE_INTERVAL_MS);
  }

  private stopKeepalive(): void {
    if (this.keepaliveInterval) {
      this.timer.clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }
  }

  private checkKeepalive(): void {
    const now = this.timer.now();
    const deadSubscribers: string[] = [];

    for (const [subscriptionId, subscriber] of this.subscribers) {
      if (subscriber.socket.destroyed) {
        logger.info(`[PerformancePush] Subscriber ${subscriptionId} socket destroyed, removing`);
        deadSubscribers.push(subscriptionId);
        continue;
      }

      const timeSinceActivity = now - subscriber.lastActivity;
      if (timeSinceActivity > KEEPALIVE_TIMEOUT_MS) {
        logger.warn(`[PerformancePush] Subscriber ${subscriptionId} timed out, removing`);
        deadSubscribers.push(subscriptionId);
        try {
          subscriber.socket.destroy();
        } catch {
          // Ignore errors when destroying
        }
        continue;
      }

      // Send ping
      const pingMessage: PerformancePushMessage = {
        type: "ping",
        timestamp: now,
      };
      try {
        subscriber.socket.write(JSON.stringify(pingMessage) + "\n");
      } catch (error) {
        logger.warn(`[PerformancePush] Failed to ping ${subscriptionId}: ${error}`);
        deadSubscribers.push(subscriptionId);
      }
    }

    for (const subscriptionId of deadSubscribers) {
      this.subscribers.delete(subscriptionId);
    }
  }

  async close(): Promise<void> {
    this.stopKeepalive();

    for (const [, subscriber] of this.subscribers) {
      try {
        subscriber.socket.end();
      } catch {
        // Ignore errors when closing
      }
    }
    this.subscribers.clear();

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

  /**
   * Push live performance data to all interested subscribers.
   */
  pushPerformanceData(data: LivePerformanceData): void {
    const message: PerformancePushMessage = {
      type: "performance_push",
      timestamp: this.timer.now(),
      data,
    };

    const json = JSON.stringify(message) + "\n";
    let sentCount = 0;
    const deadSubscribers: string[] = [];

    for (const [subscriptionId, subscriber] of this.subscribers) {
      // Filter by deviceId and packageName
      const matchesDevice = subscriber.deviceId === null || subscriber.deviceId === data.deviceId;
      const matchesPackage = subscriber.packageName === null || subscriber.packageName === data.packageName;

      if (!matchesDevice || !matchesPackage) {
        continue;
      }

      if (subscriber.socket.destroyed) {
        deadSubscribers.push(subscriptionId);
        continue;
      }

      try {
        const result = subscriber.socket.write(json);
        if (result) {
          subscriber.lastActivity = this.timer.now();
        }
        sentCount++;
      } catch (error) {
        logger.warn(`[PerformancePush] Failed to send to ${subscriptionId}: ${error}`);
        deadSubscribers.push(subscriptionId);
      }
    }

    for (const subscriptionId of deadSubscribers) {
      this.subscribers.delete(subscriptionId);
    }

    if (sentCount > 0) {
      logger.debug(`[PerformancePush] Pushed data to ${sentCount} subscribers`);
    }
  }

  /**
   * Calculate health status from metrics
   */
  static calculateHealth(
    metrics: LivePerformanceData["metrics"],
    thresholds: PerformanceThresholds
  ): HealthStatus {
    // Check FPS (lower is worse)
    if (metrics.fps !== null) {
      if (metrics.fps < thresholds.fpsCritical) {return "critical";}
      if (metrics.fps < thresholds.fpsWarning) {return "warning";}
    }

    // Check frame time (higher is worse)
    if (metrics.frameTimeMs !== null) {
      if (metrics.frameTimeMs > thresholds.frameTimeCritical) {return "critical";}
      if (metrics.frameTimeMs > thresholds.frameTimeWarning) {return "warning";}
    }

    // Check jank frames (higher is worse)
    if (metrics.jankFrames !== null) {
      if (metrics.jankFrames > thresholds.jankCritical) {return "critical";}
      if (metrics.jankFrames > thresholds.jankWarning) {return "warning";}
    }

    // Check touch latency (higher is worse)
    if (metrics.touchLatencyMs !== null) {
      if (metrics.touchLatencyMs > thresholds.touchLatencyCritical) {return "critical";}
      if (metrics.touchLatencyMs > thresholds.touchLatencyWarning) {return "warning";}
    }

    // Check TTFF (higher is worse)
    if (metrics.ttffMs !== null) {
      if (metrics.ttffMs > thresholds.ttffCritical) {return "critical";}
      if (metrics.ttffMs > thresholds.ttffWarning) {return "warning";}
    }

    // Check TTI (higher is worse)
    if (metrics.ttiMs !== null) {
      if (metrics.ttiMs > thresholds.ttiCritical) {return "critical";}
      if (metrics.ttiMs > thresholds.ttiWarning) {return "warning";}
    }

    return "healthy";
  }

  getSubscriberCount(): number {
    return this.subscribers.size;
  }

  private handleConnection(socket: Socket): void {
    let buffer = "";
    let subscriptionId: string | null = null;

    socket.on("data", data => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim()) {
          this.processLine(socket, line).then(result => {
            if (result?.subscriptionId) {
              subscriptionId = result.subscriptionId;
            }
          }).catch(error => {
            logger.error(`[PerformancePush] Request error: ${error}`);
          });
        }
      }
    });

    socket.on("close", () => {
      if (subscriptionId) {
        this.subscribers.delete(subscriptionId);
        logger.info(`[PerformancePush] Subscriber ${subscriptionId} disconnected`);
      }
    });

    socket.on("error", error => {
      logger.error(`[PerformancePush] Connection error: ${error}`);
      if (subscriptionId) {
        this.subscribers.delete(subscriptionId);
      }
    });
  }

  private async processLine(
    socket: Socket,
    line: string
  ): Promise<{ subscriptionId?: string } | void> {
    try {
      const request = JSON.parse(line) as PerformancePushRequest;

      switch (request.command) {
        case "subscribe": {
          const subscriptionId = `perf-${++this.subscriptionCounter}`;
          this.subscribers.set(subscriptionId, {
            socket,
            deviceId: request.deviceId ?? null,
            packageName: request.packageName ?? null,
            subscriptionId,
            lastActivity: this.timer.now(),
          });

          const response: PerformancePushMessage = {
            id: request.id,
            type: "subscription_response",
            success: true,
          };
          socket.write(JSON.stringify(response) + "\n");

          logger.info(`[PerformancePush] New subscriber ${subscriptionId} (device: ${request.deviceId ?? "all"}, package: ${request.packageName ?? "all"})`);
          return { subscriptionId };
        }

        case "unsubscribe": {
          for (const [subId, subscriber] of this.subscribers) {
            if (subscriber.socket === socket) {
              this.subscribers.delete(subId);
              logger.info(`[PerformancePush] Unsubscribed ${subId}`);
              break;
            }
          }

          const response: PerformancePushMessage = {
            id: request.id,
            type: "subscription_response",
            success: true,
          };
          socket.write(JSON.stringify(response) + "\n");
          return;
        }

        case "pong": {
          for (const [, subscriber] of this.subscribers) {
            if (subscriber.socket === socket) {
              subscriber.lastActivity = this.timer.now();
              logger.debug(`[PerformancePush] Received pong from ${subscriber.subscriptionId}`);
              break;
            }
          }
          return;
        }

        default:
          throw new Error(`Unknown command: ${(request as PerformancePushRequest).command}`);
      }
    } catch (error) {
      logger.error(`[PerformancePush] Parse error: ${error}`);
      const errorResponse: PerformancePushMessage = {
        type: "error",
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
      socket.write(JSON.stringify(errorResponse) + "\n");
    }
  }
}

// Singleton instance
let socketServer: PerformancePushSocketServer | null = null;

export function getPerformancePushServer(): PerformancePushSocketServer | null {
  return socketServer;
}

export async function startPerformancePushSocketServer(): Promise<PerformancePushSocketServer> {
  if (!socketServer) {
    socketServer = new PerformancePushSocketServer();
  }
  if (!socketServer.isListening()) {
    await socketServer.start();
  }
  return socketServer;
}

export async function stopPerformancePushSocketServer(): Promise<void> {
  if (!socketServer) {
    return;
  }
  await socketServer.close();
  socketServer = null;
}
