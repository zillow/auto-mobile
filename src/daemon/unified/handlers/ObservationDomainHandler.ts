import { BaseDomainHandler } from "../DomainHandler";
import type { RequestResult, SubscriptionFilter, PushEvent } from "../UnifiedSocketTypes";
import { createError, ErrorCodes } from "../UnifiedSocketTypes";
import type { ViewHierarchyResult } from "../../../models";
import type {
  NavigationGraphStreamData,
  PerformanceStreamData,
} from "../../deviceDataStreamSocketServer";
import type { StorageChangedEvent } from "../../../features/storage/storageTypes";
import { Timer, defaultTimer } from "../../../utils/SystemTimer";

/**
 * Observation subscription filter
 */
interface ObservationFilter extends SubscriptionFilter {
  deviceId?: string;
}

/**
 * Hierarchy update event data
 */
export interface HierarchyUpdateEvent {
  deviceId: string;
  timestamp: number;
  data: ViewHierarchyResult;
}

/**
 * Screenshot update event data
 */
export interface ScreenshotUpdateEvent {
  deviceId: string;
  timestamp: number;
  screenshotBase64: string;
  screenWidth: number;
  screenHeight: number;
}

/**
 * Navigation update event data
 */
export interface NavigationUpdateEvent {
  timestamp: number;
  navigationGraph: NavigationGraphStreamData;
}

/**
 * Performance update event data (from device observation)
 */
export interface PerformanceUpdateEvent {
  deviceId: string;
  timestamp: number;
  performanceData: PerformanceStreamData;
}

/**
 * Storage update event data
 */
export interface StorageUpdateEvent {
  deviceId: string;
  timestamp: number;
  storageEvent: StorageChangedEvent;
}

/**
 * Domain handler for device observation.
 *
 * Methods:
 * - request_observation: Trigger an observation request (returns acknowledgement)
 *
 * Events:
 * - hierarchy_update: View hierarchy updates
 * - screenshot_update: Screenshot updates
 * - navigation_update: Navigation graph updates
 * - performance_update: Performance metrics from device
 * - storage_update: Storage change events
 */
export class ObservationDomainHandler extends BaseDomainHandler {
  readonly domain = "observation" as const;
  private timer: Timer;

  constructor(timer: Timer = defaultTimer) {
    super();
    this.timer = timer;
  }

  async handleRequest(
    method: string,
    _params: Record<string, unknown> | undefined
  ): Promise<RequestResult> {
    switch (method) {
      case "request_observation":
        // Acknowledge the observation request
        // The actual observation is triggered via MCP or device WebSocket
        return {
          result: { acknowledged: true },
        };
      default:
        return {
          error: createError(ErrorCodes.UNKNOWN_METHOD, `Unknown method: ${method}`),
        };
    }
  }

  parseSubscriptionFilter(params: Record<string, unknown> | undefined): ObservationFilter {
    return {
      deviceId: (params?.deviceId as string) ?? undefined,
    };
  }

  matchesFilter(filter: SubscriptionFilter, event: PushEvent): boolean {
    const obsFilter = filter as ObservationFilter;

    // Navigation updates are broadcast to all
    if (event.event === "navigation_update") {
      return true;
    }

    // Other events are device-specific
    const data = event.data as { deviceId?: string };
    if (obsFilter.deviceId && data.deviceId && obsFilter.deviceId !== data.deviceId) {
      return false;
    }

    return true;
  }

  /**
   * Push a hierarchy update (called by data sources).
   */
  pushHierarchyUpdate(deviceId: string, hierarchy: ViewHierarchyResult): void {
    const event: HierarchyUpdateEvent = {
      deviceId,
      timestamp: hierarchy.updatedAt ?? this.timer.now(),
      data: hierarchy,
    };
    this.push("hierarchy_update", event);
  }

  /**
   * Push a screenshot update (called by data sources).
   */
  pushScreenshotUpdate(
    deviceId: string,
    screenshotBase64: string,
    screenWidth: number,
    screenHeight: number
  ): void {
    const event: ScreenshotUpdateEvent = {
      deviceId,
      timestamp: this.timer.now(),
      screenshotBase64,
      screenWidth,
      screenHeight,
    };
    this.push("screenshot_update", event);
  }

  /**
   * Push a navigation graph update (called by data sources).
   */
  pushNavigationGraphUpdate(navigationGraph: NavigationGraphStreamData): void {
    const event: NavigationUpdateEvent = {
      timestamp: this.timer.now(),
      navigationGraph,
    };
    this.push("navigation_update", event);
  }

  /**
   * Push a performance update (called by data sources).
   */
  pushPerformanceUpdate(deviceId: string, performanceData: PerformanceStreamData): void {
    const event: PerformanceUpdateEvent = {
      deviceId,
      timestamp: this.timer.now(),
      performanceData,
    };
    this.push("performance_update", event);
  }

  /**
   * Push a storage update (called by data sources).
   */
  pushStorageUpdate(deviceId: string, storageEvent: StorageChangedEvent): void {
    const event: StorageUpdateEvent = {
      deviceId,
      timestamp: this.timer.now(),
      storageEvent,
    };
    this.push("storage_update", event);
  }
}
