import { BaseVisualChange, ProgressCallback } from "../BaseVisualChange";
import {
  ActionableError,
  BootedDevice,
  Element,
  GestureOptions,
  ObserveResult,
  SwipeDirection,
  SwipeOnOptions,
  SwipeOnResult,
  ScrollableCandidate,
  ViewHierarchyResult
} from "../../../models";
import { AdbClient } from "../../../utils/android-cmdline-tools/AdbClient";
import type { ElementFinder } from "../../../utils/interfaces/ElementFinder";
import type { ElementGeometry } from "../../../utils/interfaces/ElementGeometry";
import { DefaultElementFinder } from "../../utility/ElementFinder";
import { DefaultElementGeometry } from "../../utility/ElementGeometry";
import { DefaultElementParser } from "../../utility/ElementParser";
import { ExecuteGesture } from "../ExecuteGesture";
import { logger } from "../../../utils/logger";
import { createGlobalPerformanceTracker, PerformanceTracker, NoOpPerformanceTracker } from "../../../utils/PerformanceTracker";
import { AccessibilityServiceClient } from "../../observe/AccessibilityServiceClient";
import { buildElementSearchDebugContext } from "../../../utils/DebugContextBuilder";
import type { ObserveScreen } from "../../observe/interfaces/ObserveScreen";
import { resolveSwipeDirection } from "../../../utils/swipeOnUtils";
import { AccessibilityDetector } from "../../../utils/interfaces/AccessibilityDetector";
import { accessibilityDetector as defaultAccessibilityDetector } from "../../../utils/AccessibilityDetector";

import {
  GestureExecutor,
  SwipeOnDependencies,
  SwipeOnResolvedOptions,
  BoomerangConfig
} from "./types";
import { OverlayDetector } from "./OverlayDetector";
import { AutoTargetSelector } from "./AutoTargetSelector";
import { TalkBackSwipeExecutor } from "./TalkBackSwipeExecutor";
import { ScrollUntilVisible } from "./ScrollUntilVisible";
import { resolveContainerSwipeCoordinates } from "./resolveContainerSwipeCoordinates";

export class SwipeOn extends BaseVisualChange {
  private executeGesture: GestureExecutor;
  private finder: ElementFinder;
  private geometry: ElementGeometry;
  private accessibilityService: AccessibilityServiceClient;
  private accessibilityDetector: AccessibilityDetector;
  private overlayDetector: OverlayDetector;
  private autoTargetSelector: AutoTargetSelector;
  private talkBackExecutor: TalkBackSwipeExecutor;
  private scrollUntilVisible: ScrollUntilVisible;

  private static readonly DEFAULT_APEX_PAUSE_MS = 100;
  private static readonly DEFAULT_RETURN_SPEED = 1;

  constructor(
    device: BootedDevice,
    adb: AdbClient | null = null,
    dependencies: SwipeOnDependencies = {}
  ) {
    super(device, adb);
    this.executeGesture = dependencies.executeGesture ?? new ExecuteGesture(device, adb);
    const parser = dependencies.parser ?? new DefaultElementParser();
    this.finder = dependencies.finder ?? new DefaultElementFinder();
    this.geometry = dependencies.geometry ?? new DefaultElementGeometry();
    this.accessibilityService = AccessibilityServiceClient.getInstance(device, this.adbFactory);
    this.accessibilityDetector = dependencies.accessibilityDetector || defaultAccessibilityDetector;
    if (dependencies.observeScreen) {
      this.observeScreen = dependencies.observeScreen as unknown as ObserveScreen;
    }

    // Initialize extracted modules
    this.overlayDetector = new OverlayDetector(this.finder, this.geometry, parser);
    this.autoTargetSelector = new AutoTargetSelector();
    this.talkBackExecutor = new TalkBackSwipeExecutor(
      device,
      this.executeGesture,
      this.accessibilityService,
      this.accessibilityDetector,
      this.timer
    );
    this.scrollUntilVisible = new ScrollUntilVisible({
      device,
      finder: this.finder,
      geometry: this.geometry,
      observeScreen: this.observeScreen,
      accessibilityService: this.accessibilityService,
      accessibilityDetector: this.accessibilityDetector,
      overlayDetector: this.overlayDetector,
      talkBackExecutor: this.talkBackExecutor,
      timer: this.timer,
      getDuration: this.getDuration.bind(this),
      resolveBoomerangConfig: this.resolveBoomerangConfig.bind(this),
      buildPredictionArgs: this.buildPredictionArgs.bind(this),
      observedInteraction: this.observedInteraction.bind(this)
    });
  }

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

    const scrollables = this.finder.findScrollableElements(observeResult.viewHierarchy);
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
        return await this.scrollUntilVisible.execute(normalizedOptions, progress, perf);
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
          ? this.autoTargetSelector.getScreenBounds(scrollableContext.observeResult)
          : null;
        const autoTargetElement = this.autoTargetSelector.selectAutoTargetScrollable(
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

        const autoTargetContainer = this.autoTargetSelector.buildContainerFromElement(autoTargetElement);
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
          warning: this.autoTargetSelector.mergeWarnings(
            autoTargetResult.warning,
            `Auto-targeted scrollable container (${this.autoTargetSelector.describeContainer(autoTargetContainer)}). Set autoTarget: false to force full-screen swipes.`
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
      const lookForFieldCount = [options.lookFor.elementId, options.lookFor.text].filter(Boolean).length;
      if (lookForFieldCount !== 1) {
        return "lookFor must specify exactly one of elementId or text";
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

  private buildPredictionArgs(options: SwipeOnOptions): Record<string, unknown> {
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

        const { startX, startY, endX, endY } = this.geometry.getSwipeWithinBounds(
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
          this.talkBackExecutor.executeSwipeGesture(
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
          this.scrollUntilVisible.findTargetElement(options, viewHierarchy)
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
          this.talkBackExecutor.executeSwipeGesture(
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
    return resolveContainerSwipeCoordinates(
      this.geometry, this.overlayDetector,
      options, viewHierarchy, containerElement, observeResult
    );
  }

  private getDuration(options: SwipeOnResolvedOptions): number {
    if (options.duration !== undefined) {
      return options.duration;
    }

    return this.geometry.getSwipeDurationFromSpeed(options.speed);
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
}
