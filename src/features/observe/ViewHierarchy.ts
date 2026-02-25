import { AdbClientFactory, defaultAdbClientFactory } from "../../utils/android-cmdline-tools/AdbClientFactory";
import type { AdbExecutor } from "../../utils/android-cmdline-tools/interfaces/AdbExecutor";
import { logger } from "../../utils/logger";
import { BootedDevice } from "../../models";
import { Element } from "../../models";
import { ViewHierarchyResult } from "../../models";
import type { ElementParser } from "../../utils/interfaces/ElementParser";
import type { ElementGeometry } from "../../utils/interfaces/ElementGeometry";
import { DefaultElementParser } from "../utility/ElementParser";
import { DefaultElementGeometry } from "../utility/ElementGeometry";
import { ViewHierarchyQueryOptions } from "../../models";
import { CtrlProxyClient } from "./android";
import { XCTestServiceClient } from "./ios";
import { PerformanceTracker, NoOpPerformanceTracker } from "../../utils/PerformanceTracker";
import { serverConfig } from "../../utils/ServerConfig";
import { attachRawViewHierarchy } from "../../utils/viewHierarchySearch";
import type { ViewHierarchy as ViewHierarchyInterface } from "./interfaces/ViewHierarchy";
import { Timer, defaultTimer } from "../../utils/SystemTimer";

/**
 * Interface for element bounds
 */
interface ElementBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export class ViewHierarchy implements ViewHierarchyInterface {
  private device: BootedDevice;
  private parser: ElementParser;
  private geometry: ElementGeometry;
  private accessibilityServiceClient: CtrlProxyClient;
  private timer: Timer;

  /**
   * Create a ViewHierarchy instance
   * @param device - Device to get view hierarchy from
   * @param adbFactoryOrExecutor - Factory for creating AdbClient instances, or an AdbExecutor for testing
   * @param accessibilityServiceClient - Optional CtrlProxyClient instance for testing
   */
  constructor(
    device: BootedDevice,
    adbFactoryOrExecutor: AdbClientFactory | AdbExecutor | null = defaultAdbClientFactory,
    accessibilityServiceClient: CtrlProxyClient | null = null,
    timer: Timer = defaultTimer,
  ) {
    this.device = device;
    this.parser = new DefaultElementParser();
    this.geometry = new DefaultElementGeometry();

    // Detect if the argument is a factory (has create method) or an executor
    let adbFactory: AdbClientFactory;
    if (adbFactoryOrExecutor && typeof (adbFactoryOrExecutor as AdbClientFactory).create === "function") {
      adbFactory = adbFactoryOrExecutor as AdbClientFactory;
    } else if (adbFactoryOrExecutor) {
      // Legacy path: wrap the executor in a factory for downstream dependencies
      const executor = adbFactoryOrExecutor as AdbExecutor;
      adbFactory = { create: () => executor };
    } else {
      adbFactory = defaultAdbClientFactory;
    }

    this.accessibilityServiceClient = accessibilityServiceClient || CtrlProxyClient.getInstance(device, adbFactory);
    this.timer = timer;
  }

