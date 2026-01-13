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
  ViewHierarchyNode,
  ViewHierarchyResult,
  GestureOptions
} from "../../models";
import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { AxeClient } from "../../utils/ios-cmdline-tools/AxeClient";
import { ElementUtils } from "../utility/ElementUtils";
import { ElementParser } from "../utility/ElementParser";
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

type SwipeInterval = { start: number; end: number; length: number };
type BoomerangConfig = { apexPauseMs: number; returnSpeed: number };
type OverlayCandidate = {
  bounds: Element["bounds"];
  overlapBounds: Element["bounds"];
  coverage: number;
  zOrder: { windowRank: number; nodeOrder: number };
};

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
  private static readonly OVERLAY_PADDING = 8;
  private static readonly CANDIDATE_FRACTIONS = [0.5, 0.25, 0.75, 0.15, 0.85];
  private static readonly DEFAULT_APEX_PAUSE_MS = 100;
  private static readonly DEFAULT_RETURN_SPEED = 1;

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
    perf?: PerformanceTracker,
    boomerang?: BoomerangConfig
  ): Promise<SwipeResult> {
    const boomerangEnabled = Boolean(boomerang);

    // Only check TalkBack for Android platform
    if (this.device.platform !== "android") {
      if (boomerangEnabled) {
        return this.executeBoomerangGesture(x1, y1, x2, y2, gestureOptions, boomerang!, perf);
      }
      return this.executeGesture.swipe(x1, y1, x2, y2, gestureOptions, perf);
    }

    // Check if TalkBack is enabled
    const isTalkBackEnabled = await this.accessibilityDetector.isAccessibilityEnabled(
      this.device.id,
      this.adb!
    );

    if (isTalkBackEnabled) {
      if (boomerangEnabled) {
        logger.info("[SwipeOn] TalkBack enabled, boomerang requested; announcing swipeable element");
        return this.announceSwipeable(x1, y1, x2, y2, containerElement, gestureOptions, perf);
      }

      logger.info("[SwipeOn] TalkBack enabled, using accessibility-aware swipe");
      return this.executeAndroidSwipeWithAccessibility(
        x1, y1, x2, y2,
        direction,
        containerElement,
        gestureOptions,
        perf
      );
    } else {
      if (boomerangEnabled) {
        logger.debug("[SwipeOn] TalkBack disabled, using boomerang swipe");
        return this.executeBoomerangGesture(x1, y1, x2, y2, gestureOptions, boomerang!, perf);
      }

      // Standard mode: Use coordinate-based swipes
      logger.debug("[SwipeOn] TalkBack disabled, using standard swipe");
      return this.executeGesture.swipe(x1, y1, x2, y2, gestureOptions, perf);
    }
  }

  private async executeBoomerangGesture(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    gestureOptions: GestureOptions | undefined,
    boomerang: BoomerangConfig,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<SwipeResult> {
    const forwardDuration = gestureOptions?.duration ?? 300;
    const returnDuration = this.getReturnDuration(forwardDuration, boomerang.returnSpeed);
    const totalDuration = forwardDuration + boomerang.apexPauseMs + returnDuration;

    const forwardOptions = this.buildGestureOptions(gestureOptions, forwardDuration);
    const returnOptions = this.buildGestureOptions(gestureOptions, returnDuration);

    const forwardResult = await this.executeGesture.swipe(x1, y1, x2, y2, forwardOptions, perf);
    if (!forwardResult.success) {
      return forwardResult;
    }

    if (boomerang.apexPauseMs > 0) {
      await this.timer.sleep(boomerang.apexPauseMs);
    }

    const returnResult = await this.executeGesture.swipe(x2, y2, x1, y1, returnOptions, perf);
    if (!returnResult.success) {
      return {
        ...returnResult,
        x1,
        y1,
        x2,
        y2,
        duration: totalDuration
      };
    }

    return {
      ...forwardResult,
      x1,
      y1,
      x2,
      y2,
      duration: totalDuration,
      a11yTotalTimeMs: this.sumOptional(forwardResult.a11yTotalTimeMs, returnResult.a11yTotalTimeMs),
      a11yGestureTimeMs: this.sumOptional(forwardResult.a11yGestureTimeMs, returnResult.a11yGestureTimeMs),
      fallbackReason: forwardResult.fallbackReason ?? returnResult.fallbackReason
    };
  }

  private async announceSwipeable(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    containerElement: Element | null,
    gestureOptions?: GestureOptions,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<SwipeResult> {
    const duration = gestureOptions?.duration ?? 0;
    const resourceId = containerElement?.["resource-id"];

    if (!resourceId) {
      const error = "Boomerang swipe in TalkBack mode requires a container element with a resource-id.";
      logger.warn(`[SwipeOn] ${error}`);
      return {
        success: false,
        error,
        x1,
        y1,
        x2,
        y2,
        duration
      };
    }

    const result = await this.accessibilityService.requestAction(
      "focus",
      resourceId,
      5000,
      perf
    );

    if (!result.success) {
      const error = result.error ?? "Failed to set accessibility focus for boomerang swipe.";
      logger.warn(`[SwipeOn] ${error}`);
      return {
        success: false,
        error,
        x1,
        y1,
        x2,
        y2,
        duration
      };
    }

    return {
      success: true,
      x1,
      y1,
      x2,
      y2,
      duration
    };
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
      // When finger swipes up, content scrolls down (scroll_forward)
      // When finger swipes down, content scrolls up (scroll_backward)
      const scrollAction = (direction === "up" || direction === "left")
        ? "scroll_forward"
        : "scroll_backward";

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
          warning: this.mergeWarnings(
            autoTargetResult.warning,
            `Auto-targeted scrollable container (${this.describeContainer(autoTargetContainer)}). Set autoTarget: false to force full-screen swipes.`
          ),
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

    if (options.boomerang && options.lookFor) {
      return "boomerang cannot be used with lookFor";
    }

    if (!options.boomerang && (options.apexPause !== undefined || options.returnSpeed !== undefined)) {
      return "apexPause/returnSpeed require boomerang=true";
    }

    if (options.apexPause !== undefined && options.apexPause < 0) {
      return "apexPause must be >= 0";
    }

    if (options.returnSpeed !== undefined && options.returnSpeed <= 0) {
      return "returnSpeed must be > 0";
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

  private mergeWarnings(...warnings: Array<string | undefined>): string | undefined {
    const filtered = warnings.filter((warning): warning is string => Boolean(warning));
    if (filtered.length === 0) {
      return undefined;
    }
    return Array.from(new Set(filtered)).join(" ");
  }

  private buildPredictionArgs(options: SwipeOnOptions): Record<string, any> {
    return {
      includeSystemInsets: options.includeSystemInsets,
      container: options.container,
      autoTarget: options.autoTarget,
      direction: options.direction,
      lookFor: options.lookFor,
      speed: options.speed,
      boomerang: options.boomerang,
      apexPause: options.apexPause,
      returnSpeed: options.returnSpeed,
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
        const boomerang = this.resolveBoomerangConfig(options);
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
            perf,
            boomerang
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

        const { startX, startY, endX, endY, warning } = this.resolveContainerSwipeCoordinates(
          options,
          viewHierarchy,
          element,
          observeResult
        );

        const duration = this.getDuration(options);
        const boomerang = this.resolveBoomerangConfig(options);
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
            perf,
            boomerang
          )
        );

        perf.end();
        return {
          ...swipeResult,
          targetType: "element" as const,
          element,
          warning
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

  private resolveContainerSwipeCoordinates(
    options: SwipeOnResolvedOptions,
    viewHierarchy: ViewHierarchyResult,
    containerElement: Element,
    observeResult: ObserveResult
  ): { startX: number; startY: number; endX: number; endY: number; warning?: string } {
    // Apply system insets to container bounds when includeSystemInsets is false (default)
    let effectiveBounds = containerElement.bounds;
    if (options.includeSystemInsets !== true && observeResult.systemInsets) {
      const insets = observeResult.systemInsets;
      effectiveBounds = {
        left: Math.max(containerElement.bounds.left, insets.left),
        top: Math.max(containerElement.bounds.top, insets.top),
        right: Math.min(containerElement.bounds.right, observeResult.screenSize?.width ?? containerElement.bounds.right) - insets.right,
        bottom: Math.min(containerElement.bounds.bottom, observeResult.screenSize?.height ?? containerElement.bounds.bottom) - insets.bottom
      };
    }

    const defaultSwipe = this.elementUtils.getSwipeWithinBounds(
      options.direction,
      effectiveBounds
    );

    const overlayCandidates = this.collectOverlayCandidates(viewHierarchy, options.container, containerElement);
    if (overlayCandidates.length === 0) {
      return defaultSwipe;
    }

    // Pass all overlay bounds to find the best safe swipe path avoiding all overlays
    const allOverlayBounds = overlayCandidates.map(overlay => overlay.overlapBounds);
    const safeSwipe = this.computeSafeSwipeCoordinates(
      options.direction,
      effectiveBounds,
      allOverlayBounds
    );

    if (!safeSwipe) {
      return {
        ...defaultSwipe,
        warning: "No unobstructed swipe area found; using container bounds."
      };
    }

    return safeSwipe;
  }

  private collectOverlayCandidates(
    viewHierarchy: ViewHierarchyResult,
    container: SwipeOnOptions["container"] | undefined,
    containerElement: Element
  ): OverlayCandidate[] {
    const containerSelector = container ?? this.buildContainerFromElement(containerElement);
    if (!containerSelector) {
      return [];
    }

    const containerNode = this.elementUtils.findContainerNode(viewHierarchy, containerSelector);
    const parser = new ElementParser();

    const windowRootGroups = parser.extractWindowRootGroups(viewHierarchy, "topmost-first");
    const rootGroups = windowRootGroups.length > 0
      ? windowRootGroups
      : [parser.extractRootNodes(viewHierarchy)];
    const totalWindows = Math.max(1, rootGroups.length);

    const overlays: OverlayCandidate[] = [];
    const seenNodes = new Set<ViewHierarchyNode>();
    const containerBounds = containerElement.bounds;

    rootGroups.forEach((rootNodes, windowIndex) => {
      const windowRank = totalWindows - windowIndex;
      let nodeOrder = 0;

      for (const rootNode of rootNodes) {
        // Track whether we're inside the container subtree
        let insideContainer = false;
        let containerDepth = -1;

        parser.traverseNode(rootNode, (node: ViewHierarchyNode, depth: number) => {
          if (seenNodes.has(node)) {
            return;
          }

          seenNodes.add(node);
          const currentOrder = nodeOrder++;

          const nodeProperties = parser.extractNodeProperties(node);

          // Check if this is the container node
          if (this.isContainerNode(node, nodeProperties, containerNode, containerElement, containerBounds)) {
            insideContainer = true;
            containerDepth = depth;
            return; // Skip the container itself
          }

          // If we were inside the container but have backtracked (depth <= containerDepth),
          // we've exited the container subtree
          if (insideContainer && depth <= containerDepth) {
            insideContainer = false;
            containerDepth = -1;
          }

          // Skip nodes that are inside the container (descendants of container)
          if (insideContainer) {
            return;
          }

          if (!this.isClickableNode(nodeProperties)) {
            return;
          }

          const parsedNode = parser.parseNodeBounds(node);
          if (!parsedNode) {
            return;
          }

          const overlapBounds = this.intersectBounds(containerBounds, parsedNode.bounds);
          if (!overlapBounds) {
            return;
          }

          const coverage = this.boundsArea(overlapBounds);
          if (coverage <= 0) {
            return;
          }

          overlays.push({
            bounds: parsedNode.bounds,
            overlapBounds,
            coverage,
            zOrder: { windowRank, nodeOrder: currentOrder }
          });
        });
      }
    });

    return overlays;
  }


  private intersectBounds(a: Element["bounds"], b: Element["bounds"]): Element["bounds"] | null {
    const left = Math.max(a.left, b.left);
    const right = Math.min(a.right, b.right);
    const top = Math.max(a.top, b.top);
    const bottom = Math.min(a.bottom, b.bottom);

    if (right <= left || bottom <= top) {
      return null;
    }

    return { left, top, right, bottom };
  }

  private computeSafeSwipeCoordinates(
    direction: SwipeDirection,
    bounds: Element["bounds"],
    overlayBounds: Element["bounds"][]
  ): { startX: number; startY: number; endX: number; endY: number; warning?: string } | null {
    const isVertical = direction === "up" || direction === "down";
    const primaryStart = isVertical ? bounds.top : bounds.left;
    const primaryEnd = isVertical ? bounds.bottom : bounds.right;
    const secondaryStart = isVertical ? bounds.left : bounds.top;
    const secondaryEnd = isVertical ? bounds.right : bounds.bottom;

    const candidates = this.buildCandidateCoordinates(secondaryStart, secondaryEnd);
    let bestCandidate: { coordinate: number; interval: SwipeInterval } | null = null;

    for (const coordinate of candidates) {
      const blocked = isVertical
        ? this.getBlockedIntervalsForX(overlayBounds, bounds, coordinate)
        : this.getBlockedIntervalsForY(overlayBounds, bounds, coordinate);

      const largestGap = this.findLargestGap(primaryStart, primaryEnd, blocked);
      if (!largestGap) {
        continue;
      }

      if (!bestCandidate || largestGap.length > bestCandidate.interval.length) {
        bestCandidate = { coordinate, interval: largestGap };
      }
    }

    if (!bestCandidate) {
      return null;
    }

    const safeBounds = isVertical
      ? {
        left: bounds.left,
        right: bounds.right,
        top: bestCandidate.interval.start,
        bottom: bestCandidate.interval.end
      }
      : {
        left: bestCandidate.interval.start,
        right: bestCandidate.interval.end,
        top: bounds.top,
        bottom: bounds.bottom
      };

    const swipe = this.elementUtils.getSwipeWithinBounds(direction, safeBounds);
    let { startX, startY, endX, endY } = swipe;

    if (isVertical) {
      startX = bestCandidate.coordinate;
      endX = bestCandidate.coordinate;
    } else {
      startY = bestCandidate.coordinate;
      endY = bestCandidate.coordinate;
    }

    startX = this.clamp(startX, safeBounds.left, safeBounds.right);
    endX = this.clamp(endX, safeBounds.left, safeBounds.right);
    startY = this.clamp(startY, safeBounds.top, safeBounds.bottom);
    endY = this.clamp(endY, safeBounds.top, safeBounds.bottom);

    const primaryLength = Math.max(1, primaryEnd - primaryStart);
    const minDistance = Math.max(50, primaryLength * 0.1);
    const warning = bestCandidate.interval.length < minDistance
      ? `Swipe area reduced by overlaying elements; safe ${isVertical ? "height" : "width"} is ${Math.round(bestCandidate.interval.length)}px.`
      : undefined;

    return { startX, startY, endX, endY, warning };
  }

  private getBlockedIntervalsForX(
    overlayBounds: Element["bounds"][],
    containerBounds: Element["bounds"],
    x: number
  ): SwipeInterval[] {
    const intervals: SwipeInterval[] = [];
    for (const overlay of overlayBounds) {
      const expanded = this.expandBounds(overlay, SwipeOn.OVERLAY_PADDING);
      if (x < expanded.left || x > expanded.right) {
        continue;
      }

      const start = Math.max(containerBounds.top, expanded.top);
      const end = Math.min(containerBounds.bottom, expanded.bottom);
      if (end > start) {
        intervals.push({ start, end, length: end - start });
      }
    }
    return intervals;
  }

  private getBlockedIntervalsForY(
    overlayBounds: Element["bounds"][],
    containerBounds: Element["bounds"],
    y: number
  ): SwipeInterval[] {
    const intervals: SwipeInterval[] = [];
    for (const overlay of overlayBounds) {
      const expanded = this.expandBounds(overlay, SwipeOn.OVERLAY_PADDING);
      if (y < expanded.top || y > expanded.bottom) {
        continue;
      }

      const start = Math.max(containerBounds.left, expanded.left);
      const end = Math.min(containerBounds.right, expanded.right);
      if (end > start) {
        intervals.push({ start, end, length: end - start });
      }
    }
    return intervals;
  }

  private findLargestGap(
    start: number,
    end: number,
    blockedIntervals: SwipeInterval[]
  ): SwipeInterval | null {
    const merged = this.mergeIntervals(blockedIntervals);
    let cursor = start;
    let best: SwipeInterval | null = null;

    for (const blocked of merged) {
      if (blocked.start > cursor) {
        const gap = { start: cursor, end: blocked.start, length: blocked.start - cursor };
        if (!best || gap.length > best.length) {
          best = gap;
        }
      }
      cursor = Math.max(cursor, blocked.end);
    }

    if (cursor < end) {
      const gap = { start: cursor, end, length: end - cursor };
      if (!best || gap.length > best.length) {
        best = gap;
      }
    }

    return best;
  }

  private mergeIntervals(intervals: SwipeInterval[]): SwipeInterval[] {
    const sorted = intervals
      .filter(interval => interval.end > interval.start)
      .sort((a, b) => a.start - b.start);

    const merged: SwipeInterval[] = [];
    for (const interval of sorted) {
      const last = merged[merged.length - 1];
      if (!last || interval.start > last.end) {
        merged.push({ ...interval });
        continue;
      }
      last.end = Math.max(last.end, interval.end);
      last.length = last.end - last.start;
    }

    return merged;
  }

  private buildCandidateCoordinates(start: number, end: number): number[] {
    const size = end - start;
    if (size <= 0) {
      return [];
    }

    const candidates = SwipeOn.CANDIDATE_FRACTIONS.map(fraction =>
      Math.floor(start + size * fraction)
    );
    return Array.from(new Set(candidates.filter(candidate => candidate >= start && candidate <= end)));
  }

  private expandBounds(bounds: Element["bounds"], padding: number): Element["bounds"] {
    return {
      left: bounds.left - padding,
      top: bounds.top - padding,
      right: bounds.right + padding,
      bottom: bounds.bottom + padding
    };
  }

  private isClickableNode(nodeProperties: Record<string, unknown>): boolean {
    return this.isTruthyFlag(nodeProperties.clickable) || this.isTruthyFlag(nodeProperties.focusable);
  }

  private isContainerNode(
    node: ViewHierarchyNode,
    nodeProperties: Record<string, unknown>,
    containerNode: ViewHierarchyNode | null,
    containerElement: Element,
    containerBounds: Element["bounds"]
  ): boolean {
    if (containerNode && node === containerNode) {
      return true;
    }

    const resourceId = nodeProperties["resource-id"];
    if (containerElement["resource-id"] && resourceId === containerElement["resource-id"]) {
      return true;
    }

    const nodeText = nodeProperties.text;
    if (containerElement.text && nodeText === containerElement.text) {
      return true;
    }

    const nodeContentDesc = nodeProperties["content-desc"];
    if (containerElement["content-desc"] && nodeContentDesc === containerElement["content-desc"]) {
      return true;
    }

    if (!containerElement["resource-id"] && !containerElement.text && !containerElement["content-desc"]) {
      const parsedBounds = this.parseBoundsFromProperties(nodeProperties);
      if (parsedBounds && this.boundsEqual(parsedBounds, containerBounds)) {
        return true;
      }
    }

    return false;
  }

  private parseBoundsFromProperties(nodeProperties: Record<string, unknown>): Element["bounds"] | null {
    const bounds = nodeProperties.bounds;
    if (bounds && typeof bounds === "object") {
      const candidate = bounds as Element["bounds"];
      if (
        typeof candidate.left === "number" &&
        typeof candidate.top === "number" &&
        typeof candidate.right === "number" &&
        typeof candidate.bottom === "number"
      ) {
        return candidate;
      }
    }

    if (typeof bounds === "string") {
      const parsed = this.elementUtils.parseBounds(bounds);
      if (parsed) {
        return parsed;
      }
    }

    return null;
  }

  private isTruthyFlag(value: unknown): boolean {
    return value === true || value === "true";
  }

  private boundsOverlap(a: Element["bounds"], b: Element["bounds"]): boolean {
    return (
      a.left < b.right &&
      a.right > b.left &&
      a.top < b.bottom &&
      a.bottom > b.top
    );
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
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

    // Check if accessibility service (TalkBack) is enabled
    const isTalkBackEnabled = await perf.track("checkTalkBack", async () => {
      if (this.device.platform !== "android") {
        return false;
      }
      return await this.accessibilityDetector.isAccessibilityEnabled(
        this.device.deviceId,
        this.adb
      );
    });

    // First check if element is already visible
    foundElement = await perf.track("initialSearch", () =>
      this.findElementInHierarchy(options.lookFor!, lastObservation.viewHierarchy!, options.container)
    );

    if (foundElement) {
      logger.info(`[SwipeOn] Element already visible, no scrolling needed`);

      // Set accessibility focus on found element if requested
      if (isTalkBackEnabled && options.focusTarget) {
        await this.setAccessibilityFocusOnElement(foundElement, perf);
      }

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

    // Clear accessibility focus before scrolling (only when focusTarget is requested)
    if (isTalkBackEnabled && options.focusTarget) {
      try {
        await perf.track("clearAccessibilityFocus", async () => {
          await this.accessibilityService.clearAccessibilityFocus();
          logger.info("[SwipeOn] Cleared accessibility focus before scrolling (focusTarget requested)");
        });
      } catch (error) {
        logger.warn(`[SwipeOn] Failed to clear accessibility focus: ${error}`);
        // Continue anyway - this is not a critical failure
      }
    }

    const swipeCoordinates = this.resolveContainerSwipeCoordinates(
      options,
      lastObservation.viewHierarchy!,
      containerElement,
      lastObservation
    );
    const swipeWarning = swipeCoordinates.warning;

    // Scroll until element is found
    while (Date.now() - startTime < maxTime) {
      scrollIteration++;
      logger.info(`[SwipeOn] Iteration ${scrollIteration}: elapsed=${Date.now() - startTime}ms`);

      // Perform scroll
      const swipeDuration = this.getDuration(lookForOptions);
      // Use direction directly (finger swipe direction) for consistency with regular swipes
      const { startX, startY, endX, endY } = swipeCoordinates;

      const boomerang = this.resolveBoomerangConfig(options);
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
            perf,
            boomerang
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

    // Set accessibility focus on found element if requested
    if (isTalkBackEnabled && options.focusTarget) {
      await this.setAccessibilityFocusOnElement(foundElement, perf);
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
      duration: 0,
      warning: swipeWarning
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
   * Set accessibility focus on an element (TalkBack cursor).
   * This is a helper method that attempts to set focus using the element's resource ID.
   *
   * @param element - Element to set accessibility focus on
   * @param perf - Performance tracker
   */
  private async setAccessibilityFocusOnElement(
    element: Element,
    perf: PerformanceTracker
  ): Promise<void> {
    try {
      await perf.track("setAccessibilityFocus", async () => {
        const resourceId = element["resource-id"];
        if (!resourceId) {
          logger.warn("[SwipeOn] Cannot set accessibility focus: element has no resource-id");
          return;
        }

        await this.accessibilityService.setAccessibilityFocus(resourceId);
        logger.info(`[SwipeOn] Set accessibility focus on element: ${resourceId}`);
      });
    } catch (error) {
      logger.warn(`[SwipeOn] Failed to set accessibility focus: ${error}`);
      // Continue anyway - this is not a critical failure
    }
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

  private resolveBoomerangConfig(options: SwipeOnResolvedOptions): BoomerangConfig | undefined {
    if (!options.boomerang) {
      return undefined;
    }

    return {
      apexPauseMs: options.apexPause ?? SwipeOn.DEFAULT_APEX_PAUSE_MS,
      returnSpeed: options.returnSpeed ?? SwipeOn.DEFAULT_RETURN_SPEED
    };
  }

  private buildGestureOptions(base: GestureOptions | undefined, duration: number): GestureOptions {
    return {
      ...(base ?? {}),
      duration
    };
  }

  private getReturnDuration(forwardDuration: number, returnSpeed: number): number {
    return Math.max(1, Math.round(forwardDuration / returnSpeed));
  }

  private sumOptional(a?: number, b?: number): number | undefined {
    if (a === undefined && b === undefined) {
      return undefined;
    }
    return (a ?? 0) + (b ?? 0);
  }
}
