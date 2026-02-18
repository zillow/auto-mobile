import os from "node:os";
import path from "node:path";
import { Socket } from "node:net";
import { logger } from "../utils/logger";
import { Timer, defaultTimer } from "../utils/SystemTimer";
import {
  PushSubscriptionSocketServer,
  getSocketPath,
  SocketServerConfig,
  SubscriptionResponse,
} from "./socketServer/index";
import type { ViewHierarchyResult } from "../models";
import type { StorageChangedEvent } from "../features/storage/storageTypes";

// NOTE: Keep legacy socket path for backward compatibility with IDE plugin
// (android/ide-plugin/.../ObservationStreamClient.kt hardcodes this path)
const SOCKET_CONFIG: SocketServerConfig = {
  defaultPath: path.join(os.homedir(), ".auto-mobile", "observation-stream.sock"),
  externalPath: "/tmp/auto-mobile-observation-stream.sock",
};

/**
 * Navigation graph summary for streaming to IDE plugins.
 */
export interface NavigationGraphStreamData {
  appId: string | null;
  nodes: Array<{
    id: number;
    screenName: string;
    visitCount: number;
    screenshotPath?: string | null;
  }>;
  edges: Array<{
    id: number;
    from: string;
    to: string;
    toolName: string | null;
    /** Number of times this transition has been traversed */
    traversalCount: number;
  }>;
  currentScreen: string | null;
}

/**
 * Performance metrics data for real-time streaming to IDE plugins.
 */
export interface PerformanceStreamData {
  /** Current FPS value */
  fps: number;
  /** Frame time in milliseconds */
  frameTimeMs: number;
  /** Number of janky frames (>16ms) in the last second */
  jankFrames: number;
  /** Total dropped frames since measurement started */
  droppedFrames: number;
  /** Memory usage in MB */
  memoryUsageMb: number;
  /** CPU usage percentage (0-100) */
  cpuUsagePercent: number;
  /** Touch latency in milliseconds (time from touch to frame response) */
  touchLatencyMs: number | null;
  /** Time to interactive in milliseconds (time until app is responsive after launch) */
  timeToInteractiveMs: number | null;
  /** Current screen/activity name if available */
  screenName: string | null;
  /** Whether the app is considered responsive */
  isResponsive: boolean;
  /** Total Compose recompositions since the last observation (null if no data) */
  recompositionCount: number | null;
  /** Compose recompositions per second rolling average (null if no data) */
  recompositionRate: number | null;
}

/**
 * Response/push message format
 */
interface DeviceDataStreamMessage {
  id?: string;
  type:
    | "subscription_response"
    | "hierarchy_update"
    | "screenshot_update"
    | "navigation_update"
    | "performance_update"
    | "storage_update"
    | "ping"
    | "pong"
    | "error";
  success?: boolean;
  error?: string;
  deviceId?: string;
  timestamp?: number;
  data?: ViewHierarchyResult;
  screenshotBase64?: string;
  screenWidth?: number;
  screenHeight?: number;
  navigationGraph?: NavigationGraphStreamData;
  performanceData?: PerformanceStreamData;
  storageEvent?: StorageChangedEvent;
}

/**
 * Filter for device data stream subscriptions.
 */
interface DeviceDataFilter {
  deviceId: string | null; // null means subscribe to all devices
}

/**
 * Push data wrapper - used internally for type safety with base class.
 */
interface DeviceDataPush {
  message: DeviceDataStreamMessage;
  targetDeviceId: string | null; // null for broadcast to all
}

/**
 * Callback invoked when a subscriber connects.
 * Can be used to trigger device WebSocket connections for real-time updates.
 */
export type OnSubscriberConnectedCallback = (deviceId: string | null) => void;

/**
 * Callback invoked when a client requests the current navigation graph.
 * Returns the current graph data, or null if no graph is available.
 */
export type OnNavigationGraphRequestedCallback = (appId?: string | null) => Promise<NavigationGraphStreamData | null>;

