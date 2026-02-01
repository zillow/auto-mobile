import type { Element, ViewHierarchyResult } from "../../../models";
import type { ViewHierarchyQueryOptions } from "../../../models/ViewHierarchyQueryOptions";
import type { PerformanceTracker } from "../../../utils/PerformanceTracker";

/**
 * Interface for retrieving and managing view hierarchy data.
 */
export interface ViewHierarchy {
  /**
   * Retrieve the view hierarchy of the current screen.
   * @param queryOptions - Optional query options for targeted element retrieval
   * @param perf - Optional performance tracker for timing data
   * @param skipWaitForFresh - If true, skip WebSocket wait and go straight to sync method
   * @param minTimestamp - If provided, cached data must have updatedAt >= this value
   * @param signal - Optional abort signal
   * @returns Promise with parsed view hierarchy
   */
  getViewHierarchy(
    queryOptions?: ViewHierarchyQueryOptions,
    perf?: PerformanceTracker,
    skipWaitForFresh?: boolean,
    minTimestamp?: number,
    signal?: AbortSignal
  ): Promise<ViewHierarchyResult>;

  /**
   * Configure recomposition tracking for Compose UI debugging.
   * @param enabled - Whether to enable recomposition tracking
   * @param perf - Optional performance tracker
   */
  configureRecompositionTracking(enabled: boolean, perf?: PerformanceTracker): Promise<void>;

  /**
   * Find the focused element in the view hierarchy.
   * @param viewHierarchy - The view hierarchy to search
   * @returns The focused element or null if none found
   */
  findFocusedElement(viewHierarchy: any): Element | null;

  /**
   * Find the accessibility-focused element (TalkBack cursor position) in the view hierarchy.
   * @param viewHierarchy - The view hierarchy to search
   * @returns The accessibility-focused element or null if none found
   */
  findAccessibilityFocusedElement(viewHierarchy: any): Element | null;

  /**
   * Filter out completely offscreen nodes from the view hierarchy.
   * @param viewHierarchy - The view hierarchy to filter
   * @param screenWidth - Screen width in pixels
   * @param screenHeight - Screen height in pixels
   * @param margin - Extra margin around screen to keep near-visible elements (default 100px)
   * @returns Filtered view hierarchy with offscreen nodes removed
   */
  filterOffscreenNodes(
    viewHierarchy: any,
    screenWidth: number,
    screenHeight: number,
    margin?: number
  ): any;
}
