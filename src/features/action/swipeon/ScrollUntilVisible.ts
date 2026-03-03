import {
  ActionableError,
  BootedDevice,
  Element,
  GestureOptions,
  ObserveResult,
  SwipeDirection,
  SwipeOnOptions,
  SwipeOnResult,
  ViewHierarchyResult
} from "../../../models";
import { logger } from "../../../utils/logger";
import { PerformanceTracker, NoOpPerformanceTracker } from "../../../utils/PerformanceTracker";
import { CtrlProxyClient as IOSCtrlProxyClient } from "../../observe/ios";
import type { ElementFinder } from "../../../utils/interfaces/ElementFinder";
import type { ElementGeometry } from "../../../utils/interfaces/ElementGeometry";
import type { ObserveScreen } from "../../observe/interfaces/ObserveScreen";
import { AccessibilityDetector } from "../../../utils/interfaces/AccessibilityDetector";
import { serverConfig } from "../../../utils/ServerConfig";
import { Timer } from "../../../utils/SystemTimer";
import { SwipeOnResolvedOptions, BoomerangConfig, TalkBackSwipeRunner, OverlayAnalyzer, ScrollAccessibilityService } from "./types";
import { resolveContainerSwipeCoordinates } from "./resolveContainerSwipeCoordinates";
import { getScreenBounds } from "../../../utils/screenBounds";

function oppositeDirection(dir: SwipeDirection): SwipeDirection {
  switch (dir) {
    case "up":    return "down";
    case "down":  return "up";
    case "left":  return "right";
    case "right": return "left";
  }
}

export interface ScrollUntilVisibleDependencies {
  device: BootedDevice;
  finder: ElementFinder;
  geometry: ElementGeometry;
  observeScreen: ObserveScreen;
  accessibilityService: ScrollAccessibilityService;
  accessibilityDetector: AccessibilityDetector;
  overlayDetector: OverlayAnalyzer;
  talkBackExecutor: TalkBackSwipeRunner;
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
    const maxUnchangedScrolls = 1;

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

    // First check if element is already visible within the container bounds
    foundElement = await perf.track("initialSearch", () =>
      this.findElementInHierarchy(options.lookFor!, lastObservation.viewHierarchy!, options.container)
    );

    if (foundElement && !this.isElementWithinContainer(foundElement, containerElement.bounds)) {
      logger.info(`[SwipeOn] Found ${target} initially but it is outside container bounds (element center y=${Math.floor((foundElement.bounds.top + foundElement.bounds.bottom) / 2)}, container=[${containerElement.bounds.top},${containerElement.bounds.bottom}]), will scroll`);
      foundElement = null;
    }