/**
 * Socket server that streams device data updates (hierarchy, screenshot, storage) to connected IDE plugins.
 *
 * Unlike other socket servers which are request-response, this one maintains persistent
 * connections and pushes updates when they arrive from devices.
 *
 * Protocol:
 * - Client sends: {"id": "1", "command": "subscribe", "deviceId": "emulator-5554"}
 * - Server responds: {"id": "1", "type": "subscription_response", "success": true}
 * - Server pushes: {"type": "hierarchy_update", "deviceId": "emulator-5554", "timestamp": 123, "data": {...}}
 * - Server pushes: {"type": "screenshot_update", "deviceId": "emulator-5554", "timestamp": 123, "screenshotBase64": "..."}
 * - Server pushes: {"type": "storage_update", "deviceId": "emulator-5554", "timestamp": 123, "storageEvent": {...}}
 */
export class DeviceDataStreamSocketServer extends PushSubscriptionSocketServer<
  DeviceDataFilter,
  DeviceDataPush
> {
  private onSubscriberConnected: OnSubscriberConnectedCallback | null = null;
  private onNavigationGraphRequested: OnNavigationGraphRequestedCallback | null = null;

  constructor(socketPath: string = getSocketPath(SOCKET_CONFIG), timer: Timer = defaultTimer) {
    super(socketPath, timer, "DeviceDataStream");
  }

  /**
   * Set a callback to be invoked when a subscriber connects.
   * This is used to trigger device WebSocket connections for real-time updates.
   */
  setOnSubscriberConnected(callback: OnSubscriberConnectedCallback): void {
    this.onSubscriberConnected = callback;
  }

  /**
   * Set a callback to handle on-demand navigation graph requests.
   */
  setOnNavigationGraphRequested(callback: OnNavigationGraphRequestedCallback): void {
    this.onNavigationGraphRequested = callback;
  }

  /**
   * Push a hierarchy update to all subscribers interested in this device.
   */
  pushHierarchyUpdate(deviceId: string, hierarchy: ViewHierarchyResult): void {
    const message: DeviceDataStreamMessage = {
      type: "hierarchy_update",
      deviceId,
      timestamp: hierarchy.updatedAt ?? this.timer.now(),
      data: hierarchy,
    };

    const sentCount = this.pushToSubscribers({ message, targetDeviceId: deviceId });
    if (sentCount > 0) {
      logger.info(`[DeviceDataStream] Pushed hierarchy_update to ${sentCount} subscribers (device: ${deviceId})`);
    }
  }

  /**
   * Push a screenshot update to all subscribers interested in this device.
   */
  pushScreenshotUpdate(
    deviceId: string,
    screenshotBase64: string,
    screenWidth: number,
    screenHeight: number
  ): void {
    const message: DeviceDataStreamMessage = {
      type: "screenshot_update",
      deviceId,
      timestamp: this.timer.now(),
      screenshotBase64,
      screenWidth,
      screenHeight,
    };

    const sentCount = this.pushToSubscribers({ message, targetDeviceId: deviceId });
    if (sentCount > 0) {
      logger.info(`[DeviceDataStream] Pushed screenshot_update to ${sentCount} subscribers (device: ${deviceId})`);
    }
  }

  /**
   * Push a navigation graph update to all subscribers.
   * Navigation graph updates are broadcast to all subscribers (not device-specific).
   */
  pushNavigationGraphUpdate(navigationGraph: NavigationGraphStreamData): void {
    const message: DeviceDataStreamMessage = {
      type: "navigation_update",
      timestamp: this.timer.now(),
      navigationGraph,
    };

    const sentCount = this.pushToSubscribers({ message, targetDeviceId: null });
    if (sentCount > 0) {
      logger.info(`[DeviceDataStream] Pushed navigation_update to ${sentCount} subscribers`);
    }
  }

  /**
   * Push a performance metrics update to all subscribers interested in this device.
   */
  pushPerformanceUpdate(deviceId: string, performanceData: PerformanceStreamData): void {
    const message: DeviceDataStreamMessage = {
      type: "performance_update",
      deviceId,
      timestamp: this.timer.now(),
      performanceData,
    };

    const sentCount = this.pushToSubscribers({ message, targetDeviceId: deviceId });
    if (sentCount > 0) {
      logger.info(`[DeviceDataStream] Pushed performance_update to ${sentCount} subscribers (device: ${deviceId})`);
    }
  }

  /**
   * Push a storage change event to all subscribers interested in this device.
   */
  pushStorageUpdate(deviceId: string, event: StorageChangedEvent): void {
    const message: DeviceDataStreamMessage = {
      type: "storage_update",
      deviceId,
      timestamp: this.timer.now(),
      storageEvent: event,
    };

    const sentCount = this.pushToSubscribers({ message, targetDeviceId: deviceId });
    if (sentCount > 0) {
      logger.info(`[DeviceDataStream] Pushed storage_update to ${sentCount} subscribers (device: ${deviceId})`);
    }
  }

  /**
   * Override processLine to handle additional commands and the onSubscriberConnected callback.
   */
  protected async processLine(socket: Socket, line: string): Promise<void> {
    const request = this.parseJson<{ id?: string; command: string; deviceId?: string; appId?: string }>(line);

    if (!request) {
      const errorResponse: SubscriptionResponse = {
        type: "error",
        success: false,
        error: "Invalid JSON",
      };
      this.sendJson(socket, errorResponse);
      return;
    }

    // Handle request_observation command (not in base class)
    if (request.command === "request_observation") {
      // This could trigger an immediate observation request
      // For now, just acknowledge - the caller should use MCP observe tool
      const response: SubscriptionResponse = {
        id: request.id,
        type: "subscription_response",
        success: true,
      };
      this.sendJson(socket, response);
      return;
    }

    // Handle request_navigation_graph command
    if (request.command === "request_navigation_graph") {
      if (!this.onNavigationGraphRequested) {
        const response: SubscriptionResponse = {
          id: request.id,
          type: "subscription_response",
          success: true,
        };
        this.sendJson(socket, response);
        return;
      }

      try {
        const graphData = await this.onNavigationGraphRequested(request.appId ?? null);
        if (graphData) {
          const message: DeviceDataStreamMessage = {
            id: request.id,
            type: "navigation_update",
            timestamp: this.timer.now(),
            navigationGraph: graphData,
          };
          this.sendJson(socket, message);
        } else {
          const response: SubscriptionResponse = {
            id: request.id,
            type: "subscription_response",
            success: true,
          };
          this.sendJson(socket, response);
        }
      } catch (error) {
        logger.warn(`[DeviceDataStream] Error handling request_navigation_graph: ${error}`);
        const errorResponse: SubscriptionResponse = {
          id: request.id,
          type: "error",
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
        this.sendJson(socket, errorResponse);
      }
      return;
    }

    // Handle subscribe with onSubscriberConnected callback
    if (request.command === "subscribe") {
      // Let base class handle the subscription
      await super.processLine(socket, line);

      // Trigger the callback if set
      if (this.onSubscriberConnected) {
        try {
          this.onSubscriberConnected(request.deviceId ?? null);
        } catch (error) {
          logger.warn(`[DeviceDataStream] Error in onSubscriberConnected callback: ${error}`);
        }
      }
      return;
    }

    // Delegate to base class for standard commands (subscribe, unsubscribe, pong)
    await super.processLine(socket, line);
  }

  protected parseSubscriptionFilter(request: Record<string, unknown>): DeviceDataFilter {
    return {
      deviceId: (request.deviceId as string) ?? null,
    };
  }

  protected matchesFilter(filter: DeviceDataFilter, data: DeviceDataPush): boolean {
    // If targetDeviceId is null, broadcast to all subscribers
    if (data.targetDeviceId === null) {
      return true;
    }
    // Send to subscribers that want all devices or specifically this device
    return filter.deviceId === null || filter.deviceId === data.targetDeviceId;
  }

  protected createPushMessage(data: DeviceDataPush): DeviceDataStreamMessage {
    return data.message;
  }
}

// Singleton instance
let socketServer: DeviceDataStreamSocketServer | null = null;

export function getDeviceDataStreamServer(): DeviceDataStreamSocketServer | null {
  return socketServer;
}

export async function startDeviceDataStreamSocketServer(
  timer: Timer = defaultTimer
): Promise<DeviceDataStreamSocketServer> {
  if (!socketServer) {
    socketServer = new DeviceDataStreamSocketServer(getSocketPath(SOCKET_CONFIG), timer);
  }
  if (!socketServer.isListening()) {
    await socketServer.start();
  }
  return socketServer;
}

export async function stopDeviceDataStreamSocketServer(): Promise<void> {
  if (!socketServer) {
    return;
  }
  await socketServer.close();
  socketServer = null;
}
