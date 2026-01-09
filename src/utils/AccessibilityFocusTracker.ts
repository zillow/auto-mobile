import { AccessibilityServiceClient } from "../features/observe/AccessibilityServiceClient";
import { Element, CurrentFocusResult, TraversalOrderResult } from "../models/index";
import { PerformanceTracker, NoOpPerformanceTracker } from "./PerformanceTracker";
import { logger } from "./logger";

/**
 * Cached focus state for a device
 */
interface FocusState {
  /** The currently focused element */
  focusedElement: Element | null;

  /** Timestamp when this state was cached */
  timestamp: number;

  /** Optional device identifier */
  deviceId?: string;
}

/**
 * Cached traversal order for a device
 */
interface TraversalOrderCache {
  /** Ordered list of focusable elements */
  elements: Element[];

  /** Index of currently focused element */
  focusedIndex: number | null;

  /** Timestamp when this order was cached */
  timestamp: number;

  /** Optional device identifier */
  deviceId?: string;
}

/**
 * Options for selector matching
 */
export interface ElementSelector {
  /** Match by resource ID */
  resourceId?: string;

  /** Match by text content */
  text?: string;

  /** Match by content description */
  contentDesc?: string;

  /** Match by test tag */
  testTag?: string;
}

/**
 * AccessibilityFocusTracker tracks the current accessibility focus position
 * and provides methods to query and navigate the accessibility tree in TalkBack traversal order.
 *
 * This class provides infrastructure for focus-based navigation algorithms by:
 * - Tracking current TalkBack cursor position
 * - Building ordered accessibility tree for navigation
 * - Caching focus state to reduce redundant queries
 * - Finding element positions in traversal order
 */
export class AccessibilityFocusTracker {
  /** Cache of focus states by device ID */
  private focusCache: Map<string, FocusState> = new Map();

  /** Cache of traversal orders by device ID */
  private traversalOrderCache: Map<string, TraversalOrderCache> = new Map();

  /** Cache TTL in milliseconds (5 seconds) */
  private static readonly CACHE_TTL_MS = 5000;

  /** Singleton instance */
  private static instance: AccessibilityFocusTracker | null = null;

  /** Private constructor for singleton pattern */
  private constructor() {}

  /**
   * Get the singleton instance
   */
  static getInstance(): AccessibilityFocusTracker {
    if (!AccessibilityFocusTracker.instance) {
      AccessibilityFocusTracker.instance = new AccessibilityFocusTracker();
    }
    return AccessibilityFocusTracker.instance;
  }

