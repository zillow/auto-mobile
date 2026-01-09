import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import {
  ActionableError,
  BootedDevice,
  Element,
  ObserveResult,
  SwipeDirection,
  SwipeOnOptions,
  SwipeOnResult,
  ScrollableCandidate,
  ViewHierarchyResult,
  GestureOptions
} from "../../models";
import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { AxeClient } from "../../utils/ios-cmdline-tools/AxeClient";
import { ElementUtils } from "../utility/ElementUtils";
import { ExecuteGesture } from "./ExecuteGesture";
import { logger } from "../../utils/logger";
import { createGlobalPerformanceTracker, PerformanceTracker, NoOpPerformanceTracker } from "../../utils/PerformanceTracker";
import { AccessibilityServiceClient } from "../observe/AccessibilityServiceClient";
import { WebDriverAgent } from "../../utils/ios-cmdline-tools/WebDriverAgent";
import { buildElementSearchDebugContext } from "../../utils/DebugContextBuilder";
import { SwipeResult } from "../../models/SwipeResult";
import { ObserveScreen } from "../observe/ObserveScreen";
import { resolveSwipeDirection } from "../../utils/swipeOnUtils";
import { AccessibilityDetector } from "../../utils/interfaces/AccessibilityDetector";
import { accessibilityDetector as defaultAccessibilityDetector } from "../../utils/AccessibilityDetector";

export interface GestureExecutor {
  swipe(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    options?: GestureOptions,
    perf?: PerformanceTracker
  ): Promise<SwipeResult>;
}

export interface ObserveScreenLike {
  execute(
    queryOptions?: import("../../models").ViewHierarchyQueryOptions,
    perf?: PerformanceTracker,
    skipWaitForFresh?: boolean,
    minTimestamp?: number,
    signal?: AbortSignal
  ): Promise<ObserveResult>;
  getMostRecentCachedObserveResult(): Promise<ObserveResult>;
}

export interface SwipeOnDependencies {
  executeGesture?: GestureExecutor;
  observeScreen?: ObserveScreenLike;
  elementUtils?: ElementUtils;
  accessibilityDetector?: AccessibilityDetector;
}

type SwipeOnResolvedOptions = SwipeOnOptions & { direction: SwipeDirection };

/**
 * Unified command to swipe on screen or elements, with optional scroll-until-visible functionality
 *
 * This class consolidates the functionality of:
 * - swipeOnScreen: Full-screen swipes
 * - swipeOnElement: Swipes on specific elements
 * - scroll: Scrolling with optional element search
 */
export class SwipeOn extends BaseVisualChange {
  private executeGesture: GestureExecutor;
  private elementUtils: ElementUtils;
  private accessibilityService: AccessibilityServiceClient;
  private webdriver: WebDriverAgent;
  private accessibilityDetector: AccessibilityDetector;
  private static readonly MAX_ATTEMPTS = 5;

  constructor(
    device: BootedDevice,
    adb: AdbClient | null = null,
    axe: AxeClient | null = null,
    webdriver: WebDriverAgent | null = null,
    dependencies: SwipeOnDependencies = {}
  ) {
    super(device, adb, axe);
    this.executeGesture = dependencies.executeGesture ?? new ExecuteGesture(device, adb);
    this.elementUtils = dependencies.elementUtils ?? new ElementUtils();
    this.accessibilityService = AccessibilityServiceClient.getInstance(device, this.adb);
    this.webdriver = webdriver || new WebDriverAgent(device);
    this.accessibilityDetector = dependencies.accessibilityDetector || defaultAccessibilityDetector;
    if (dependencies.observeScreen) {
      this.observeScreen = dependencies.observeScreen as unknown as ObserveScreen;
    }
  }

  /**
   * Create an error result with consistent structure
   */
  private createErrorResult(
    error: string,
    extras: { warning?: string; scrollableCandidates?: ScrollableCandidate[] } = {}
  ): SwipeOnResult {
    return {
      success: false,
      error,
      warning: extras.warning,
      scrollableCandidates: extras.scrollableCandidates,
      targetType: "screen",
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      duration: 0
    };
  }