  async configureRecompositionTracking(
    enabled: boolean,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<void> {
    if (this.device.platform !== "android") {
      return;
    }

    await this.accessibilityServiceClient.setRecompositionTrackingEnabled(enabled, perf);
  }

  /**
   * Retrieve the view hierarchy of the current screen
   * @param queryOptions - Optional query options for targeted element retrieval
   * @param perf - Performance tracker for timing data
   * @param skipWaitForFresh - If true, skip WebSocket wait and go straight to sync method
   * @param minTimestamp - If provided, cached data must have updatedAt >= this value
   * @returns Promise with parsed XML view hierarchy
   */
  async getViewHierarchy(
    queryOptions?: ViewHierarchyQueryOptions,
    perf: PerformanceTracker = new NoOpPerformanceTracker(),
    skipWaitForFresh: boolean = false,
    minTimestamp: number = 0,
    signal?: AbortSignal
  ): Promise<ViewHierarchyResult> {
    switch (this.device.platform) {
      case "ios":
        return this.getiOSViewHierarchy(perf, skipWaitForFresh, minTimestamp);
      case "android":
        return this.getAndroidViewHierarchy(queryOptions, perf, skipWaitForFresh, minTimestamp, signal);
      default:
        throw new Error("Unsupported platform");
    }
  }

  /**
   * Retrieve the view hierarchy of the current screen
   * @param perf - Performance tracker for timing data
   * @param skipWaitForFresh - If true, skip waiting for fresh data and use cache if available
   * @param minTimestamp - If provided, cached data must have updatedAt >= this value
   * @returns Promise with parsed XML view hierarchy
   */
  async getiOSViewHierarchy(
    perf: PerformanceTracker = new NoOpPerformanceTracker(),
    skipWaitForFresh: boolean = false,
    minTimestamp: number = 0
  ): Promise<ViewHierarchyResult> {
    const startTime = this.timer.now();
    logger.info(`[VIEW_HIERARCHY] Starting getViewHierarchy for iOS (skipWaitForFresh=${skipWaitForFresh}, minTimestamp=${minTimestamp})`);

    perf.serial("ios_viewHierarchy");

    const xcTestClient = XCTestServiceClient.getInstance(this.device);
    const viewHierarchy = await perf.track("xcTestService", async () => {
      // Use getLatestHierarchy which properly handles skipWaitForFresh and minTimestamp
      const result = await xcTestClient.getLatestHierarchy(
        !skipWaitForFresh, // waitForFresh = opposite of skipWaitForFresh
        15000,             // timeout
        perf,
        skipWaitForFresh,
        minTimestamp
      );

      if (!result || !result.hierarchy) {
        return {
          hierarchy: {
            error: "Failed to retrieve iOS view hierarchy from XCTestService"
          }
        } as unknown as ViewHierarchyResult;
      }

      // Convert XCTestHierarchy to ViewHierarchyResult format
      return this.convertXCTestHierarchy(result.hierarchy, result.updatedAt);
    });

    perf.end();

    const duration = this.timer.now() - startTime;
    logger.info(`[VIEW_HIERARCHY] Successfully retrieved hierarchy from XCTestService in ${duration}ms`);
    return viewHierarchy;
  }

  /**
   * Convert XCTestHierarchy to ViewHierarchyResult format
   */
  private convertXCTestHierarchy(hierarchy: any, updatedAt?: number): ViewHierarchyResult {
    return {
      ...hierarchy,
      updatedAt: updatedAt ?? hierarchy.updatedAt ?? this.timer.now()
    };
  }

  /**
   * Retrieve the view hierarchy of the current screen
   * @param queryOptions - Optional query options for targeted element retrieval
   * @param perf - Performance tracker for timing data
   * @param skipWaitForFresh - If true, skip WebSocket wait and go straight to sync method
   * @param minTimestamp - If provided, cached data must have updatedAt >= this value
   * @returns Promise with parsed view hierarchy
   */
  async getAndroidViewHierarchy(
    queryOptions?: ViewHierarchyQueryOptions,
    perf: PerformanceTracker = new NoOpPerformanceTracker(),
    skipWaitForFresh: boolean = false,
    minTimestamp: number = 0,
    signal?: AbortSignal
  ): Promise<ViewHierarchyResult> {
    const startTime = this.timer.now();
    logger.debug(`[VIEW_HIERARCHY] Starting Android getViewHierarchy (skipWaitForFresh=${skipWaitForFresh}, minTimestamp=${minTimestamp})`);

    perf.serial("android_viewHierarchy");
    const useRawElementSearch = serverConfig.isRawElementSearchEnabled();

    try {
      const accessibilityHierarchy = await this.accessibilityServiceClient.getAccessibilityHierarchy(
        queryOptions,
        perf,
        skipWaitForFresh,
        minTimestamp,
        useRawElementSearch,
        signal
      );

      if (accessibilityHierarchy) {
        perf.end();
        const duration = this.timer.now() - startTime;
        logger.debug(`[VIEW_HIERARCHY] Successfully retrieved hierarchy from accessibility service in ${duration}ms`);
        return this.prepareHierarchyForResponse(accessibilityHierarchy);
      }

      // Accessibility service returned null
      perf.end();
      logger.warn("[VIEW_HIERARCHY] Accessibility service returned null hierarchy");
      return {
        hierarchy: {
          error: "Failed to retrieve view hierarchy from accessibility service"
        }
      } as unknown as ViewHierarchyResult;
    } catch (err) {
      perf.end();
      const duration = this.timer.now() - startTime;
      logger.warn(`[VIEW_HIERARCHY] Failed to get hierarchy from accessibility service after ${duration}ms:`, err);
      return {
        hierarchy: {
          error: "Failed to retrieve view hierarchy"
        }
      } as unknown as ViewHierarchyResult;
    }
  }

  /**
   * Check if node meets filter criteria (either string or boolean based)
   * @param props - Node properties
   * @returns True if node meets any filter criteria
   */
  public meetsFilterCriteria(props: any): boolean {
    return this.meetsStringFilterCriteria(props) || this.meetsBooleanFilterCriteria(props);
  }

  /**
   * Filter a single node and its children
   * @param node - Node to filter
   * @param isRootNode - Whether this is the root node
   * @returns Filtered node or null
   */
  public filterSingleNode(node: any, isRootNode: boolean = false): any | null {
    if (!node) {
      return null;
    }

    if (isRootNode) {
      const rootCopy = JSON.parse(JSON.stringify(node));

      if (node.node) {
        const processedChildren = this.processNodeChildren(node, child => this.filterSingleNode(child));

        if (processedChildren.length > 0) {
          rootCopy.node = this.normalizeNodeStructure(processedChildren);
        }
      }

      return rootCopy;
    }

    const props = node.$ || node;
    const meetsFilterCriteria = this.meetsFilterCriteria(props);
    const relevantChildren = this.processNodeChildren(node, child => this.filterSingleNode(child));

    if (meetsFilterCriteria) {
      const cleanedNode = this.cleanNodeProperties(node);

      if (relevantChildren.length > 0) {
        cleanedNode.node = this.normalizeNodeStructure(relevantChildren);
      }

      return cleanedNode;
    }

    if (relevantChildren.length > 0) {
      return relevantChildren;
    }

    return null;
  }

  /**
   * Filter the view hierarchy to only include elements that meet specific criteria:
   * - Have resourceId, text, or contentDesc
   * - OR have clickable, scrollable, focused, or selected set to true
   * - Include descendants that meet criteria even if parents don't
   * - Omit boolean fields not set to true and class="android.view.View"
   * @param viewHierarchy - The view hierarchy to filter
   * @returns Filtered view hierarchy
   */
  filterViewHierarchy(viewHierarchy: any): any {
    if (!viewHierarchy || !viewHierarchy.hierarchy) {
      logger.debug("No hierarchy found");
      return viewHierarchy;
    }

    const result = JSON.parse(JSON.stringify(viewHierarchy));
    result.hierarchy = this.filterSingleNode(viewHierarchy.hierarchy, true);
    return result;
  }

  private prepareHierarchyForResponse(rawHierarchy: ViewHierarchyResult): ViewHierarchyResult {
    if (!serverConfig.isRawElementSearchEnabled()) {
      return rawHierarchy;
    }

    if (
      rawHierarchy?.hierarchy &&
      typeof rawHierarchy.hierarchy === "object" &&
      "error" in rawHierarchy.hierarchy &&
      rawHierarchy.hierarchy.error
    ) {
      return rawHierarchy;
    }

    if (this.device.platform !== "android") {
      return rawHierarchy;
    }

    const filtered = this.filterViewHierarchy(rawHierarchy);
    attachRawViewHierarchy(filtered, rawHierarchy);
    return filtered;
  }

  /**
   * Parse bounds string to numeric coordinates, handling negative values
   * @param boundsStr - Bounds string in format [left,top][right,bottom]
   * @returns Parsed bounds or null if invalid
   */
  private parseBoundsString(boundsStr: string): ElementBounds | null {
    if (!boundsStr || typeof boundsStr !== "string") {
      return null;
    }
    // Handle negative coordinates with -? prefix
    const match = boundsStr.match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);
    if (!match) {
      return null;
    }
    return {
      left: parseInt(match[1], 10),
      top: parseInt(match[2], 10),
      right: parseInt(match[3], 10),
      bottom: parseInt(match[4], 10)
    };
  }

