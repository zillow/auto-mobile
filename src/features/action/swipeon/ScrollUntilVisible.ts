import {
  ActionableError,
  BootedDevice,
  Element,
  GestureOptions,
  ObserveResult,
  SwipeOnOptions,
  SwipeOnResult,
  ViewHierarchyResult
} from "../../../models";
import { logger } from "../../../utils/logger";
import { PerformanceTracker, NoOpPerformanceTracker } from "../../../utils/PerformanceTracker";
import { AccessibilityServiceClient } from "../../observe/AccessibilityServiceClient";
import { XCTestServiceClient } from "../../observe/XCTestServiceClient";
import { ElementUtils } from "../../utility/ElementUtils";
import type { ObserveScreen } from "../../observe/interfaces/ObserveScreen";
import { AccessibilityDetector } from "../../../utils/interfaces/AccessibilityDetector";
import { serverConfig } from "../../../utils/ServerConfig";
import { Timer } from "../../../utils/SystemTimer";
import { SwipeOnResolvedOptions, BoomerangConfig } from "./types";
import { OverlayDetector } from "./OverlayDetector";
import { TalkBackSwipeExecutor } from "./TalkBackSwipeExecutor";

export interface ScrollUntilVisibleDependencies {
  device: BootedDevice;
  elementUtils: ElementUtils;
  observeScreen: ObserveScreen;
  accessibilityService: AccessibilityServiceClient;
  accessibilityDetector: AccessibilityDetector;
  overlayDetector: OverlayDetector;
  talkBackExecutor: TalkBackSwipeExecutor;
  timer: Timer;
  getDuration: (options: SwipeOnResolvedOptions) => number;
  resolveBoomerangConfig: (options: SwipeOnResolvedOptions) => BoomerangConfig | undefined;
  buildPredictionArgs: (options: SwipeOnOptions) => Record<string, unknown>;
  observedInteraction: <T>(
    action: (observeResult: ObserveResult) => Promise<T>,
    options: {
      changeExpected: boolean;
      timeoutMs: number;
      progress?: unknown;
      perf?: PerformanceTracker;
      skipPreviousObserve?: boolean;
      queryOptions?: {
        text?: string;
        elementId?: string;
        containerElementId?: string | undefined;
      };
      predictionContext?: {
        toolName: string;
        toolArgs: Record<string, unknown>;
      };
    }
  ) => Promise<T & { observation?: ObserveResult }>;
}

export class ScrollUntilVisible {
  private static readonly MAX_ATTEMPTS = 5;

  constructor(private readonly deps: ScrollUntilVisibleDependencies) {}

