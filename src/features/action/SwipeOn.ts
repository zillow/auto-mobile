import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import {
  ActionableError,
  BootedDevice,
  Element,
  ObserveResult,
  SwipeOnOptions,
  SwipeOnResult,
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

/**
 * Unified command to swipe on screen or elements, with optional scroll-until-visible functionality
 *
 * This class consolidates the functionality of:
 * - swipeOnScreen: Full-screen swipes
 * - swipeOnElement: Swipes on specific elements
 * - scroll: Scrolling with optional element search
 */
export class SwipeOn extends BaseVisualChange {
  private executeGesture: ExecuteGesture;
  private elementUtils: ElementUtils;
  private accessibilityService: AccessibilityServiceClient;
  private webdriver: WebDriverAgent;
  private static readonly MAX_ATTEMPTS = 5;

  constructor(
    device: BootedDevice,
    adb: AdbClient | null = null,
    axe: AxeClient | null = null,
    webdriver: WebDriverAgent | null = null
  ) {
    super(device, adb, axe);
    this.executeGesture = new ExecuteGesture(device, adb);
    this.elementUtils = new ElementUtils();
    this.accessibilityService = AccessibilityServiceClient.getInstance(device, this.adb);
    this.webdriver = webdriver || new WebDriverAgent(device);
  }

  /**
   * Create an error result with consistent structure
   */
  private createErrorResult(error: string): SwipeOnResult {
    return {
      success: false,
      error,
      targetType: "screen",
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      duration: 0
    };
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

    try {
      // Determine which mode to use
      if (options.lookFor) {
        // Scroll-until-visible mode
        return await this.executeScrollUntilVisible(options, progress, perf);
      } else if (!options.container) {
        // No container = screen swipe
        return await this.executeScreenSwipe(options, progress, perf);
      } else {
        // Container specified = swipe within container
        return await this.executeElementSwipe(options, progress, perf);
      }
    } catch (error) {
      perf.end();
      throw new ActionableError(`Failed to perform swipeOn: ${error}`);
    }
  }

  /**
   * Validate swipeOn options
   */
  private validateOptions(options: SwipeOnOptions): string | null {
    if (!options.direction) {
      return "direction is required";
    }

    // Validate container if specified
    if (options.container) {
      const containerFieldCount = [options.container.elementId, options.container.text].filter(Boolean).length;
      if (containerFieldCount === 0) {
        return "container must specify either elementId or text";
      }
      if (containerFieldCount > 1) {
        return "container can only specify one of: elementId or text";
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

  /**
   * Execute a full-screen swipe
   */
  private async executeScreenSwipe(
    options: SwipeOnOptions,
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
          this.executeGesture.swipe(
            Math.floor(startX),
            Math.floor(startY),
            Math.floor(endX),
            Math.floor(endY),
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
        perf
      }
    );
  }

  /**
   * Execute a swipe on a specific element (with optional simple scroll)
   */
  private async executeElementSwipe(
    options: SwipeOnOptions,
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
          this.executeGesture.swipe(
            Math.floor(startX),
            Math.floor(startY),
            Math.floor(endX),
            Math.floor(endY),
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
        perf
      }
    );
  }

  /**
   * Execute scroll-until-visible operation
   */
  private async executeScrollUntilVisible(
    options: SwipeOnOptions,
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
      this.findElementInHierarchy(options.lookFor!, lastObservation.viewHierarchy!, options.container?.elementId)
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
          return await this.executeGesture.swipe(
            Math.floor(startX),
            Math.floor(startY),
            Math.floor(endX),
            Math.floor(endY),
            gestureOptions,
            perf
          );
        },
        {
          changeExpected: false,
          timeoutMs: 500,
          progress,
          perf,
          skipPreviousObserve: scrollIteration > 1 // Skip previous observe after first iteration
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
        options.container?.elementId
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
    containerElementId?: string
  ): Promise<Element | null> {
    if (lookFor.text) {
      return this.elementUtils.findElementByText(
        viewHierarchy,
        lookFor.text,
        containerElementId,
        true,
        false
      );
    } else if (lookFor.elementId) {
      return this.elementUtils.findElementByResourceId(
        viewHierarchy,
        lookFor.elementId,
        containerElementId,
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
  private getDuration(options: SwipeOnOptions): number {
    if (options.duration !== undefined) {
      return options.duration;
    }

    return this.elementUtils.getSwipeDurationFromSpeed(options.speed);
  }
}
