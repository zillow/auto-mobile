/**
 * AccessibilityServiceHierarchy - Delegate for hierarchy retrieval and caching.
 *
 * This delegate handles getting, caching, and converting view hierarchy data
 * from the Android accessibility service.
 */

import WebSocket from "ws";
import { logger } from "../../../utils/logger";
import type { PerformanceTracker } from "../../../utils/PerformanceTracker";
import { NoOpPerformanceTracker } from "../../../utils/PerformanceTracker";
import { throwIfAborted } from "../../../utils/toolUtils";
import { AndroidAccessibilityServiceManager } from "../../../utils/AccessibilityServiceManager";
import type { ViewHierarchyResult } from "../../../models";
import type { ViewHierarchyQueryOptions } from "../../../models/ViewHierarchyQueryOptions";
import type {
  HierarchyDelegateContext,
  AccessibilityHierarchy,
  AccessibilityHierarchyResponse,
  AccessibilityNode,
  CachedHierarchy,
  AndroidPerfTiming,
} from "./types";
import { generateSecureId } from "./types";

/** Timeout cooldown period to skip WebSocket wait after a timeout */
const WEBSOCKET_TIMEOUT_COOLDOWN_MS = 5000;

/**
 * Delegate class for handling hierarchy retrieval and caching.
 */
export class AccessibilityServiceHierarchy {
  private readonly context: HierarchyDelegateContext;

  // Recomposition tracking state
  private recompositionTrackingConfigured: boolean = false;
  private recompositionTrackingEnabled: boolean = false;

  constructor(context: HierarchyDelegateContext) {
    this.context = context;
  }

  /**
   * Check if there is cached hierarchy data
   */
  hasCachedHierarchy(): boolean {
    return this.context.getCachedHierarchy() !== null;
  }

  /**
   * Invalidate the cached hierarchy data.
   * This forces the next getHierarchy call to wait for fresh data.
   * Should be called after any action that modifies the UI (like setText, swipe, tap).
   */
  invalidateCache(): void {
    const cached = this.context.getCachedHierarchy();
    if (cached) {
      logger.debug("[ACCESSIBILITY_SERVICE] Invalidating cached hierarchy");
      this.context.setCachedHierarchy(null);
    }
  }