  /**
   * Execute swipe with TalkBack detection and branching logic.
   * Routes to appropriate swipe method based on TalkBack state.
   */
  private async executeSwipeGesture(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    direction: SwipeDirection,
    containerElement: Element | null,
    gestureOptions?: GestureOptions,
    perf?: PerformanceTracker
  ): Promise<SwipeResult> {
    // Only check TalkBack for Android platform
    if (this.device.platform !== "android") {
      return this.executeGesture.swipe(x1, y1, x2, y2, gestureOptions, perf);
    }

    // Check if TalkBack is enabled
    const isTalkBackEnabled = await this.accessibilityDetector.isAccessibilityEnabled(
      this.device.id,
      this.adb!
    );

    if (isTalkBackEnabled) {
      logger.info("[SwipeOn] TalkBack enabled, using accessibility-aware swipe");
      return this.executeAndroidSwipeWithAccessibility(
        x1, y1, x2, y2,
        direction,
        containerElement,
        gestureOptions,
        perf
      );
    } else {
      // Standard mode: Use coordinate-based swipes
      logger.debug("[SwipeOn] TalkBack disabled, using standard swipe");
      return this.executeGesture.swipe(x1, y1, x2, y2, gestureOptions, perf);
    }
  }

  /**
   * Execute swipe using accessibility actions (TalkBack mode).
   * Tries ACTION_SCROLL first if container is known, falls back to two-finger swipe.
   */
  private async executeAndroidSwipeWithAccessibility(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    direction: SwipeDirection,
    containerElement: Element | null,
    gestureOptions?: GestureOptions,
    perf?: PerformanceTracker
  ): Promise<SwipeResult> {
    // Try accessibility scroll actions if container is known and has resource-id
    if (containerElement && containerElement["resource-id"]) {
      try {
        // Clear accessibility focus before scrolling to ensure scroll affects content
        logger.debug("[SwipeOn] Clearing accessibility focus before scroll");
        await this.accessibilityService.requestAction("clear_focus", containerElement["resource-id"]);
      } catch (error) {
        logger.warn(`[SwipeOn] Failed to clear accessibility focus: ${error}`);
        // Continue anyway
      }

      // Map swipe direction to scroll action
      const scrollAction = (direction === "up" || direction === "left")
        ? "scroll_backward"
        : "scroll_forward";

      logger.info(`[SwipeOn] Attempting ACTION_SCROLL (${scrollAction}) on container: ${containerElement["resource-id"]}`);

      try {
        const result = await this.accessibilityService.requestAction(
          scrollAction,
          containerElement["resource-id"]
        );

        if (result.success) {
          logger.info("[SwipeOn] ACTION_SCROLL succeeded");
          return {
            success: true,
            x1,
            y1,
            x2,
            y2,
            duration: gestureOptions?.duration || 300
          };
        } else {
          logger.warn(`[SwipeOn] ACTION_SCROLL failed: ${result.error}, falling back to two-finger swipe`);
        }
      } catch (error) {
        logger.warn(`[SwipeOn] ACTION_SCROLL error: ${error}, falling back to two-finger swipe`);
      }
    } else {
      logger.debug("[SwipeOn] No container with resource-id, skipping ACTION_SCROLL");
    }

    // Fallback to two-finger swipe
    logger.info("[SwipeOn] Using two-finger swipe gesture for TalkBack");
    const duration = gestureOptions?.duration || 300;
    const offset = 100; // Fixed offset as per design doc

    const a11yResult = await this.accessibilityService.requestTwoFingerSwipe(
      x1, y1, x2, y2,
      duration,
      offset,
      5000,
      perf || new NoOpPerformanceTracker()
    );

    if (a11yResult.success) {
      return {
        success: true,
        x1,
        y1,
        x2,
        y2,
        duration
      };
    } else {
      throw new ActionableError(
        `Two-finger swipe failed: ${a11yResult.error || "Unknown error"}`
      );
    }
  }