  async execute(
    options: SwipeOnResolvedOptions,
    progress?: unknown,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<SwipeOnResult> {
    logger.info(`[SwipeOn] Starting scroll-until-visible: direction=${options.direction}, lookFor=${JSON.stringify(options.lookFor)}`);

    // Get initial observation
    let lastObservation = await perf.track("initialObserve", () => this.deps.observeScreen.execute());
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
    const startTime = this.deps.timer.now();
    let foundElement: Element | null = null;
    let scrollIteration = 0;
    let lastFingerprint = this.computeHierarchyFingerprint(lastObservation.viewHierarchy!);
    let unchangedScrollCount = 0;
    const maxUnchangedScrolls = 3;

    const target = options.lookFor!.text
      ? `text "${options.lookFor!.text}"`
      : `element with id "${options.lookFor!.elementId}"`;
    logger.info(`[SwipeOn] Looking for ${target} with maxTime=${maxTime}ms`);

    // Check if TalkBack is enabled (not just any accessibility service)
    const isTalkBackEnabled = await perf.track("checkTalkBack", async () => {
      if (this.deps.device.platform !== "android") {
        return false;
      }
      const accessibilityService = await this.deps.accessibilityDetector.detectMethod(
        this.deps.device.deviceId,
        null
      );
      return accessibilityService === "talkback";
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
        elapsedMs: this.deps.timer.now() - startTime,
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
          await this.deps.accessibilityService.clearAccessibilityFocus();
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
    while (this.deps.timer.now() - startTime < maxTime) {
      scrollIteration++;
      logger.info(`[SwipeOn] Iteration ${scrollIteration}: elapsed=${this.deps.timer.now() - startTime}ms`);

      // Perform scroll
      const swipeDuration = this.deps.getDuration(lookForOptions);
      const { startX, startY, endX, endY } = swipeCoordinates;

      const boomerang = this.deps.resolveBoomerangConfig(options);
      const gestureOptions: GestureOptions = {
        duration: swipeDuration,
        scrollMode: options.scrollMode
      };

      // Execute swipe with observedInteraction
      const swipeResult = await this.deps.observedInteraction(
        async () => {
          return await this.deps.talkBackExecutor.executeSwipeGesture(
            Math.floor(startX),
            Math.floor(startY),
            Math.floor(endX),
            Math.floor(endY),
            options.direction,
            containerElement,
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
          skipPreviousObserve: scrollIteration > 1,
          predictionContext: {
            toolName: "swipeOn",
            toolArgs: this.deps.buildPredictionArgs(options)
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
          const elapsed = this.deps.timer.now() - startTime;
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
        const elapsed = this.deps.timer.now() - startTime;
        logger.info(`[SwipeOn] Found ${target} after ${scrollIteration} iterations (${elapsed}ms)`);
        break;
      }
    }

    if (!foundElement) {
      perf.end();
      const elapsed = this.deps.timer.now() - startTime;
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
      elapsedMs: this.deps.timer.now() - startTime,
      observation: lastObservation,
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      duration: 0,
      warning: swipeWarning
    };
  }

  async findTargetElement(
    options: SwipeOnOptions,
    viewHierarchy: ViewHierarchyResult,
    attempt: number = 0
  ): Promise<Element> {
    let element: Element | null = null;

    if (!options.container) {
      throw new ActionableError("Container must be specified for element swipe");
    }

    if (options.container.text) {
      element = this.deps.elementUtils.findElementByText(
        viewHierarchy,
        options.container.text,
        undefined,
        true,
        false
      );
    } else if (options.container.elementId) {
      element = this.deps.elementUtils.findElementByResourceId(
        viewHierarchy,
        options.container.elementId,
        undefined
      );
    } else {
      throw new ActionableError("Container must specify either text or elementId");
    }

    // Retry logic similar to TapOnElement
    if (!element && attempt < ScrollUntilVisible.MAX_ATTEMPTS) {
      const delayNextAttempt = Math.min(10 * Math.pow(2, attempt), 1000);
      await this.deps.timer.sleep(delayNextAttempt);

      let latestViewHierarchy: ViewHierarchyResult | null = null;

      switch (this.deps.device.platform) {
        case "android":
          const queryOptions = {
            query: options.container.text || options.container.elementId || "",
            containerElementId: undefined
          };
          latestViewHierarchy = await this.deps.accessibilityService.getAccessibilityHierarchy(
            queryOptions,
            undefined,
            undefined,
            undefined,
            serverConfig.isRawElementSearchEnabled()
          );
          break;
        case "ios":
          latestViewHierarchy = await XCTestServiceClient.getInstance(this.deps.device).getAccessibilityHierarchy() ?? undefined;
          break;
        default:
          throw new ActionableError(`Unsupported platform: ${this.deps.device.platform}`);
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

  async findScrollableContainer(
    options: SwipeOnOptions,
    observeResult: ObserveResult
  ): Promise<Element> {
    let element: Element | null = null;
    const viewHierarchy = observeResult.viewHierarchy!;

    // Try to find container by elementId or text
    if (options.container?.elementId) {
      element = this.deps.elementUtils.findElementByResourceId(
        viewHierarchy,
        options.container.elementId
      );
    } else if (options.container?.text) {
      element = this.deps.elementUtils.findElementByText(
        viewHierarchy,
        options.container.text,
        undefined,
        true,
        false
      );
    }

    // If no container specified or found, try to find a scrollable element
    if (!element) {
      const scrollableElement = this.deps.elementUtils.findScrollableContainer(viewHierarchy);
      if (scrollableElement) {
        element = scrollableElement;
        logger.info(`[SwipeOn] Found scrollable container automatically`);
      }
    }

    // If still no element, use screen bounds as container
    if (!element) {
      logger.info(`[SwipeOn] No scrollable container found, using screen bounds`);
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

  async findElementInHierarchy(
    lookFor: { text?: string; elementId?: string },
    viewHierarchy: ViewHierarchyResult,
    container?: { elementId?: string; text?: string }
  ): Promise<Element | null> {
    if (lookFor.text) {
      return this.deps.elementUtils.findElementByText(
        viewHierarchy,
        lookFor.text,
        container,
        true,
        false
      );
    } else if (lookFor.elementId) {
      return this.deps.elementUtils.findElementByResourceId(
        viewHierarchy,
        lookFor.elementId,
        container,
        true
      );
    }
    return null;
  }

  computeHierarchyFingerprint(viewHierarchy: ViewHierarchyResult): string {
    if (!viewHierarchy.hierarchy) {
      return "";
    }

    return JSON.stringify(viewHierarchy.hierarchy).slice(0, 1000);
  }

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

        await this.deps.accessibilityService.setAccessibilityFocus(resourceId);
        logger.info(`[SwipeOn] Set accessibility focus on element: ${resourceId}`);
      });
    } catch (error) {
      logger.warn(`[SwipeOn] Failed to set accessibility focus: ${error}`);
    }
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

    const defaultSwipe = this.deps.elementUtils.getSwipeWithinBounds(
      options.direction,
      effectiveBounds
    );

    const overlayCandidates = this.deps.overlayDetector.collectOverlayCandidates(viewHierarchy, options.container, containerElement);
    if (overlayCandidates.length === 0) {
      return defaultSwipe;
    }

    const allOverlayBounds = overlayCandidates.map(overlay => overlay.overlapBounds);
    const safeSwipe = this.deps.overlayDetector.computeSafeSwipeCoordinates(
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
}