  /**
   * Check if bounds are completely offscreen
   * @param bounds - Element bounds
   * @param screenWidth - Screen width
   * @param screenHeight - Screen height
   * @param margin - Extra margin around screen to keep near-visible elements (default 100px)
   * @returns True if element is completely offscreen
   */
  private isCompletelyOffscreen(
    bounds: ElementBounds,
    screenWidth: number,
    screenHeight: number,
    margin: number = 100
  ): boolean {
    // Element is offscreen if it's completely outside the screen + margin
    return (
      bounds.right < -margin ||           // Completely left of screen
      bounds.left > screenWidth + margin ||  // Completely right of screen
      bounds.bottom < -margin ||          // Completely above screen
      bounds.top > screenHeight + margin     // Completely below screen
    );
  }

  /**
   * Recursively filter out offscreen nodes from the hierarchy
   * @param node - Node to filter
   * @param screenWidth - Screen width
   * @param screenHeight - Screen height
   * @param margin - Extra margin to keep near-visible elements
   * @returns Filtered node or null if completely offscreen with no visible children
   */
  private filterOffscreenNode(
    node: any,
    screenWidth: number,
    screenHeight: number,
    margin: number = 100
  ): any | null {
    if (!node) {
      return null;
    }

    // Parse bounds from string if present
    const boundsStr = node.bounds || (node.$ && node.$.bounds);
    let bounds: ElementBounds | null = null;

    if (typeof boundsStr === "string") {
      bounds = this.parseBoundsString(boundsStr);
    } else if (boundsStr && typeof boundsStr === "object") {
      bounds = boundsStr as ElementBounds;
    }

    // Check if this node is completely offscreen
    const isOffscreen = bounds && this.isCompletelyOffscreen(bounds, screenWidth, screenHeight, margin);

    // Process children
    const children = node.node;
    const filteredChildren: any[] = [];

    if (children) {
      const childArray = Array.isArray(children) ? children : [children];
      for (const child of childArray) {
        const filteredChild = this.filterOffscreenNode(child, screenWidth, screenHeight, margin);
        if (filteredChild !== null) {
          if (Array.isArray(filteredChild)) {
            filteredChildren.push(...filteredChild);
          } else {
            filteredChildren.push(filteredChild);
          }
        }
      }
    }

    // If node is offscreen but has visible children, return just the children
    if (isOffscreen && filteredChildren.length > 0) {
      return filteredChildren.length === 1 ? filteredChildren[0] : filteredChildren;
    }

    // If node is offscreen and has no visible children, filter it out
    if (isOffscreen && filteredChildren.length === 0) {
      return null;
    }

    // Node is visible - return it with filtered children
    const result = { ...node };
    if (filteredChildren.length > 0) {
      result.node = filteredChildren.length === 1 ? filteredChildren[0] : filteredChildren;
    } else if (node.node) {
      delete result.node;
    }

    return result;
  }