  /**
   * Get the latest hierarchy from cache or wait for fresh data
   * @param waitForFresh - If true, wait up to timeout for fresh data
   * @param timeout - Maximum time to wait for fresh data in milliseconds
   * @param perf - Performance tracker for timing
   * @param skipWaitForFresh - If true, skip waiting for fresh data entirely (go straight to sync)
   * @param minTimestamp - If provided, cached data must have updatedAt >= this value to be considered fresh
   * @returns Promise<AccessibilityHierarchyResponse>
   */
  async getLatestHierarchy(
    waitForFresh: boolean = false,
    timeout: number = 100,
    perf: PerformanceTracker = new NoOpPerformanceTracker(),
    skipWaitForFresh: boolean = false,
    minTimestamp: number = 0,
    signal?: AbortSignal
  ): Promise<AccessibilityHierarchyResponse> {
    const startTime = Date.now();
    const cachedHierarchy = this.context.getCachedHierarchy();

    logger.debug(`[ACCESSIBILITY_SERVICE] getLatestHierarchy: cache=${cachedHierarchy ? "exists" : "null"}, waitForFresh=${waitForFresh}, skipWaitForFresh=${skipWaitForFresh}, minTimestamp=${minTimestamp}`);

    try {
      // Ensure WebSocket connection is established
      const connected = await perf.track("ensureConnection", () => this.context.ensureConnected(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection");
        return {
          hierarchy: null,
          fresh: false
        };
      }

      // If we have cached data and not waiting for fresh, return it immediately
      if (cachedHierarchy && !waitForFresh) {
        const cacheAge = startTime - cachedHierarchy.receivedAt;
        const updatedAt = cachedHierarchy.hierarchy.updatedAt;

        // If minTimestamp is set, check if cached data is too old
        if (minTimestamp > 0) {
          const freshness = this.evaluateMinTimestamp(cachedHierarchy, minTimestamp, true);

          if (!freshness.isFresh) {
            const staleReference = freshness.usesUpdatedAt ? freshness.updatedAt : cachedHierarchy.receivedAt;
            logger.debug(`[ACCESSIBILITY_SERVICE] Cache rejected: ${freshness.usesUpdatedAt ? "updatedAt" : "receivedAt"} ${staleReference} < ${minTimestamp}`);
            // Fall through to wait for fresh data or sync
          } else {
            const isFresh = cacheAge < 1000;
            const duration = Date.now() - startTime;
            logger.debug(
              `[ACCESSIBILITY_SERVICE] Cache accepted in ${duration}ms: ` +
              `receivedAt=${cachedHierarchy.receivedAt}, ` +
              `updatedAt=${updatedAt}, age=${cacheAge}ms, fresh=${isFresh}`
            );

            return {
              hierarchy: cachedHierarchy.hierarchy,
              fresh: isFresh,
              updatedAt: updatedAt,
              perfTiming: cachedHierarchy.perfTiming
            };
          }
        } else {
          // No minTimestamp check, return cache
          const isFresh = cacheAge < 1000;
          const duration = Date.now() - startTime;
          logger.debug(`[ACCESSIBILITY_SERVICE] Cache hit: ${duration}ms (age: ${cacheAge}ms, fresh: ${isFresh}, updatedAt: ${updatedAt})`);

          return {
            hierarchy: cachedHierarchy.hierarchy,
            fresh: isFresh,
            updatedAt: updatedAt,
            perfTiming: cachedHierarchy.perfTiming
          };
        }
      }

      // Wait for fresh data if requested (unless skipped or recently timed out)
      const cacheRejected = minTimestamp > 0 && cachedHierarchy &&
        !this.evaluateMinTimestamp(cachedHierarchy, minTimestamp, true).isFresh;
      const shouldWait = (waitForFresh || cacheRejected) && (!skipWaitForFresh || cacheRejected) && !this.shouldSkipWebSocketWait();
      if (shouldWait) {
        throwIfAborted(signal);
        const waitMinTimestamp = minTimestamp > 0 ? minTimestamp : startTime;
        const useDeviceTimestamp = minTimestamp > 0;
        logger.debug(`[ACCESSIBILITY_SERVICE] Waiting up to ${timeout}ms for fresh hierarchy data (must be newer than ${waitMinTimestamp})`);

        const freshData = await perf.track("waitForFresh", () =>
          this.waitForFreshData(timeout, waitMinTimestamp, useDeviceTimestamp, signal)
        );
        const duration = Date.now() - startTime;

        if (freshData) {
          logger.info(`[ACCESSIBILITY_SERVICE] Received fresh hierarchy in ${duration}ms (updatedAt: ${freshData.hierarchy.updatedAt})`);
          return {
            hierarchy: freshData.hierarchy,
            fresh: true,
            updatedAt: freshData.hierarchy.updatedAt,
            perfTiming: freshData.perfTiming
          };
        } else {
          // Record timeout so we skip WebSocket wait for a while
          this.context.setLastWebSocketTimeout(Date.now());
          logger.warn(`[ACCESSIBILITY_SERVICE] Timeout waiting for fresh data after ${duration}ms, will skip WebSocket wait for ${WEBSOCKET_TIMEOUT_COOLDOWN_MS}ms`);

          // Return cached data if available
          const currentCache = this.context.getCachedHierarchy();
          if (currentCache) {
            currentCache.fresh = false;
            logger.info(`[ACCESSIBILITY_SERVICE] Returning stale cached data (updatedAt: ${currentCache.hierarchy.updatedAt}), marked cache as stale`);
            return {
              hierarchy: currentCache.hierarchy,
              fresh: false,
              updatedAt: currentCache.hierarchy.updatedAt,
              perfTiming: currentCache.perfTiming
            };
          }
        }
      } else if (skipWaitForFresh || this.shouldSkipWebSocketWait()) {
        logger.debug(`[ACCESSIBILITY_SERVICE] Skipping WebSocket wait (skipWaitForFresh=${skipWaitForFresh}, recentTimeout=${this.shouldSkipWebSocketWait()})`);
      }

      // No cached data available
      logger.debug("[ACCESSIBILITY_SERVICE] No cached hierarchy data available");
      return {
        hierarchy: null,
        fresh: false
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] Failed to get hierarchy after ${duration}ms: ${error}`);
      return {
        hierarchy: null,
        fresh: false
      };
    }
  }

  /**
   * Get view hierarchy from accessibility service.
   * This is the main entry point for getting hierarchy data from the accessibility service.
   */
  async getAccessibilityHierarchy(
    queryOptions?: ViewHierarchyQueryOptions,
    perf: PerformanceTracker = new NoOpPerformanceTracker(),
    skipWaitForFresh: boolean = false,
    minTimestamp: number = 0,
    disableAllFiltering: boolean = false,
    signal?: AbortSignal
  ): Promise<ViewHierarchyResult | null> {
    const startTime = Date.now();
    const cachedHierarchy = this.context.getCachedHierarchy();

    perf.serial("a11yService");

    try {
      throwIfAborted(signal);
      // Check if service is available
      const available = await perf.track("checkAvailable", () =>
        AndroidAccessibilityServiceManager.getInstance(this.context.device, this.context.adb).isAvailable()
      );
      if (!available) {
        logger.info("[ACCESSIBILITY_SERVICE] Service not available, will use fallback");
        perf.end();
        return null;
      }

      // Get hierarchy from WebSocket service
      const waitForFresh = !skipWaitForFresh && (cachedHierarchy === null || !cachedHierarchy.fresh);
      const response = await perf.track("getHierarchy", () =>
        this.getLatestHierarchy(waitForFresh, 100, perf, skipWaitForFresh, minTimestamp, signal)
      );

      let hierarchyData = response.hierarchy;
      let isFresh = response.fresh;
      let androidPerfTiming = response.perfTiming;

      // If no hierarchy from WebSocket or data is stale, sync to get fresh data
      const needsSync = !hierarchyData || !isFresh;
      if (needsSync) {
        logger.info(`[ACCESSIBILITY_SERVICE] WebSocket returned ${hierarchyData ? "stale" : "no"} data (fresh=${isFresh}), syncing for fresh data`);

        const syncResult = await perf.track("syncRequest", () =>
          this.requestHierarchySync(perf, disableAllFiltering, signal)
        );

        if (syncResult) {
          hierarchyData = syncResult.hierarchy;
          if (syncResult.perfTiming) {
            androidPerfTiming = syncResult.perfTiming;
          }
          isFresh = true;
          logger.info("[ACCESSIBILITY_SERVICE] Successfully retrieved hierarchy via sync ADB method");
        } else if (!hierarchyData) {
          logger.warn("[ACCESSIBILITY_SERVICE] Both WebSocket and sync methods failed, will use fallback");
          perf.end();
          return null;
        }
      }

      // Convert to expected format
      const convertedHierarchy = await perf.track("convert", () =>
        Promise.resolve(this.convertToViewHierarchyResult(hierarchyData!))
      );

      // Add the device timestamp to the result
      if (hierarchyData!.updatedAt) {
        convertedHierarchy.updatedAt = hierarchyData!.updatedAt;
      }

      // Merge Android-side performance timing
      if (androidPerfTiming && androidPerfTiming.length > 0) {
        perf.addExternalTiming("androidPerf", androidPerfTiming as any);
      }

      perf.end();

      const duration = Date.now() - startTime;
      logger.info(`[ACCESSIBILITY_SERVICE] Successfully retrieved and converted hierarchy in ${duration}ms (fresh: ${isFresh}, updatedAt: ${hierarchyData!.updatedAt})`);

      return convertedHierarchy;
    } catch (error) {
      perf.end();
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] getAccessibilityHierarchy failed after ${duration}ms: ${error}`);
      return null;
    }
  }