  private async getScrollableContext(): Promise<{
    scrollables: Element[];
    candidates: ScrollableCandidate[];
    observeResult?: ObserveResult;
  }> {
    let observeResult = await this.observeScreen.getMostRecentCachedObserveResult();
    if (!observeResult.viewHierarchy || observeResult.viewHierarchy.hierarchy?.error) {
      observeResult = await this.observeScreen.execute();
    }

    if (!observeResult.viewHierarchy) {
      return { scrollables: [], candidates: [], observeResult };
    }

    const scrollables = this.elementUtils.findScrollableElements(observeResult.viewHierarchy);
    const candidates = this.buildScrollableCandidates(scrollables);
    return { scrollables, candidates, observeResult };
  }

  private buildScrollableCandidates(scrollables: Element[]): ScrollableCandidate[] {
    const candidates: ScrollableCandidate[] = [];
    const seen = new Set<string>();

    for (const scrollable of scrollables) {
      const candidate: ScrollableCandidate = {
        elementId: scrollable["resource-id"],
        text: scrollable.text,
        contentDesc: scrollable["content-desc"],
        className: scrollable.class
      };

      if (!candidate.elementId && !candidate.text && !candidate.contentDesc && !candidate.className) {
        continue;
      }

      const key = `${candidate.elementId ?? ""}|${candidate.text ?? ""}|${candidate.contentDesc ?? ""}|${candidate.className ?? ""}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      candidates.push(candidate);
    }

    return candidates;
  }

  /**
   * Execute a swipe operation
   * @param options - SwipeOn options
   * @param progress - Optional progress callback
   * @returns Result of the swipe operation
   */
  async execute(options: SwipeOnOptions, progress?: ProgressCallback): Promise<SwipeOnResult> {
    const perf = createGlobalPerformanceTracker();
    perf.serial("swipeOn");

    // Validate options
    const validationError = this.validateOptions(options);
    if (validationError) {
      perf.end();
      return this.createErrorResult(validationError);
    }

    const resolvedDirection = resolveSwipeDirection(options);
    if (resolvedDirection.error) {
      perf.end();
      return this.createErrorResult(resolvedDirection.error);
    }

    const normalizedOptions: SwipeOnResolvedOptions = {
      ...options,
      direction: resolvedDirection.direction as SwipeDirection
    };

    try {
      // Determine which mode to use
      if (normalizedOptions.lookFor) {
        // Scroll-until-visible mode
        return await this.executeScrollUntilVisible(normalizedOptions, progress, perf);
      } else if (!normalizedOptions.container) {
        const autoTargetEnabled = normalizedOptions.autoTarget !== false;
        if (!autoTargetEnabled) {
          return await this.executeScreenSwipe(normalizedOptions, progress, perf);
        }

        const scrollableContext = await this.getScrollableContext();
        if (scrollableContext.scrollables.length === 0) {
          return await this.executeScreenSwipe(normalizedOptions, progress, perf);
        }

        const screenBounds = scrollableContext.observeResult
          ? this.getScreenBounds(scrollableContext.observeResult)
          : null;
        const autoTargetElement = this.selectAutoTargetScrollable(
          scrollableContext.scrollables,
          screenBounds,
          normalizedOptions.direction
        );

        if (!autoTargetElement) {
          const result = await this.executeScreenSwipe(normalizedOptions, progress, perf);
          return {
            ...result,
            warning: "Scrollable containers found but none matched the swipe direction; swiping the screen. Set autoTarget: false to force screen swipes.",
            scrollableCandidates: scrollableContext.candidates
          };
        }

        const autoTargetContainer = this.buildContainerFromElement(autoTargetElement);
        if (!autoTargetContainer) {
          const result = await this.executeScreenSwipe(normalizedOptions, progress, perf);
          return {
            ...result,
            warning: "Auto-targeted scrollable container lacks a usable identifier; swiping the screen. Provide container.elementId or container.text to target it explicitly.",
            scrollableCandidates: scrollableContext.candidates
          };
        }

        const autoTargetResult = await this.executeElementSwipe(
          { ...normalizedOptions, container: autoTargetContainer },
          progress,
          perf
        );

        return {
          ...autoTargetResult,
          warning: `Auto-targeted scrollable container (${this.describeContainer(autoTargetContainer)}). Set autoTarget: false to force full-screen swipes.`,
          scrollableCandidates: scrollableContext.candidates
        };
      } else {
        // Container specified = swipe within container
        return await this.executeElementSwipe(normalizedOptions, progress, perf);
      }
    } catch (error) {
      perf.end();

      // Build debug context if debug mode is enabled and we have search criteria
      const debugContext = normalizedOptions.lookFor || normalizedOptions.container
        ? await buildElementSearchDebugContext(
          this.device,
          {
            text: normalizedOptions.lookFor?.text,
            resourceId: normalizedOptions.lookFor?.elementId || normalizedOptions.container?.elementId,
            container: normalizedOptions.container
          }
        )
        : undefined;

      // Return error result with debug info instead of throwing
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to perform swipeOn: ${errorMessage}`,
        targetType: normalizedOptions.container ? "element" : "screen",
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
        duration: 0,
        ...(debugContext ? { debug: { elementSearch: debugContext } } : {})
      };
    }
  }

  /**
   * Validate swipeOn options
   */
  private validateOptions(options: SwipeOnOptions): string | null {
    // Validate container if specified
    if (options.container) {
      const containerFieldCount = [options.container.elementId, options.container.text].filter(Boolean).length;
      if (containerFieldCount === 0) {
        return "container must specify exactly one of elementId or text";
      }
      if (containerFieldCount > 1) {
        return "container must specify exactly one of elementId or text";
      }
    }

    // If lookFor is specified, validate it
    if (options.lookFor) {
      if (!options.lookFor.text && !options.lookFor.elementId) {
        return "lookFor requires either text or elementId to search for";
      }
    }

    return null;
  }

  private getScreenBounds(observeResult: ObserveResult): Element["bounds"] | null {
    if (!observeResult.screenSize) {
      return null;
    }

    const insets = observeResult.systemInsets || { top: 0, right: 0, bottom: 0, left: 0 };
    return {
      left: insets.left,
      top: insets.top,
      right: observeResult.screenSize.width - insets.right,
      bottom: observeResult.screenSize.height - insets.bottom
    };
  }

  private selectAutoTargetScrollable(
    scrollables: Element[],
    screenBounds: Element["bounds"] | null,
    direction: SwipeDirection
  ): Element | null {
    if (scrollables.length === 0) {
      return null;
    }

    if (scrollables.length === 1) {
      return this.matchesDirection(scrollables[0], direction) ? scrollables[0] : null;
    }

    const nonScreenScrollables = screenBounds
      ? scrollables.filter(scrollable => !this.boundsEqual(scrollable.bounds, screenBounds))
      : scrollables.slice();

    const candidates = nonScreenScrollables.length > 0 ? nonScreenScrollables : scrollables;
    return this.pickLargestScrollable(candidates);
  }

  private pickLargestScrollable(scrollables: Element[]): Element | null {
    if (scrollables.length === 0) {
      return null;
    }

    return scrollables.reduce((largest, current) => {
      const largestArea = this.boundsArea(largest.bounds);
      const currentArea = this.boundsArea(current.bounds);
      return currentArea > largestArea ? current : largest;
    });
  }

  private boundsArea(bounds: Element["bounds"]): number {
    return Math.max(0, bounds.right - bounds.left) * Math.max(0, bounds.bottom - bounds.top);
  }

  private boundsEqual(a: Element["bounds"], b: Element["bounds"]): boolean {
    return a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom;
  }

  private matchesDirection(element: Element, direction: SwipeDirection): boolean {
    const width = Math.abs(element.bounds.right - element.bounds.left);
    const height = Math.abs(element.bounds.bottom - element.bounds.top);

    if (direction === "up" || direction === "down") {
      return height >= width;
    }

    return width >= height;
  }

  private buildContainerFromElement(element: Element): SwipeOnOptions["container"] | null {
    if (element["resource-id"]) {
      return { elementId: element["resource-id"] };
    }
    if (element.text) {
      return { text: element.text };
    }
    if (element["content-desc"]) {
      return { text: element["content-desc"] };
    }
    if (element["ios-accessibility-label"]) {
      return { text: element["ios-accessibility-label"] };
    }
    return null;
  }

  private describeContainer(container: SwipeOnOptions["container"]): string {
    if (!container) {
      return "unknown";
    }
    if (container.elementId) {
      return `elementId="${container.elementId}"`;
    }
    if (container.text) {
      return `text="${container.text}"`;
    }
    return "unknown";
  }

  private buildPredictionArgs(options: SwipeOnOptions): Record<string, any> {
    return {
      includeSystemInsets: options.includeSystemInsets,
      container: options.container,
      autoTarget: options.autoTarget,
      direction: options.direction,
      lookFor: options.lookFor,
      speed: options.speed,
      platform: this.device.platform
    };
  }

  /**
   * Execute a full-screen swipe
   */
  private async executeScreenSwipe(
    options: SwipeOnResolvedOptions,
    progress?: ProgressCallback,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<SwipeOnResult> {
    logger.info(`[SwipeOn] Starting screen swipe: direction=${options.direction}`);

    return this.observedInteraction(
      async (observeResult: ObserveResult) => {
        if (!observeResult.screenSize) {
          throw new ActionableError("Could not determine screen size");
        }

        const screenWidth = observeResult.screenSize.width;
        const screenHeight = observeResult.screenSize.height;
        const insets = observeResult.systemInsets || { top: 0, right: 0, bottom: 0, left: 0 };

        // Calculate bounds based on system insets
        const bounds = (options.includeSystemInsets === true)
          ? { left: 0, top: 0, right: screenWidth, bottom: screenHeight }
          : {
            left: insets.left,
            top: insets.top,
            right: screenWidth - insets.right,
            bottom: screenHeight - insets.bottom
          };

        const { startX, startY, endX, endY } = this.elementUtils.getSwipeWithinBounds(
          options.direction,
          bounds
        );

        const duration = this.getDuration(options);
        const gestureOptions: GestureOptions = {
          duration,
          scrollMode: options.scrollMode
        };

        const swipeResult = await perf.track("executeScreenSwipe", () =>
          this.executeSwipeGesture(
            Math.floor(startX),
            Math.floor(startY),
            Math.floor(endX),
            Math.floor(endY),
            options.direction,
            null, // No container for screen swipe
            gestureOptions,
            perf
          )
        );

        perf.end();
        return {
          ...swipeResult,
          targetType: "screen" as const
        };
      },
      {
        changeExpected: false,
        timeoutMs: 500,
        progress,
        perf,
        predictionContext: {
          toolName: "swipeOn",
          toolArgs: this.buildPredictionArgs(options)
        }
      }
    );
  }

  /**
   * Execute a swipe on a specific element (with optional simple scroll)
   */
  private async executeElementSwipe(
    options: SwipeOnResolvedOptions,
    progress?: ProgressCallback,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<SwipeOnResult> {
    logger.info(`[SwipeOn] Starting element swipe: direction=${options.direction}, container=${JSON.stringify(options.container)}`);

    return this.observedInteraction(
      async (observeResult: ObserveResult) => {
        const viewHierarchy = observeResult.viewHierarchy;
        if (!viewHierarchy) {
          throw new ActionableError("Unable to get view hierarchy, cannot swipe on element");
        }

        // Find the container element
        const element = await perf.track("findElement", () =>
          this.findTargetElement(options, viewHierarchy)
        );

        const { startX, startY, endX, endY } = this.elementUtils.getSwipeWithinBounds(
          options.direction,
          element.bounds
        );

        const duration = this.getDuration(options);
        const gestureOptions: GestureOptions = {
          duration,
          scrollMode: options.scrollMode
        };

        const swipeResult = await perf.track("executeElementSwipe", () =>
          this.executeSwipeGesture(
            Math.floor(startX),
            Math.floor(startY),
            Math.floor(endX),
            Math.floor(endY),
            options.direction,
            element, // Use the container element
            gestureOptions,
            perf
          )
        );

        perf.end();
        return {
          ...swipeResult,
          targetType: "element" as const,
          element
        };
      },
      {
        queryOptions: {
          text: options.container?.text,
          elementId: options.container?.elementId,
          containerElementId: undefined // No nested container restriction
        },
        changeExpected: false,
        timeoutMs: 500,
        progress,
        perf,
        predictionContext: {
          toolName: "swipeOn",
          toolArgs: this.buildPredictionArgs(options)
        }
      }
    );
  }

  /**
   * Execute scroll-until-visible operation
   */
  private async executeScrollUntilVisible(
    options: SwipeOnResolvedOptions,
    progress?: ProgressCallback,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<SwipeOnResult> {
    logger.info(`[SwipeOn] Starting scroll-until-visible: direction=${options.direction}, lookFor=${JSON.stringify(options.lookFor)}`);

    // Get initial observation
    let lastObservation = await perf.track("initialObserve", () => this.observeScreen.execute());
    if (!lastObservation.viewHierarchy || !lastObservation.screenSize) {
      throw new Error("Failed to get initial observation for scrolling until visible.");
    }

    // Find the scrollable container
    const containerElement = await perf.track("findContainer", () =>
      this.findScrollableContainer(options, lastObservation)
    );

    logger.info(`[SwipeOn] Using container: bounds=${JSON.stringify(containerElement.bounds)}, scrollable=${containerElement.scrollable}`);

    // Calculate container height as percentage of screen height
    const containerHeight = containerElement.bounds.bottom - containerElement.bounds.top;
    const screenHeight = lastObservation.screenSize!.height;
    const heightPercentage = (containerHeight / screenHeight) * 100;

    // Limit speed for lookFor to prevent skipping elements
    // Large containers (≥80% screen height) → max "normal" speed
    // Smaller containers → max "slow" speed
    let effectiveSpeed = options.speed;
    if (heightPercentage >= 80) {
      if (!effectiveSpeed || effectiveSpeed === "fast") {
        effectiveSpeed = "normal";
        logger.info(`[SwipeOn] Container is ${heightPercentage.toFixed(1)}% of screen height, limiting lookFor speed to "normal"`);
      }
    } else {
      if (!effectiveSpeed || effectiveSpeed === "normal" || effectiveSpeed === "fast") {
        effectiveSpeed = "slow";
        logger.info(`[SwipeOn] Container is ${heightPercentage.toFixed(1)}% of screen height, limiting lookFor speed to "slow"`);
      }
    }

    // Override options speed for the duration calculations
    const lookForOptions = { ...options, speed: effectiveSpeed };

    const maxTime = options.lookFor!.maxTime ?? 15000;
    const startTime = Date.now();
    let foundElement: Element | null = null;
    let scrollIteration = 0;
    let lastFingerprint = this.computeHierarchyFingerprint(lastObservation.viewHierarchy!);
    let unchangedScrollCount = 0;
    const maxUnchangedScrolls = 3;

    const target = options.lookFor!.text
      ? `text "${options.lookFor!.text}"`
      : `element with id "${options.lookFor!.elementId}"`;
    logger.info(`[SwipeOn] Looking for ${target} with maxTime=${maxTime}ms`);

    // First check if element is already visible
    foundElement = await perf.track("initialSearch", () =>
      this.findElementInHierarchy(options.lookFor!, lastObservation.viewHierarchy!, options.container)
    );

    if (foundElement) {
      logger.info(`[SwipeOn] Element already visible, no scrolling needed`);
      perf.end();
      return {
        success: true,
        targetType: "element",
        element: foundElement,
        found: true,
        scrollIterations: 0,
        elapsedMs: Date.now() - startTime,
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
        duration: 0,
        observation: lastObservation
      };
    }

    // Scroll until element is found
    while (Date.now() - startTime < maxTime) {
      scrollIteration++;
      logger.info(`[SwipeOn] Iteration ${scrollIteration}: elapsed=${Date.now() - startTime}ms`);

      // Perform scroll
      const swipeDuration = this.getDuration(lookForOptions);
      // Use direction directly (finger swipe direction) for consistency with regular swipes
      const { startX, startY, endX, endY } = this.elementUtils.getSwipeWithinBounds(
        options.direction,
        containerElement.bounds
      );

      const gestureOptions: GestureOptions = {
        duration: swipeDuration,
        scrollMode: options.scrollMode
      };

      // Execute swipe with observedInteraction
      const swipeResult = await this.observedInteraction(
        async () => {
          return await this.executeSwipeGesture(
            Math.floor(startX),
            Math.floor(startY),
            Math.floor(endX),
            Math.floor(endY),
            options.direction,
            containerElement, // Use the container element
            gestureOptions,
            perf
          );
        },
        {
          changeExpected: false,
          timeoutMs: 500,
          progress,
          perf,
          skipPreviousObserve: scrollIteration > 1, // Skip previous observe after first iteration
          predictionContext: {
            toolName: "swipeOn",
            toolArgs: this.buildPredictionArgs(options)
          }
        }
      );

      // Update observation
      if (swipeResult.observation && swipeResult.observation.viewHierarchy) {
        lastObservation = swipeResult.observation;
      } else {
        throw new Error("Lost observation after swipe during scroll until visible.");
      }

      // Check if hierarchy changed (detect scroll end)
      const currentFingerprint = this.computeHierarchyFingerprint(lastObservation.viewHierarchy!);

      if (currentFingerprint === lastFingerprint) {
        unchangedScrollCount++;
        logger.info(`[SwipeOn] Iteration ${scrollIteration}: hierarchy unchanged (${unchangedScrollCount}/${maxUnchangedScrolls})`);

        if (unchangedScrollCount >= maxUnchangedScrolls) {
          perf.end();
          const elapsed = Date.now() - startTime;
          throw new ActionableError(
            `Scroll reached end of container (no change after ${maxUnchangedScrolls} scrolls). ` +
            `${target} not found after ${scrollIteration} iterations (${elapsed}ms).`
          );
        }
      } else {
        unchangedScrollCount = 0;
        lastFingerprint = currentFingerprint;
      }

      // Check if target element is now visible
      foundElement = await this.findElementInHierarchy(
        options.lookFor!,
        lastObservation.viewHierarchy!,
        options.container
      );

      if (foundElement) {
        const elapsed = Date.now() - startTime;
        logger.info(`[SwipeOn] Found ${target} after ${scrollIteration} iterations (${elapsed}ms)`);
        break;
      }
    }

    if (!foundElement) {
      perf.end();
      const elapsed = Date.now() - startTime;
      throw new ActionableError(
        `${target} not found after scrolling for ${elapsed}ms (${scrollIteration} iterations, timeout=${maxTime}ms).`
      );
    }

    perf.end();
    return {
      success: true,
      targetType: "element",
      element: foundElement,
      found: true,
      scrollIterations: scrollIteration,
      elapsedMs: Date.now() - startTime,
      observation: lastObservation,
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      duration: 0
    };
  }

  /**
   * Find target element with retry logic
   */
  private async findTargetElement(
    options: SwipeOnOptions,
    viewHierarchy: ViewHierarchyResult,
    attempt: number = 0
  ): Promise<Element> {
    let element: Element | null = null;

    if (!options.container) {
      throw new ActionableError("Container must be specified for element swipe");
    }

    if (options.container.text) {
      element = this.elementUtils.findElementByText(
        viewHierarchy,
        options.container.text,
        undefined, // No nested container
        true,
        false
      );
    } else if (options.container.elementId) {
      element = this.elementUtils.findElementByResourceId(
        viewHierarchy,
        options.container.elementId,
        undefined // No nested container
      );
    } else {
      throw new ActionableError("Container must specify either text or elementId");
    }

    // Retry logic similar to TapOnElement
    if (!element && attempt < SwipeOn.MAX_ATTEMPTS) {
      const delayNextAttempt = Math.min(10 * Math.pow(2, attempt), 1000);
      await new Promise(resolve => setTimeout(resolve, delayNextAttempt));

      let latestViewHierarchy: ViewHierarchyResult | null = null;

      switch (this.device.platform) {
        case "android":
          const queryOptions = {
            query: options.container.text || options.container.elementId || "",
            containerElementId: undefined
          };
          latestViewHierarchy = await this.accessibilityService.getAccessibilityHierarchy(queryOptions);
          break;
        case "ios":
          latestViewHierarchy = await this.webdriver.getViewHierarchy(this.device);
          break;
        default:
          throw new ActionableError(`Unsupported platform: ${this.device.platform}`);
      }

      if (latestViewHierarchy) {
        logger.info(`Retrying to find element after ${delayNextAttempt}ms delay`);
        return await this.findTargetElement(options, latestViewHierarchy, attempt + 1);
      }
    }

    if (!element) {
      if (options.container.text) {
        throw new ActionableError(`Element not found with provided text '${options.container.text}'`);
      } else {
        throw new ActionableError(`Element not found with provided elementId '${options.container.elementId}'`);
      }
    }

    return element;
  }

  /**
   * Find scrollable container element
   */
  private async findScrollableContainer(
    options: SwipeOnOptions,
    observeResult: ObserveResult
  ): Promise<Element> {
    let element: Element | null = null;
    const viewHierarchy = observeResult.viewHierarchy!;

    // Try to find container by elementId or text
    if (options.container?.elementId) {
      element = this.elementUtils.findElementByResourceId(
        viewHierarchy,
        options.container.elementId
      );
    } else if (options.container?.text) {
      element = this.elementUtils.findElementByText(
        viewHierarchy,
        options.container.text,
        undefined,
        true,
        false
      );
    }

    // If no container specified or found, try to find a scrollable element
    if (!element) {
      // Look for common scrollable containers
      const scrollableElement = this.elementUtils.findScrollableContainer(viewHierarchy);
      if (scrollableElement) {
        element = scrollableElement;
        logger.info(`[SwipeOn] Found scrollable container automatically`);
      }
    }

    // If still no element, use screen bounds as container
    if (!element) {
      logger.info(`[SwipeOn] No scrollable container found, using screen bounds`);
      // Create a pseudo-element representing the whole screen
      const screenSize = observeResult.screenSize || { width: 1080, height: 1920 };
      const insets = observeResult.systemInsets || { top: 0, right: 0, bottom: 0, left: 0 };

      element = {
        bounds: {
          left: insets.left,
          top: insets.top,
          right: screenSize.width - insets.right,
          bottom: screenSize.height - insets.bottom
        },
        scrollable: true
      } as Element;
    }

    return element;
  }

  /**
   * Find element in hierarchy by text or elementId
   */
  private async findElementInHierarchy(
    lookFor: { text?: string; elementId?: string },
    viewHierarchy: ViewHierarchyResult,
    container?: { elementId?: string; text?: string }
  ): Promise<Element | null> {
    if (lookFor.text) {
      return this.elementUtils.findElementByText(
        viewHierarchy,
        lookFor.text,
        container,
        true,
        false
      );
    } else if (lookFor.elementId) {
      return this.elementUtils.findElementByResourceId(
        viewHierarchy,
        lookFor.elementId,
        container,
        true
      );
    }
    return null;
  }

  /**
   * Compute fingerprint of view hierarchy for change detection
   */
  private computeHierarchyFingerprint(viewHierarchy: ViewHierarchyResult): string {
    if (!viewHierarchy.hierarchy) {
      return "";
    }

    // Simple fingerprint based on hierarchy structure
    return JSON.stringify(viewHierarchy.hierarchy).slice(0, 1000);
  }

  /**
   * Get swipe duration from options
   */
  private getDuration(options: SwipeOnResolvedOptions): number {
    if (options.duration !== undefined) {
      return options.duration;
    }

    return this.elementUtils.getSwipeDurationFromSpeed(options.speed);
  }
}