  /**
   * Filter out completely offscreen nodes from the view hierarchy
   * This reduces hierarchy size significantly for scrollable content (like YouTube)
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
    margin: number = 100
  ): any {
    if (!viewHierarchy || !viewHierarchy.hierarchy || screenWidth <= 0 || screenHeight <= 0) {
      return viewHierarchy;
    }

    const originalSize = JSON.stringify(viewHierarchy.hierarchy).length;

    const result = { ...viewHierarchy };
    result.hierarchy = this.filterOffscreenNode(viewHierarchy.hierarchy, screenWidth, screenHeight, margin);

    const filteredSize = JSON.stringify(result.hierarchy).length;
    const reduction = Math.round((1 - filteredSize / originalSize) * 100);

    if (reduction > 10) {
      logger.debug(`Offscreen filtering reduced hierarchy by ${reduction}% (${originalSize} -> ${filteredSize} bytes)`);
    }

    return result;
  }

  /**
   * Check if node meets string-based filter criteria
   * @param props - Node properties
   * @returns True if node has meaningful string properties
   */
  meetsStringFilterCriteria(props: any): boolean {
    return Boolean(
      (props.resourceId && props.resourceId !== "") ||
      (props["resource-id"] && props["resource-id"] !== "") ||
      (props.text && props.text !== "") ||
      (props.contentDesc && props.contentDesc !== "") ||
      (props["content-desc"] && props["content-desc"] !== "") ||
      (props["test-tag"] && props["test-tag"] !== "") ||
      props.recomposition ||
      props.recompositionMetrics
    );
  }

  /**
   * Check if node meets boolean-based filter criteria
   * @param props - Node properties
   * @returns True if node has meaningful boolean properties
   */
  meetsBooleanFilterCriteria(props: any): boolean {
    return Boolean(
      (props.clickable === "true") ||
      (props.scrollable === "true") ||
      (props.focused === "true") ||
      (props.selected === "true") ||
      (props.selected === true)
    );
  }

  /**
   * Process node children with filter function
   * @param node - Parent node
   * @param filterFn - Filter function to apply to children
   * @returns Array of filtered children
   */
  processNodeChildren(node: any, filterFn: (child: any) => any): any[] {
    const relevantChildren: any[] = [];

    if (node.node) {
      const children = (Array.isArray(node.node) ? node.node : [node.node]).slice(0, 64);
      for (const child of children) {
        const filteredChild = filterFn(child);
        if (filteredChild) {
          if (Array.isArray(filteredChild)) {
            relevantChildren.push(...filteredChild);
          } else {
            relevantChildren.push(filteredChild);
          }
        }
      }
    }

    return relevantChildren;
  }