  /**
   * Request hierarchy synchronously via WebSocket message.
   * Triggers extraction on device which pushes result via WebSocket.
   * Falls back to ADB broadcast if WebSocket send fails.
   */
  async requestHierarchySync(
    perf: PerformanceTracker = new NoOpPerformanceTracker(),
    disableAllFiltering: boolean = false,
    signal?: AbortSignal,
    timeoutMs: number = 10000
  ): Promise<{ hierarchy: AccessibilityHierarchy; perfTiming?: AndroidPerfTiming[] } | null> {
    const startTime = Date.now();
    const effectiveTimeoutMs = Math.max(0, timeoutMs);

    try {
      logger.info("[ACCESSIBILITY_SERVICE] Requesting hierarchy sync via WebSocket");

      // Ensure WebSocket connection is established
      await this.context.ensureConnected(perf);

      // Try WebSocket request first (faster path)
      const sentViaWebSocket = await perf.track("sendWsRequest", async () => {
        return this.sendHierarchyRequest(disableAllFiltering);
      });

      // Fall back to ADB broadcast if WebSocket failed
      if (!sentViaWebSocket) {
        logger.info("[ACCESSIBILITY_SERVICE] Falling back to ADB broadcast");
        const uuid = `sync_${Date.now()}_${generateSecureId()}`;
        await perf.track("sendBroadcast", async () => {
          await this.context.adb.executeCommand(
            `shell "am broadcast -a dev.jasonpearson.automobile.EXTRACT_HIERARCHY --es uuid ${uuid} --ez disableAllFiltering ${disableAllFiltering}"`,
            undefined,
            undefined,
            undefined,
            signal
          );
        });
      }

      // Wait for WebSocket push
      const freshData = await perf.track("waitForPush", () =>
        this.waitForFreshData(effectiveTimeoutMs, startTime, false, signal)
      );

      if (freshData) {
        const duration = Date.now() - startTime;
        logger.debug(`[ACCESSIBILITY_SERVICE] Sync complete: ${duration}ms (updatedAt: ${freshData.hierarchy.updatedAt})`);
        return {
          hierarchy: freshData.hierarchy,
          perfTiming: freshData.perfTiming
        };
      }

      logger.warn("[ACCESSIBILITY_SERVICE] Timeout waiting for WebSocket push after request");
      return null;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] Sync hierarchy request failed after ${duration}ms: ${error}`);
      return null;
    }
  }

  /**
   * Convert accessibility service hierarchy format to ViewHierarchyResult format.
   */
  convertToViewHierarchyResult(accessibilityHierarchy: AccessibilityHierarchy): ViewHierarchyResult {
    const startTime = Date.now();

    try {
      logger.info("[ACCESSIBILITY_SERVICE] Converting accessibility service format to ViewHierarchyResult format");

      const hierarchyToConvert: AccessibilityNode | undefined = accessibilityHierarchy.hierarchy;
      const resolvedPackageName = accessibilityHierarchy.packageName;

      if (!hierarchyToConvert) {
        const errorMessage = accessibilityHierarchy.error || "Accessibility hierarchy missing from accessibility service";
        return {
          hierarchy: {
            error: errorMessage
          },
          packageName: resolvedPackageName,
          windows: accessibilityHierarchy.windows,
          intentChooserDetected: accessibilityHierarchy.intentChooserDetected,
          notificationPermissionDetected: accessibilityHierarchy.notificationPermissionDetected,
          accessibilityServiceIncomplete: accessibilityHierarchy.accessibilityServiceIncomplete,
          sources: ["accessibility-service"]
        } as ViewHierarchyResult;
      }

      // Convert the accessibility node format
      const convertedHierarchy = this.convertAccessibilityNode(hierarchyToConvert);

      // Convert accessibility-focused element if present
      const accessibilityFocusedElement = accessibilityHierarchy["accessibility-focused-element"]
        ? this.convertAccessibilityNode(accessibilityHierarchy["accessibility-focused-element"])
        : undefined;

      const result: ViewHierarchyResult = {
        "hierarchy": convertedHierarchy,
        "packageName": resolvedPackageName,
        "windows": accessibilityHierarchy.windows,
        "intentChooserDetected": accessibilityHierarchy.intentChooserDetected,
        "notificationPermissionDetected": accessibilityHierarchy.notificationPermissionDetected,
        "accessibility-focused-element": accessibilityFocusedElement,
        "accessibilityServiceIncomplete": accessibilityHierarchy.accessibilityServiceIncomplete,
        "sources": ["accessibility-service"]
      };

      const duration = Date.now() - startTime;
      logger.info(`[ACCESSIBILITY_SERVICE] Format conversion completed in ${duration}ms`);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] Format conversion failed after ${duration}ms: ${error}`);