    if (foundElement) {
      logger.info(`[SwipeOn] Element already visible at bounds=${JSON.stringify(foundElement.bounds)}, no scrolling needed`);

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

    const swipeCoordinates = this.resolveContainerSwipeCoordinates(
      options,
      lastObservation.viewHierarchy!,
      containerElement,
      lastObservation
    );
    const swipeWarning = swipeCoordinates.warning;

    // Overshoot recovery state
    let reverseMode = false;
    const reverseDirection = oppositeDirection(options.direction);
    let reverseBounds = containerElement.bounds;
    if (options.includeSystemInsets !== true && lastObservation.systemInsets) {
      const insets = lastObservation.systemInsets;
      reverseBounds = {
        left: Math.max(containerElement.bounds.left, insets.left),
        top: Math.max(containerElement.bounds.top, insets.top),
        right: Math.min(containerElement.bounds.right, lastObservation.screenSize?.width ?? containerElement.bounds.right) - insets.right,
        bottom: Math.min(containerElement.bounds.bottom, lastObservation.screenSize?.height ?? containerElement.bounds.bottom) - insets.bottom
      };
    }
    const reverseSwipeCoords = this.computeHalfScreenReverseCoords(reverseDirection, reverseBounds);
    const reverseOptions = { ...lookForOptions, speed: "slow" as const };
    logger.info(`[SwipeOn] Forward swipe: direction=${options.direction}, coords=(${Math.floor(swipeCoordinates.startX)},${Math.floor(swipeCoordinates.startY)})→(${Math.floor(swipeCoordinates.endX)},${Math.floor(swipeCoordinates.endY)})`);
    logger.info(`[SwipeOn] Reverse swipe: direction=${reverseDirection}, coords=(${Math.floor(reverseSwipeCoords.startX)},${Math.floor(reverseSwipeCoords.startY)})→(${Math.floor(reverseSwipeCoords.endX)},${Math.floor(reverseSwipeCoords.endY)}), bounds=${JSON.stringify(reverseBounds)}`);

    // Scroll until element is found
    while (this.deps.timer.now() - startTime < maxTime) {
      scrollIteration++;
      logger.info(`[SwipeOn] Iteration ${scrollIteration}: elapsed=${this.deps.timer.now() - startTime}ms, reverseMode=${reverseMode}, unchangedScrollCount=${unchangedScrollCount}/${maxUnchangedScrolls}`);

      // Perform scroll
      const activeCoords = reverseMode ? reverseSwipeCoords : swipeCoordinates;
      const activeDirection = reverseMode ? reverseDirection : options.direction;
      const activeDuration = this.deps.getDuration(reverseMode ? reverseOptions : lookForOptions);
      const { startX, startY, endX, endY } = activeCoords;
      logger.info(`[SwipeOn] Swipe: direction=${activeDirection}, coords=(${Math.floor(startX)},${Math.floor(startY)})→(${Math.floor(endX)},${Math.floor(endY)}), duration=${activeDuration}ms`);

      const boomerang = this.deps.resolveBoomerangConfig(options);
      const gestureOptions: GestureOptions = {
        duration: activeDuration,
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
            activeDirection,
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

      // Wait for scroll animation to fully settle before inspecting the hierarchy.
      // The post-swipe observation may reflect a mid-scroll position (the accessibility service
      // can return a cached hierarchy captured before the fling decelerates to rest). Polling
      // until two consecutive fingerprints match ensures we evaluate lookFor against the final
      // idle state rather than a transient mid-scroll frame.
      const elapsedMs = this.deps.timer.now() - startTime;
      const idleCheckMaxMs = Math.min(1500, Math.max(0, maxTime - elapsedMs - 300));
      if (idleCheckMaxMs > 100) {
        lastObservation = await this.waitForScrollIdle(lastObservation, idleCheckMaxMs);
      }

      // Check if hierarchy changed (detect scroll end)
      const currentFingerprint = this.computeHierarchyFingerprint(lastObservation.viewHierarchy!);
      const fingerprintChanged = currentFingerprint !== lastFingerprint;
      logger.info(`[SwipeOn] Iteration ${scrollIteration}: hierarchy ${fingerprintChanged ? "changed" : "UNCHANGED"} (fingerprint[0:40]="${currentFingerprint.slice(0, 40)}")`);

      if (!fingerprintChanged) {
        unchangedScrollCount++;
        logger.info(`[SwipeOn] Iteration ${scrollIteration}: unchanged count now ${unchangedScrollCount}/${maxUnchangedScrolls}`);

        if (unchangedScrollCount >= maxUnchangedScrolls) {
          if (reverseMode) {
            // Reverse also exhausted — element truly not found
            perf.end();
            const elapsed = this.deps.timer.now() - startTime;
            throw new ActionableError(
              `Scroll reached end of container (no change after ${maxUnchangedScrolls} scrolls). ` +
              `${target} not found after ${scrollIteration} iterations (${elapsed}ms).`
            );
          }
          // Switch to reverse half-screen recovery
          reverseMode = true;
          unchangedScrollCount = 0;
          logger.info(`[SwipeOn] Reached end in forward direction without finding ${target}, switching to reverse half-screen recovery`);
        }
      } else {
        unchangedScrollCount = 0;
        lastFingerprint = currentFingerprint;
      }

      logger.info(`[SwipeOn] Iteration ${scrollIteration}: searching for ${target}`);

      // Check if target element is now visible within the container bounds
      foundElement = await this.findElementInHierarchy(
        options.lookFor!,
        lastObservation.viewHierarchy!,
        options.container
      );

      if (foundElement && !this.isElementWithinContainer(foundElement, containerElement.bounds)) {
        logger.info(`[SwipeOn] Found ${target} but it is outside container bounds (element center y=${Math.floor((foundElement.bounds.top + foundElement.bounds.bottom) / 2)}, container=[${containerElement.bounds.top},${containerElement.bounds.bottom}]), continuing scroll`);
        foundElement = null;
      }

      if (foundElement) {
        const elapsed = this.deps.timer.now() - startTime;
        logger.info(`[SwipeOn] Found ${target} after ${scrollIteration} iterations (${elapsed}ms), reverseMode=${reverseMode}, bounds=${JSON.stringify(foundElement.bounds)}`);
        break;
      }
      logger.info(`[SwipeOn] Iteration ${scrollIteration}: ${target} not yet found`);
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
      element = this.deps.finder.findElementByText(
        viewHierarchy,
        options.container.text,
        undefined,
        true,
        false
      );
    } else if (options.container.elementId) {
      element = this.deps.finder.findElementByResourceId(
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
          latestViewHierarchy = await IOSCtrlProxyClient.getInstance(this.deps.device).getAccessibilityHierarchy() ?? undefined;
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
      element = this.deps.finder.findElementByResourceId(
        viewHierarchy,
        options.container.elementId
      );
    } else if (options.container?.text) {
      element = this.deps.finder.findElementByText(
        viewHierarchy,
        options.container.text,
        undefined,
        true,
        false
      );
    }

    // If no container specified or found, try to find a scrollable element
    if (!element) {
      const scrollableElement = this.deps.finder.findScrollableContainer(viewHierarchy);
      if (scrollableElement) {
        element = scrollableElement;
        logger.info(`[SwipeOn] Found scrollable container automatically`);
      }
    }

    // If still no element, use screen bounds as container
    if (!element) {
      logger.info(`[SwipeOn] No scrollable container found, using screen bounds`);
      const screenSize = observeResult.screenSize || { width: 1080, height: 1920 };

      element = {
        bounds: getScreenBounds(screenSize, observeResult.systemInsets),
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
      return this.deps.finder.findElementByText(
        viewHierarchy,
        lookFor.text,
        container,
        true,
        false
      );
    } else if (lookFor.elementId) {
      return this.deps.finder.findElementByResourceId(
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

    return JSON.stringify(viewHierarchy.hierarchy);
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

        await this.deps.accessibilityService.requestAction("focus", resourceId, 5000, perf);
        logger.info(`[SwipeOn] Set accessibility focus on element: ${resourceId}`);
      });
    } catch (error) {
      logger.warn(`[SwipeOn] Failed to set accessibility focus: ${error}`);
    }
  }

  private isElementWithinContainer(
    element: Element,
    containerBounds: { top: number; bottom: number; left: number; right: number }
  ): boolean {
    const centerY = (element.bounds.top + element.bounds.bottom) / 2;
    const centerX = (element.bounds.left + element.bounds.right) / 2;
    return (
      centerY >= containerBounds.top &&
      centerY <= containerBounds.bottom &&
      centerX >= containerBounds.left &&
      centerX <= containerBounds.right
    );
  }

  private computeHalfScreenReverseCoords(
    reverseDir: SwipeDirection,
    effectiveBounds: { left: number; top: number; right: number; bottom: number }
  ): { startX: number; startY: number; endX: number; endY: number } {
    const cx = (effectiveBounds.left + effectiveBounds.right) / 2;
    const cy = (effectiveBounds.top + effectiveBounds.bottom) / 2;
    const h = effectiveBounds.bottom - effectiveBounds.top;
    const w = effectiveBounds.right - effectiveBounds.left;

    switch (reverseDir) {
      case "down":
        return { startX: cx, startY: effectiveBounds.top + h * 0.25, endX: cx, endY: effectiveBounds.top + h * 0.75 };
      case "up":
        return { startX: cx, startY: effectiveBounds.bottom - h * 0.25, endX: cx, endY: effectiveBounds.top + h * 0.25 };
      case "right":
        return { startX: effectiveBounds.left + w * 0.25, startY: cy, endX: effectiveBounds.left + w * 0.75, endY: cy };
      case "left":
        return { startX: effectiveBounds.right - w * 0.25, startY: cy, endX: effectiveBounds.left + w * 0.25, endY: cy };
    }
  }

  private async waitForScrollIdle(
    currentObservation: ObserveResult,
    maxWaitMs: number
  ): Promise<ObserveResult> {
    if (!currentObservation.viewHierarchy) {return currentObservation;}
    const startTime = this.deps.timer.now();
    const pollIntervalMs = 150;
    let previousFingerprint = this.computeHierarchyFingerprint(currentObservation.viewHierarchy);
    let latestObservation = currentObservation;

    while (this.deps.timer.now() - startTime < maxWaitMs) {
      const newObservation = await this.deps.observeScreen.execute();
      if (!newObservation.viewHierarchy) {break;}
      const newFingerprint = this.computeHierarchyFingerprint(newObservation.viewHierarchy);
      if (newFingerprint === previousFingerprint) {
        logger.info(`[SwipeOn] Scroll settled after ${this.deps.timer.now() - startTime}ms idle check`);
        return newObservation;
      }
      logger.info(`[SwipeOn] Scroll still settling (elapsed=${this.deps.timer.now() - startTime}ms), retrying in ${pollIntervalMs}ms`);
      previousFingerprint = newFingerprint;
      latestObservation = newObservation;
      await this.deps.timer.sleep(pollIntervalMs);
    }

    logger.info(`[SwipeOn] Scroll idle check reached ${maxWaitMs}ms limit, proceeding`);
    return latestObservation;
  }

  private resolveContainerSwipeCoordinates(
    options: SwipeOnResolvedOptions,
    viewHierarchy: ViewHierarchyResult,
    containerElement: Element,
    observeResult: ObserveResult
  ): { startX: number; startY: number; endX: number; endY: number; warning?: string } {
    return resolveContainerSwipeCoordinates(
      this.deps.geometry, this.deps.overlayDetector,
      options, viewHierarchy, containerElement, observeResult
    );
  }
}