  /**
   * Normalize node structure for filtered children
   * @param filteredChildren - Array of filtered children
   * @returns Normalized node structure (single item or array)
   */
  normalizeNodeStructure(filteredChildren: any[]): any {
    return filteredChildren.length === 1 ? filteredChildren[0] : filteredChildren;
  }

  /**
   * Find the focused element in the view hierarchy
   * @param viewHierarchy - The view hierarchy to search
   * @returns The focused element or null if none found
   */
  findFocusedElement(viewHierarchy: any): Element | null {
    return this.findElementByProperty(viewHierarchy, "focused");
  }

  /**
   * Find the accessibility-focused element (TalkBack cursor position) in the view hierarchy.
   * First checks the top-level accessibility-focused-element field, then traverses if needed.
   */
  findAccessibilityFocusedElement(viewHierarchy: any): Element | null {
    if (!viewHierarchy) {
      return null;
    }

    // First check if accessibility-focused-element is provided at the top level (from Kotlin)
    if (viewHierarchy["accessibility-focused-element"]) {
      const element = this.parseNodeBounds(viewHierarchy["accessibility-focused-element"]);
      if (element) {
        element["accessibility-focused"] = true;
        return element;
      }
    }

    // Fallback: traverse the hierarchy to find the accessibility-focused element
    return this.findElementByProperty(viewHierarchy, "accessibility-focused");
  }

  private findElementByProperty(viewHierarchy: any, propertyName: string): Element | null {
    if (!viewHierarchy) {
      return null;
    }

    let foundElement: Element | null = null;

    const traverseNode = (node: any): void => {
      if (foundElement) {
        return;
      }

      const props = node.$ || node;
      if (props[propertyName] === "true" || props[propertyName] === true) {
        const element = this.parseNodeBounds(node);
        if (element) {
          element[propertyName] = true;
          foundElement = element;
          return;
        }
      }

      if (node.node) {
        const children = Array.isArray(node.node) ? node.node : [node.node];
        for (const child of children) {
          traverseNode(child);
          if (foundElement) {
            break;
          }
        }
      }
    };

    if (viewHierarchy.hierarchy) {
      traverseNode(viewHierarchy.hierarchy);
    }

    return foundElement;
  }

  /**
   * Calculate the center coordinates of an element
   * @param element - The element to calculate center for
   * @returns The center coordinates
   */
  getElementCenter(element: Element): { x: number, y: number } {
    return this.geometry.getElementCenter(element);
  }

  /**
   * Parse a node's bounds if they're in string format
   * @param node - The node to parse
   * @returns The node with parsed bounds or null
   */
  parseNodeBounds(node: any): Element | null {
    return this.parser.parseNodeBounds(node);
  }

  /**
   * Traverse the view hierarchy and process each node with a provided function
   * @param node - The node to start traversal from
   * @param processNode - Function to process each node
   */
  traverseViewHierarchy(node: any, processNode: (node: any) => void): void {
    this.parser.traverseNode(node, processNode);
  }

  cleanNodeProperties(node: any): any {
    const result: any = {};
    const allowedProperties = [
      "text",
      "resourceId",
      "resource-id",
      "contentDesc",
      "content-desc",
      "clickable",
      "scrollable",
      "enabled",
      "selected",
      "bounds",
      "test-tag",
      "extras",
      "recomposition",
      "recompositionMetrics"
    ];

    if (node["$"]) {
      const cleanedProps: any = {};
      for (const key in node.$) {
        if (allowedProperties.includes(key)) {
          const normalizedKey = key === "resourceId" ? "resource-id" : key === "contentDesc" ? "content-desc" : key;
          if (node.$[key] === "") {continue;}
          if (key === "enabled" && (node.$[key] === true || node.$[key] === "true")) {continue;}
          if (key !== "enabled" && (node.$[key] === false || node.$[key] === "false")) {continue;}
          cleanedProps[normalizedKey] = node.$[key];
        }
      }

      if (Object.keys(cleanedProps).length > 0) {
        for (const key in cleanedProps) {
          result[key] = cleanedProps[key];
        }
      }

      for (const key in node) {
        if (key !== "$" && key !== "node") {
          result[key] = node[key];
        }
      }
    } else {
      for (const key in node) {
        if (key === "node") {continue;}
        if (!allowedProperties.includes(key)) {continue;}
        if (node[key] === "") {continue;}
        if (key === "enabled" && (node[key] === true || node[key] === "true")) {continue;}
        if (key !== "enabled" && (node[key] === false || node[key] === "false")) {continue;}
        result[key] = node[key];
      }
    }

    return result;
  }
}