  /**
   * Get the current accessibility focus element (TalkBack cursor position).
   * Uses caching to reduce redundant queries.
   *
   * @param deviceId - Device identifier
   * @param useCache - Whether to use cached focus state (default: true)
   * @param perf - Performance tracker
   * @returns The currently focused element or null if no focus
   */
  async getCurrentFocus(
    deviceId: string,
    useCache: boolean = true,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<Element | null> {
    return await perf.track("getCurrentFocus", async () => {
      // Check cache if enabled
      if (useCache) {
        const cached = this.focusCache.get(deviceId);
        if (cached && this.isCacheValid(cached.timestamp)) {
          logger.debug(`[ACCESSIBILITY_FOCUS_TRACKER] Using cached focus state for device ${deviceId}`);
          return cached.focusedElement;
        }
      }

      // Query accessibility service for current focus
      const client = AccessibilityServiceClient.getInstance(deviceId);
      const result: CurrentFocusResult = await client.requestCurrentFocus(5000, perf);

      if (result.error) {
        logger.warn(`[ACCESSIBILITY_FOCUS_TRACKER] Failed to get current focus: ${result.error}`);
        return null;
      }

      // Cache the result
      this.focusCache.set(deviceId, {
        focusedElement: result.focusedElement,
        timestamp: Date.now(),
        deviceId
      });

      logger.debug(
        `[ACCESSIBILITY_FOCUS_TRACKER] Current focus for device ${deviceId}: ` +
        `${result.focusedElement ? result.focusedElement.resourceId || result.focusedElement.text : "none"}`
      );

      return result.focusedElement;
    });
  }

  /**
   * Build accessibility tree in TalkBack traversal order.
   * Returns an ordered list of all accessibility-focusable elements.
   *
   * @param deviceId - Device identifier
   * @param useCache - Whether to use cached traversal order (default: true)
   * @param perf - Performance tracker
   * @returns Ordered list of focusable elements
   */
  async buildTraversalOrder(
    deviceId: string,
    useCache: boolean = true,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<Element[]> {
    return await perf.track("buildTraversalOrder", async () => {
      // Check cache if enabled
      if (useCache) {
        const cached = this.traversalOrderCache.get(deviceId);
        if (cached && this.isCacheValid(cached.timestamp)) {
          logger.debug(
            `[ACCESSIBILITY_FOCUS_TRACKER] Using cached traversal order for device ${deviceId} ` +
            `(${cached.elements.length} elements)`
          );
          return cached.elements;
        }
      }

      // Query accessibility service for traversal order
      const client = AccessibilityServiceClient.getInstance(deviceId);
      const result: TraversalOrderResult = await client.requestTraversalOrder(5000, perf);

      if (result.error) {
        logger.warn(`[ACCESSIBILITY_FOCUS_TRACKER] Failed to get traversal order: ${result.error}`);
        return [];
      }

      // Cache the result
      this.traversalOrderCache.set(deviceId, {
        elements: result.elements,
        focusedIndex: result.focusedIndex,
        timestamp: Date.now(),
        deviceId
      });

      logger.debug(
        `[ACCESSIBILITY_FOCUS_TRACKER] Traversal order for device ${deviceId}: ` +
        `${result.elements.length} elements, focused at index ${result.focusedIndex}`
      );

      return result.elements;
    });
  }

  /**
   * Find the index of an element in the traversal order.
   * Returns null if the element is not found.
   *
   * @param target - Element selector to match
   * @param orderedElements - Ordered list of elements
   * @returns Index of the element or null if not found
   */
  async findElementIndex(
    target: ElementSelector,
    orderedElements: Element[]
  ): Promise<number | null> {
    if (orderedElements.length === 0) {
      return null;
    }

    // Find all matching elements
    const matches = orderedElements
      .map((element, index) => ({ element, index }))
      .filter(({ element }) => this.matchesSelector(element, target));

    if (matches.length === 0) {
      logger.debug(
        `[ACCESSIBILITY_FOCUS_TRACKER] No elements match selector: ` +
        `${JSON.stringify(target)}`
      );
      return null;
    }

    // If multiple matches, prefer the first visible one
    const visibleMatch = matches.find(({ element }) => this.isVisible(element));
    if (visibleMatch) {
      logger.debug(
        `[ACCESSIBILITY_FOCUS_TRACKER] Found visible match at index ${visibleMatch.index} ` +
        `(${matches.length} total matches)`
      );
      return visibleMatch.index;
    }

    // Otherwise, return the first match
    logger.debug(
      `[ACCESSIBILITY_FOCUS_TRACKER] Found match at index ${matches[0].index} ` +
      `(not visible, ${matches.length} total matches)`
    );
    return matches[0].index;
  }

  /**
   * Invalidate cached focus state for a device.
   * Should be called when UI changes or after tool calls that affect focus.
   *
   * @param deviceId - Device identifier
   */
  invalidateFocus(deviceId: string): void {
    this.focusCache.delete(deviceId);
    logger.debug(`[ACCESSIBILITY_FOCUS_TRACKER] Invalidated focus cache for device ${deviceId}`);
  }

  /**
   * Invalidate cached traversal order for a device.
   * Should be called when UI hierarchy changes.
   *
   * @param deviceId - Device identifier
   */
  invalidateTraversalOrder(deviceId: string): void {
    this.traversalOrderCache.delete(deviceId);
    logger.debug(`[ACCESSIBILITY_FOCUS_TRACKER] Invalidated traversal order cache for device ${deviceId}`);
  }

  /**
   * Invalidate all caches for a device.
   * Convenience method to clear both focus and traversal order caches.
   *
   * @param deviceId - Device identifier
   */
  invalidateAll(deviceId: string): void {
    this.invalidateFocus(deviceId);
    this.invalidateTraversalOrder(deviceId);
  }

  /**
   * Check if a cached timestamp is still valid
   */
  private isCacheValid(timestamp: number): boolean {
    return Date.now() - timestamp < AccessibilityFocusTracker.CACHE_TTL_MS;
  }

  /**
   * Check if an element matches a selector
   */
  private matchesSelector(element: Element, selector: ElementSelector): boolean {
    if (selector.resourceId && element.resourceId !== selector.resourceId) {
      return false;
    }

    if (selector.text && element.text !== selector.text) {
      return false;
    }

    if (selector.contentDesc && element.contentDesc !== selector.contentDesc) {
      return false;
    }

    if (selector.testTag && element.testTag !== selector.testTag) {
      return false;
    }

    return true;
  }

  /**
   * Check if an element is visible (has non-zero bounds)
   */
  private isVisible(element: Element): boolean {
    if (!element.bounds) {
      return false;
    }

    const width = element.bounds.right - element.bounds.left;
    const height = element.bounds.bottom - element.bounds.top;

    return width > 0 && height > 0;
  }
}