      return {
        hierarchy: {
          error: "Failed to convert accessibility service hierarchy format"
        }
      } as ViewHierarchyResult;
    }
  }

  /**
   * Configure recomposition tracking on the accessibility service.
   */
  async setRecompositionTrackingEnabled(
    enabled: boolean,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<void> {
    if (this.recompositionTrackingConfigured && this.recompositionTrackingEnabled === enabled) {
      return;
    }

    const connected = await perf.track("ensureConnection", () => this.context.ensureConnected(perf));
    if (!connected) {
      logger.debug("[ACCESSIBILITY_SERVICE] Skipping recomposition tracking config; WebSocket not connected");
      return;
    }

    const sent = this.sendRecompositionTrackingRequest(enabled);
    if (sent) {
      this.recompositionTrackingConfigured = true;
      this.recompositionTrackingEnabled = enabled;
      logger.info(`[ACCESSIBILITY_SERVICE] Recomposition tracking ${enabled ? "enabled" : "disabled"}`);
    }
  }

  /**
   * Check if we should skip WebSocket wait due to recent timeout.
   */
  private shouldSkipWebSocketWait(): boolean {
    const lastTimeout = this.context.getLastWebSocketTimeout();
    if (lastTimeout === 0) {
      return false;
    }
    const timeSinceTimeout = Date.now() - lastTimeout;
    return timeSinceTimeout < WEBSOCKET_TIMEOUT_COOLDOWN_MS;
  }

  /**
   * Determine whether cached data satisfies a minTimestamp requirement.
   */
  private evaluateMinTimestamp(
    cachedHierarchy: CachedHierarchy,
    minTimestamp: number,
    useDeviceTimestamp: boolean
  ): {
    isFresh: boolean;
    updatedAt?: number;
    updatedAfter: boolean;
    receivedAfter: boolean;
    usesUpdatedAt: boolean;
  } {
    const updatedAt = cachedHierarchy.hierarchy.updatedAt;
    const hasUpdatedAt = typeof updatedAt === "number" && !Number.isNaN(updatedAt);
    const shouldUseUpdatedAt = useDeviceTimestamp && hasUpdatedAt;
    const updatedAfter = shouldUseUpdatedAt ? updatedAt >= minTimestamp : false;
    const receivedAfter = !shouldUseUpdatedAt ? cachedHierarchy.receivedAt >= minTimestamp : false;
    return {
      isFresh: shouldUseUpdatedAt ? updatedAfter : receivedAfter,
      updatedAt,
      updatedAfter,
      receivedAfter,
      usesUpdatedAt: shouldUseUpdatedAt
    };
  }

  /**
   * Wait for fresh data to arrive via WebSocket.
   */
  private async waitForFreshData(
    timeout: number,
    minTimestamp: number,
    useDeviceTimestamp: boolean,
    signal?: AbortSignal
  ): Promise<CachedHierarchy | null> {
    const startTime = this.context.timer.now();
    const checkInterval = 50;
    const screenCheckInterval = 1000;
    const staleCheckDelay = 2000;
    let lastScreenCheck = startTime;
    let screenCheckInProgress = false;
    let staleCheckSent = false;

    return new Promise(resolve => {
      const intervalId = this.context.timer.setInterval(() => {
        if (signal?.aborted) {
          this.context.timer.clearInterval(intervalId);
          resolve(null);
          return;
        }
        const elapsed = this.context.timer.now() - startTime;

        // Check if we received fresh data
        const cachedHierarchy = this.context.getCachedHierarchy();
        if (cachedHierarchy) {
          const freshness = this.evaluateMinTimestamp(cachedHierarchy, minTimestamp, useDeviceTimestamp);

          if (freshness.isFresh) {
            this.context.timer.clearInterval(intervalId);
            logger.debug(`[ACCESSIBILITY_SERVICE] Fresh data received: receivedAt=${cachedHierarchy.receivedAt}, updatedAt=${cachedHierarchy.hierarchy.updatedAt}`);
            resolve(cachedHierarchy);
            return;
          }
        }

        // Send "nudge" after staleCheckDelay
        if (!staleCheckSent && elapsed >= staleCheckDelay) {
          staleCheckSent = true;
          logger.info(`[ACCESSIBILITY_SERVICE] No push received after ${staleCheckDelay}ms, sending stale check request (sinceTimestamp: ${minTimestamp})`);
          this.sendHierarchyIfStaleRequest(minTimestamp);
        }

        // Check screen state periodically
        const now = this.context.timer.now();
        if (!screenCheckInProgress && now - lastScreenCheck >= screenCheckInterval) {
          screenCheckInProgress = true;
          lastScreenCheck = now;

          this.context.adb.isScreenOn(signal).then(isOn => {
            screenCheckInProgress = false;
            if (!isOn) {
              this.context.timer.clearInterval(intervalId);
              logger.warn("[ACCESSIBILITY_SERVICE] Screen is off - failing fast instead of waiting for timeout");
              resolve(null);
            }
          }).catch(() => {
            screenCheckInProgress = false;
          });
        }

        // Check if timeout exceeded
        if (elapsed >= timeout) {
          this.context.timer.clearInterval(intervalId);
          const cached = this.context.getCachedHierarchy();
          if (cached) {
            logger.debug(`[ACCESSIBILITY_SERVICE] Timeout: cached data receivedAt=${cached.receivedAt}, updatedAt=${cached.hierarchy.updatedAt}, minTimestamp=${minTimestamp}`);
          }
          resolve(null);
        }
      }, checkInterval);
    });
  }

  /**
   * Send a message via WebSocket to request hierarchy extraction.
   */
  private sendHierarchyRequest(disableAllFiltering: boolean = false): boolean {
    const ws = this.context.getWebSocket();
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      logger.warn("[ACCESSIBILITY_SERVICE] Cannot send request - WebSocket not connected");
      return false;
    }

    try {
      const requestId = `req_${Date.now()}_${generateSecureId()}`;
      const message = JSON.stringify({
        type: "request_hierarchy",
        requestId,
        disableAllFiltering
      });
      ws.send(message);
      logger.debug(`[ACCESSIBILITY_SERVICE] Sent hierarchy request via WebSocket (requestId: ${requestId}, disableAllFiltering: ${disableAllFiltering})`);
      return true;
    } catch (error) {
      logger.warn(`[ACCESSIBILITY_SERVICE] Failed to send WebSocket request: ${error}`);
      return false;
    }
  }

  /**
   * Send a message via WebSocket to request hierarchy extraction IF stale.
   */
  private sendHierarchyIfStaleRequest(sinceTimestamp: number): boolean {
    const ws = this.context.getWebSocket();
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      logger.warn("[ACCESSIBILITY_SERVICE] Cannot send stale check request - WebSocket not connected");
      return false;
    }

    try {
      const requestId = `stale_${Date.now()}_${generateSecureId()}`;
      const message = JSON.stringify({
        type: "request_hierarchy_if_stale",
        requestId,
        sinceTimestamp
      });
      ws.send(message);
      logger.debug(`[ACCESSIBILITY_SERVICE] Sent hierarchy_if_stale request (requestId: ${requestId}, sinceTimestamp: ${sinceTimestamp})`);
      return true;
    } catch (error) {
      logger.warn(`[ACCESSIBILITY_SERVICE] Failed to send stale check request: ${error}`);
      return false;
    }
  }

  /**
   * Send recomposition tracking configuration request.
   */
  private sendRecompositionTrackingRequest(enabled: boolean): boolean {
    const ws = this.context.getWebSocket();
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      logger.warn("[ACCESSIBILITY_SERVICE] Cannot send recomposition config - WebSocket not connected");
      return false;
    }

    try {
      const requestId = `recomp_${Date.now()}_${generateSecureId()}`;
      const message = JSON.stringify({ type: "set_recomposition_tracking", requestId, enabled });
      ws.send(message);
      return true;
    } catch (error) {
      logger.warn(`[ACCESSIBILITY_SERVICE] Failed to send recomposition config: ${error}`);
      return false;
    }
  }

  /**
   * Convert individual accessibility node to the expected format.
   */
  private convertAccessibilityNode(node: AccessibilityNode | AccessibilityNode[]): any {
    // Handle array of nodes
    if (Array.isArray(node)) {
      const convertedArray = node.map(child => this.convertAccessibilityNode(child));
      return convertedArray.length === 1 ? convertedArray[0] : convertedArray;
    }

    const converted: any = {};

    // Copy over all properties
    if (node.text) {
      converted.text = node.text;
    }
    if (node["content-desc"]) {
      converted["content-desc"] = node["content-desc"];
    }
    if (node["resource-id"]) {
      converted["resource-id"] = node["resource-id"];
    }
    if (node["test-tag"]) {
      converted["test-tag"] = node["test-tag"];
    }
    if (node.className) {
      converted.className = node.className;
    }
    if (node.packageName) {
      converted.packageName = node.packageName;
    }
    if (node.clickable && node.clickable !== "false") {
      converted.clickable = node.clickable;
    }
    if (node.enabled && node.enabled !== "false") {
      converted.enabled = node.enabled;
    }
    if (node.focusable && node.focusable !== "false") {
      converted.focusable = node.focusable;
    }
    if (node.focused && node.focused !== "false") {
      converted.focused = node.focused;
    }
    if (node.scrollable && node.scrollable !== "false") {
      converted.scrollable = node.scrollable;
    }
    if (node.password && node.password !== "false") {
      converted.password = node.password;
    }
    if (node.checkable && node.checkable !== "false") {
      converted.checkable = node.checkable;
    }
    if (node.checked && node.checked !== "false") {
      converted.checked = node.checked;
    }
    if (node.selected && node.selected !== "false") {
      converted.selected = node.selected;
    }
    if (node["long-clickable"] && node["long-clickable"] !== "false") {
      converted["long-clickable"] = node["long-clickable"];
    }

    if (node.occlusionState) {
      converted.occlusionState = node.occlusionState;
    }
    if (node.occludedBy) {
      converted.occludedBy = node.occludedBy;
    }
    if (node.extras) {
      converted.extras = node.extras;
    }
    if (node.recomposition) {
      converted.recomposition = node.recomposition;
    }

    // Convert bounds from object format to string format
    if (node.bounds) {
      converted.bounds = `[${node.bounds.left},${node.bounds.top}][${node.bounds.right},${node.bounds.bottom}]`;
    }

    // Convert child nodes recursively
    if (node.node) {
      converted.node = this.convertAccessibilityNode(node.node);
    }

    return converted;
  }
}
