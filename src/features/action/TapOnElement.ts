import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import {
  ActionableError,
  BootedDevice,
  Element,
  ObserveResult,
  TapOnElementResult,
  ViewHierarchyResult
} from "../../models";
import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { TapOnElementOptions } from "../../models/TapOnElementOptions";
import { ElementUtils } from "../utility/ElementUtils";
import { ElementParser } from "../utility/ElementParser";
import { DefaultElementSelector } from "../utility/DefaultElementSelector";
import { logger } from "../../utils/logger";
import { AccessibilityServiceClient } from "../observe/AccessibilityServiceClient";
import { AxeClient } from "../../utils/ios-cmdline-tools/AxeClient";
import { WebDriverAgent } from "../../utils/ios-cmdline-tools/WebDriverAgent";
import { createGlobalPerformanceTracker, NoOpPerformanceTracker } from "../../utils/PerformanceTracker";
import { VisionFallback, DEFAULT_VISION_CONFIG, type VisionFallbackConfig } from "../../vision/index";
import { TakeScreenshot } from "../observe/TakeScreenshot";
import { buildElementSearchDebugContext } from "../../utils/DebugContextBuilder";
import { throwIfAborted } from "../../utils/toolUtils";
import { SelectionStateTracker, SelectionCaptureState, TakeScreenshotCapturer } from "../navigation/SelectionStateTracker";
import { AccessibilityDetector } from "../../utils/interfaces/AccessibilityDetector";
import { accessibilityDetector as defaultAccessibilityDetector } from "../../utils/AccessibilityDetector";
import type { ElementSelector } from "../../utils/interfaces/ElementSelector";
import type { Timer } from "../../utils/SystemTimer";
import { NodeCryptoService } from "../../utils/crypto";

type SearchUntilStats = NonNullable<TapOnElementResult["searchUntil"]>;

/**
 * Command to tap on UI element containing specified text
 */
export class TapOnElement extends BaseVisualChange {
  private webdriver: WebDriverAgent;
  private elementUtils: ElementUtils;
  private elementParser: ElementParser;
  private accessibilityService: AccessibilityServiceClient;
  private visionConfig: VisionFallbackConfig;
  private selectionStateTracker: SelectionStateTracker;
  private accessibilityDetector: AccessibilityDetector;
  private elementSelector: ElementSelector;
  private static readonly SEARCH_UNTIL_DEFAULT_MS = 500;
  private static readonly SEARCH_UNTIL_MIN_MS = 100;
  private static readonly SEARCH_UNTIL_MAX_MS = 12000;

  constructor(
    device: BootedDevice,
    adb: AdbClient | null = null,
    axe: AxeClient | null = null,
    webdriver: WebDriverAgent | null = null,
    visionConfig?: VisionFallbackConfig,
    selectionStateTracker?: SelectionStateTracker,
    accessibilityDetector?: AccessibilityDetector,
    timer?: Timer,
    elementSelector?: ElementSelector
  ) {
    super(device, adb, axe, timer);
    this.elementUtils = new ElementUtils();
    this.elementParser = new ElementParser();
    this.accessibilityService = AccessibilityServiceClient.getInstance(device, this.adb);
    this.webdriver = webdriver || new WebDriverAgent(device);
    this.visionConfig = visionConfig || DEFAULT_VISION_CONFIG;
    this.selectionStateTracker = selectionStateTracker ?? new SelectionStateTracker({
      screenshotCapturer: new TakeScreenshotCapturer(device, this.adb)
    });
    this.accessibilityDetector = accessibilityDetector || defaultAccessibilityDetector;
    this.elementSelector = elementSelector ?? new DefaultElementSelector();
  }

  /**
   * Create an error result with consistent structure
   * @param action - The intended action
   * @param error - The error message
   * @returns TapOnTextResult with error state
   */
  private createErrorResult(action: string, error: string): TapOnElementResult {
    return {
      success: false,
      action: action,
      error,
      element: {
        bounds: { left: 0, top: 0, right: 0, bottom: 0 }
      } as Element
    };
  }

  private getSearchUntilDuration(options: TapOnElementOptions): number {
    const duration = options.searchUntil?.duration ?? TapOnElement.SEARCH_UNTIL_DEFAULT_MS;

    if (!Number.isFinite(duration)) {
      throw new ActionableError("searchUntil.duration must be a number");
    }

    if (duration < TapOnElement.SEARCH_UNTIL_MIN_MS) {
      throw new ActionableError(
        `searchUntil.duration must be at least ${TapOnElement.SEARCH_UNTIL_MIN_MS}ms`
      );
    }

    if (duration > TapOnElement.SEARCH_UNTIL_MAX_MS) {
      throw new ActionableError(
        `searchUntil.duration must be at most ${TapOnElement.SEARCH_UNTIL_MAX_MS}ms`
      );
    }

    return Math.round(duration);
  }

  private hashViewHierarchy(viewHierarchy: ViewHierarchyResult | null): string | null {
    if (!viewHierarchy) {
      return null;
    }
    try {
      return NodeCryptoService.generateCacheKey(JSON.stringify(viewHierarchy.hierarchy));
    } catch (error) {
      logger.debug(`[TapOnElement] Failed to hash view hierarchy: ${error}`);
      return null;
    }
  }

  private findElementInHierarchy(
    options: TapOnElementOptions,
    viewHierarchy: ViewHierarchyResult
  ): { element: Element | null; containerFound: boolean } {
    const containerFound = this.isContainerAvailable(viewHierarchy, options.container);
    if (options.text) {
      return {
        element: this.elementSelector.selectByText(viewHierarchy, options.text, {
          container: options.container,
          fuzzyMatch: true,
          caseSensitive: false,
          strategy: options.selectionStrategy
        }),
        containerFound
      };
    }
    if (options.elementId) {
      return {
        element: this.elementSelector.selectByResourceId(viewHierarchy, options.elementId, {
          container: options.container,
          partialMatch: false,
          strategy: options.selectionStrategy
        }),
        containerFound
      };
    }
    throw new ActionableError("tapOn requires non-blank text or elementId to interact with");
  }

  private async refreshViewHierarchy(
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<ViewHierarchyResult | null> {
    const effectiveTimeoutMs = Math.max(0, timeoutMs);
    switch (this.device.platform) {
      case "android": {
        const syncResult = await this.accessibilityService.requestHierarchySync(
          new NoOpPerformanceTracker(),
          false,
          signal,
          effectiveTimeoutMs
        );
        return syncResult
          ? this.accessibilityService.convertToViewHierarchyResult(syncResult.hierarchy)
          : null;
      }
      case "ios":
        return this.webdriver.getViewHierarchy(this.device);
      default:
        throw new ActionableError(`Unsupported platform: ${this.device.platform}`);
    }
  }

  private async searchForElement(
    options: TapOnElementOptions,
    observeResult: ObserveResult,
    signal?: AbortSignal
  ): Promise<{
    element: Element | null;
    viewHierarchy: ViewHierarchyResult;
    containerFound: boolean;
    stats: SearchUntilStats;
  }> {
    const viewHierarchy = observeResult.viewHierarchy;
    if (!viewHierarchy) {
      throw new ActionableError("Unable to get view hierarchy, cannot tap on element");
    }

    const searchDurationMs = this.getSearchUntilDuration(options);
    const startTime = this.timer.now();
    let requestCount = 0;
    let changeCount = 0;
    let lastHash = this.hashViewHierarchy(viewHierarchy);

    let latestViewHierarchy = viewHierarchy;
    const initialSearch = this.findElementInHierarchy(options, latestViewHierarchy);
    let element = initialSearch.element;
    let containerFoundEver = initialSearch.containerFound;

    if (!element) {
      const deadline = startTime + searchDurationMs;
      while (this.timer.now() < deadline) {
        throwIfAborted(signal);
        const remainingTimeMs = Math.max(0, deadline - this.timer.now());
        const refreshedHierarchy = await this.refreshViewHierarchy(remainingTimeMs, signal);
        requestCount += 1;

        if (!refreshedHierarchy) {
          continue;
        }

        latestViewHierarchy = refreshedHierarchy;
        const hash = this.hashViewHierarchy(refreshedHierarchy);
        if (hash && hash !== lastHash) {
          changeCount += 1;
          lastHash = hash;
        } else if (hash && !lastHash) {
          changeCount += 1;
          lastHash = hash;
        }

        const searchResult = this.findElementInHierarchy(options, refreshedHierarchy);
        element = searchResult.element;
        containerFoundEver = containerFoundEver || searchResult.containerFound;
        if (element) {
          break;
        }
      }
    }

    const stats: SearchUntilStats = {
      durationMs: Math.max(0, Math.round(this.timer.now() - startTime)),
      requestCount,
      changeCount
    };

    return {
      element,
      viewHierarchy: latestViewHierarchy,
      containerFound: containerFoundEver,
      stats
    };
  }

  private async handleElementNotFound(
    options: TapOnElementOptions,
    observeResult?: ObserveResult,
    containerFound: boolean = true,
    signal?: AbortSignal
  ): Promise<never> {
    if (options.container && !containerFound) {
      const containerLabel = options.container.elementId
        ? `elementId '${options.container.elementId}'`
        : `text '${options.container.text}'`;
      throw new ActionableError(
        `Container element not found with provided ${containerLabel}`
      );
    }

    if (this.visionConfig.enabled && observeResult) {
      logger.info("🔍 Element not found after polling, trying vision fallback...");

      try {
        const screenshot = new TakeScreenshot(this.device, this.adb);
        const screenshotResult = await screenshot.execute({}, signal);

        if (!screenshotResult.success || !screenshotResult.path) {
          logger.error("Failed to capture screenshot for vision fallback");
          throw new Error("Screenshot capture failed");
        }

        const visionFallback = new VisionFallback(this.visionConfig);
        const visionResult = await visionFallback.analyzeAndSuggest(
          screenshotResult.path,
          observeResult.viewHierarchy as any, // ViewNode type
          {
            text: options.text,
            resourceId: options.elementId,
            description: `Interactive element for tapping (action: ${options.action})`,
          }
        );

        if (visionResult.confidence === "high" && visionResult.navigationSteps && visionResult.navigationSteps.length > 0) {
          const stepsText = visionResult.navigationSteps
            .map((step, i) => `${i + 1}. ${step.description}`)
            .join("\n");

          throw new ActionableError(
            `Element not found, but AI suggests these steps:\n${stepsText}\n\n` +
            `(Cost: $${visionResult.costUsd.toFixed(4)}, Confidence: ${visionResult.confidence})`
          );
        }

        if (visionResult.alternativeSelectors && visionResult.alternativeSelectors.length > 0) {
          const suggestions = visionResult.alternativeSelectors
            .map(alt => `- ${alt.type}: "${alt.value}" (${alt.reasoning})`)
            .join("\n");

          throw new ActionableError(
            `Element not found. AI suggests trying:\n${suggestions}\n\n` +
            `(Cost: $${visionResult.costUsd.toFixed(4)}, Confidence: ${visionResult.confidence})`
          );
        }

        throw new ActionableError(
          `Element not found. ${visionResult.reason || "No clear path found."}\n\n` +
          `(Cost: $${visionResult.costUsd.toFixed(4)}, Confidence: ${visionResult.confidence})`
        );

      } catch (error) {
        if (error instanceof ActionableError) {
          throw error;
        }
        logger.error("Vision fallback failed:", error);
      }
    }

    if (options.text) {
      const containerHint = options.container
        ? ` within container ${options.container.elementId ? `elementId '${options.container.elementId}'` : `text '${options.container.text}'`}`
        : "";
      throw new ActionableError(`Element not found with provided text '${options.text}'${containerHint}`);
    }

    const containerHint = options.container
      ? ` within container ${options.container.elementId ? `elementId '${options.container.elementId}'` : `text '${options.container.text}'`}`
      : "";
    throw new ActionableError(`Element not found with provided elementId '${options.elementId}'${containerHint}`);
  }

  private isContainerAvailable(
    viewHierarchy: ViewHierarchyResult,
    container?: { elementId?: string; text?: string }
  ): boolean {
    if (!container) {
      return true;
    }

    return this.elementUtils.hasContainerElement(viewHierarchy, container);
  }

  private isTruthyFlag(value: unknown): boolean {
    return value === true || value === "true";
  }

  private isClickableElement(element: Element): boolean {
    return this.isTruthyFlag(element.clickable);
  }

  private isLongClickableElement(element: Element): boolean {
    return this.isTruthyFlag(element["long-clickable"]) || this.isTruthyFlag(element.longClickable);
  }

  private isClickableProps(props: Record<string, unknown>): boolean {
    return this.isTruthyFlag(props.clickable);
  }

  private isLongClickableProps(props: Record<string, unknown>): boolean {
    return this.isTruthyFlag(props["long-clickable"]) || this.isTruthyFlag(props.longClickable);
  }

  private boundsEqual(a: Element["bounds"], b: Element["bounds"]): boolean {
    return a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom;
  }

  private nodeMatchesElement(
    target: Element,
    props: Record<string, unknown>,
    parsed: Element
  ): boolean {
    if (!this.boundsEqual(parsed.bounds, target.bounds)) {
      return false;
    }

    if (target["resource-id"] && props["resource-id"] !== target["resource-id"]) {
      return false;
    }

    if (target.text && props.text !== target.text) {
      return false;
    }

    if (target["content-desc"] && props["content-desc"] !== target["content-desc"]) {
      return false;
    }

    const targetClass = target.class;
    if (targetClass) {
      const nodeClass = (props.class ?? props.className) as string | undefined;
      if (nodeClass !== targetClass) {
        return false;
      }
    }

    return true;
  }

  private findAncestorChain(viewHierarchy: ViewHierarchyResult, target: Element): any[] | null {
    const roots = [
      ...this.elementParser.extractRootNodes(viewHierarchy),
      ...this.elementParser.extractWindowRootNodes(viewHierarchy, "topmost-first")
    ];

    const stack: any[] = [];
    const search = (node: any): any[] | null => {
      stack.push(node);
      const props = this.elementParser.extractNodeProperties(node);
      const parsed = this.elementParser.parseNodeBounds(node);

      if (parsed && this.nodeMatchesElement(target, props, parsed)) {
        const chain = [...stack];
        stack.pop();
        return chain;
      }

      const children = node?.node ? (Array.isArray(node.node) ? node.node : [node.node]) : [];
      for (const child of children) {
        const found = search(child);
        if (found) {
          stack.pop();
          return found;
        }
      }

      stack.pop();
      return null;
    };

    for (const root of roots) {
      const found = search(root);
      if (found) {
        return found;
      }
    }

    return null;
  }

  private findAncestorByPredicate(
    chain: any[],
    predicate: (props: Record<string, unknown>) => boolean,
    requireResourceId: boolean
  ): Element | null {
    for (let i = chain.length - 2; i >= 0; i--) {
      const node = chain[i];
      const props = this.elementParser.extractNodeProperties(node);
      if (!predicate(props)) {
        continue;
      }
      if (requireResourceId && !props["resource-id"]) {
        continue;
      }
      const parsed = this.elementParser.parseNodeBounds(node);
      if (parsed) {
        return parsed;
      }
    }

    return null;
  }

  private selectAncestorForAction(
    chain: any[],
    action: string,
    requireResourceId: boolean
  ): Element | null {
    const primary = action === "longPress"
      ? (props: Record<string, unknown>) => this.isLongClickableProps(props)
      : (props: Record<string, unknown>) => this.isClickableProps(props);
    const secondary = action === "longPress"
      ? (props: Record<string, unknown>) => this.isClickableProps(props)
      : (props: Record<string, unknown>) => this.isLongClickableProps(props);

    return (
      this.findAncestorByPredicate(chain, primary, requireResourceId) ??
      this.findAncestorByPredicate(chain, secondary, requireResourceId)
    );
  }

  private resolveTapTargetElement(
    element: Element,
    viewHierarchy: ViewHierarchyResult | null,
    action: string,
    requireResourceId: boolean
  ): { element: Element; usedParent: boolean } {
    if (this.device.platform !== "android" || !viewHierarchy) {
      return { element, usedParent: false };
    }

    const isLongPress = action === "longPress";
    const isClickable = this.isClickableElement(element);
    const isLongClickable = this.isLongClickableElement(element);

    if (!isLongPress && isClickable) {
      return { element, usedParent: false };
    }

    if (isLongPress && isLongClickable) {
      return { element, usedParent: false };
    }

    const chain = this.findAncestorChain(viewHierarchy, element);
    if (!chain) {
      return { element, usedParent: false };
    }

    const ancestor = this.selectAncestorForAction(chain, action, requireResourceId);
    if (ancestor) {
      return { element: ancestor, usedParent: true };
    }

    if (!isLongPress && isLongClickable) {
      return { element, usedParent: false };
    }

    if (isLongPress && isClickable) {
      return { element, usedParent: false };
    }

    return { element, usedParent: false };
  }

  /**
   * Execute a tap on text
   * @param options - Command options
   * @param progress - Optional progress callback
    * @returns Result of the command
   */
  async execute(
    options: TapOnElementOptions,
    progress?: ProgressCallback,
    signal?: AbortSignal
  ): Promise<TapOnElementResult> {
    if (!options.action) {
      return this.createErrorResult(options.action, "tap on action is required");
    }

    const perf = createGlobalPerformanceTracker();
    perf.serial("tapOnElement");
    let previousObserveResult: ObserveResult | null = null;
    let selectionCapture: SelectionCaptureState | null = null;
    let searchUntilStats: SearchUntilStats | undefined;

    try {
      throwIfAborted(signal);
      // Tap on the calculated point using observedChange
      const result = await this.observedInteraction(
        async (observeResult: ObserveResult) => {
          previousObserveResult = observeResult;
          throwIfAborted(signal);

          let viewHierarchy = observeResult.viewHierarchy;
          if (!viewHierarchy) {
            perf.end();
            return { success: false, error: "Unable to get view hierarchy, cannot tap on element" };
          }

          const searchOutcome = await perf.track("findElement", () =>
            this.searchForElement(options, observeResult, signal)
          );
          searchUntilStats = searchOutcome.stats;
          observeResult.viewHierarchy = searchOutcome.viewHierarchy;
          viewHierarchy = searchOutcome.viewHierarchy;
          if (!searchOutcome.element) {
            await this.handleElementNotFound(options, observeResult, searchOutcome.containerFound, signal);
          }
          const element = searchOutcome.element as Element;
          const initialTapPoint = this.elementUtils.getElementCenter(element);
          let action = options.action;
          const longPressDuration = this.getLongPressDuration(options, this.device.platform);

          if (action === "focus") {
            // Check if element is already focused
            const isFocused = this.elementUtils.isElementFocused(element);

            if (isFocused) {
              logger.info(`Element is already focused, no action needed`);
              perf.end();
              return {
                success: true,
                element: element,
                searchUntil: searchOutcome.stats,
                wasAlreadyFocused: true,
                focusChanged: false,
                x: initialTapPoint.x,
                y: initialTapPoint.y
              };
            }

            // if not, change action to tap
            action = "tap";
            options.action = "tap";
          }

          const isTalkBackEnabled = this.device.platform === "android"
            ? await this.accessibilityDetector.isAccessibilityEnabled(this.device.id, this.adb)
            : false;
          const { element: tapElement, usedParent } = this.resolveTapTargetElement(
            element,
            viewHierarchy,
            action,
            isTalkBackEnabled
          );
          if (usedParent) {
            logger.info("[TapOnElement] Using clickable parent for non-clickable element");
          }
          const tapPoint = this.elementUtils.getElementCenter(tapElement);

          selectionCapture = await this.selectionStateTracker.prepare({
            action,
            observation: observeResult,
            element: tapElement,
            signal
          });

          // Platform-specific tap execution
          await perf.track("executeTap", async () => {
            switch (this.device.platform) {
              case "android":
                await this.executeAndroidTap(
                  action,
                  tapPoint.x,
                  tapPoint.y,
                  longPressDuration,
                  tapElement,
                  signal,
                  options,
                  isTalkBackEnabled
                );
                break;
              case "ios":
                await this.executeiOSTap(action, tapPoint.x, tapPoint.y, longPressDuration);
                break;
              default:
                throw new ActionableError(`Unsupported platform: ${this.device.platform}`);
            }
          });

          perf.end();
          return {
            success: true,
            action,
            element: tapElement,
            searchUntil: searchOutcome.stats,
          };
        },
        {
          queryOptions: {
            text: options.text,
            elementId: options.elementId,
            containerElementId: options.container?.elementId
          },
          changeExpected: false,
          timeoutMs: 800, // Reduce timeout for faster execution
          progress,
          perf,
          signal,
          predictionContext: {
            toolName: "tapOn",
            toolArgs: {
              text: options.text,
              id: options.elementId,
              action: options.action,
              duration: options.duration,
              container: options.container,
              searchUntil: options.searchUntil,
              selectionStrategy: options.selectionStrategy,
              platform: this.device.platform
            }
          }
        }
      );

      if (result.success && result.observation && result.element) {
        const selectedElements = await this.selectionStateTracker.finalize({
          action: options.action,
          selectionState: selectionCapture,
          currentObservation: result.observation,
          previousObservation: previousObserveResult,
          element: result.element,
          signal
        });
        if (selectedElements.length > 0) {
          result.observation.selectedElements = selectedElements;
        }
      }

      if (options.action === "longPress") {
        const metadata = this.detectLongPressMetadata(previousObserveResult, result.observation);
        return {
          ...result,
          ...metadata
        };
      }
      return result;
    } catch (error) {
      perf.end();

      // Build debug context if debug mode is enabled
      const debugContext = await buildElementSearchDebugContext(
        this.device,
        {
          text: options.text,
          resourceId: options.elementId,
          container: options.container
        }
      );

      // Return error result with debug info instead of throwing
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        action: options.action,
        error: `Failed to perform tap on element: ${errorMessage}`,
        element: {
          bounds: { left: 0, top: 0, right: 0, bottom: 0 }
        } as Element,
        ...(searchUntilStats ? { searchUntil: searchUntilStats } : {}),
        ...(debugContext ? { debug: { elementSearch: debugContext } } : {})
      };
    }
  }

  /**
   * Execute Android-specific tap operations
   * @param action - The tap action to perform
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param durationMs - Long press duration in milliseconds
   * @param element - Target element
   * @param signal - Abort signal
   * @param options - Tap options (for focusFirst parameter)
   */
  private async executeAndroidTap(
    action: string,
    x: number,
    y: number,
    durationMs: number,
    element: Element,
    signal?: AbortSignal,
    options?: TapOnElementOptions,
    isTalkBackEnabled?: boolean
  ): Promise<void> {
    // Check if TalkBack is enabled
    const talkBackEnabled = typeof isTalkBackEnabled === "boolean"
      ? isTalkBackEnabled
      : await this.accessibilityDetector.isAccessibilityEnabled(this.device.id, this.adb);

    const resourceId = element?.["resource-id"];

    // Use accessibility service only if TalkBack is enabled AND element has resource-id
    // Otherwise fall back to coordinate-based tapping
    if (talkBackEnabled && resourceId) {
      // TalkBack mode: Use AccessibilityService ACTION_CLICK with coordinate fallback
      await this.executeAndroidTapWithAccessibility(action, x, y, element, durationMs, options, signal);
    } else {
      // Standard mode or no resource-id: Use coordinate-based taps
      await this.executeAndroidTapWithCoordinates(action, x, y, durationMs, element, signal);
    }
  }

  /**
   * Execute tap using coordinate-based input commands (standard mode)
   */
  private async executeAndroidTapWithCoordinates(
    action: string,
    x: number,
    y: number,
    durationMs: number,
    element: Element,
    signal?: AbortSignal
  ): Promise<void> {
    if (action === "tap") {
      await this.adb.executeCommand(`shell input tap ${x} ${y}`, undefined, undefined, undefined, signal);
    } else if (action === "longPress") {
      await this.executeAndroidLongPress(x, y, durationMs, element?.["resource-id"], signal);
    } else if (action === "doubleTap") {
      await this.adb.executeCommand(`shell input tap ${x} ${y}`, undefined, undefined, undefined, signal);
      await this.timer.sleep(200);
      await this.adb.executeCommand(`shell input tap ${x} ${y}`, undefined, undefined, undefined, signal);
    }
  }

  /**
   * Execute tap using AccessibilityService actions (TalkBack mode)
   * Falls back to coordinate-based tapping if accessibility action fails
   */
  private async executeAndroidTapWithAccessibility(
    action: string,
    x: number,
    y: number,
    element: Element,
    durationMs: number,
    options?: TapOnElementOptions,
    signal?: AbortSignal
  ): Promise<void> {
    const resourceId = element?.["resource-id"];
    if (!resourceId) {
      logger.warn("[TapOnElement] Element has no resource-id, falling back to coordinate-based tap");
      await this.executeAndroidTapWithCoordinates(action, x, y, durationMs, element, signal);
      return;
    }

    // Use coordinate-based taps via accessibility service dispatchGesture.
    // This is faster than ADB and precise (uses exact coordinates, not resource-id lookup).
    // Use short duration (50ms) for tap/doubleTap to avoid being interpreted as long press
    const tapDuration = action === "longPress" ? durationMs : 50;

    // For double tap, we need to perform two accessibility taps
    if (action === "doubleTap") {
      // First tap
      const firstResult = await this.accessibilityService.requestTapCoordinates(x, y, tapDuration);
      if (!firstResult.success) {
        logger.warn(
          `[TapOnElement] First accessibility tap failed (${firstResult.error}), falling back to full ADB double tap at (${x}, ${y})`
        );
        await this.executeAndroidTapWithCoordinates(action, x, y, durationMs, element, signal);
        return;
      }

      // Wait between taps (standard double-tap interval)
      await this.timer.sleep(200);

      // Second tap
      const secondResult = await this.accessibilityService.requestTapCoordinates(x, y, tapDuration);
      if (!secondResult.success) {
        logger.warn(
          `[TapOnElement] Second accessibility tap failed (${secondResult.error}), retrying full ADB double tap at (${x}, ${y})`
        );
        // Retry full double tap via ADB to preserve double-tap timing
        await this.executeAndroidTapWithCoordinates(action, x, y, durationMs, element, signal);
      }
    } else {
      // For single tap or long press
      const result = await this.accessibilityService.requestTapCoordinates(x, y, tapDuration);
      if (!result.success) {
        logger.warn(`[TapOnElement] Accessibility coordinate tap failed (${result.error}), falling back to ADB tap at (${x}, ${y})`);
        await this.executeAndroidTapWithCoordinates(action, x, y, durationMs, element, signal);
      }
    }
  }

  /**
   * Execute iOS-specific tap operations
   * @param action - The tap action to perform
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param durationMs - Long press duration in milliseconds
   */
  private async executeiOSTap(
    action: string,
    x: number,
    y: number,
    durationMs: number
  ): Promise<void> {
    if (action === "tap") {
      await this.axe.tap(x, y);
    } else if (action === "longPress") {
      // iOS long press is implemented as a tap with longer duration
      await this.axe.tap(x, y, durationMs);
    } else if (action === "doubleTap") {
      // iOS double tap - perform two quick taps
      await this.axe.tap(x, y);
      await this.timer.sleep(200);
      await this.axe.tap(x, y);
    }
  }

  private getLongPressDuration(options: TapOnElementOptions, platform: "android" | "ios"): number {
    if (typeof options.duration === "number" && options.duration > 0) {
      return options.duration;
    }
    return platform === "android" ? 500 : 1000;
  }


  private async executeAndroidLongPress(
    x: number,
    y: number,
    durationMs: number,
    resourceId?: string,
    signal?: AbortSignal
  ): Promise<void> {
    throwIfAborted(signal);
    if (resourceId) {
      try {
        const result = await this.accessibilityService.requestAction("long_click", resourceId);
        if (result.success) {
          return;
        }
        logger.warn(`[TapOnElement] Accessibility long click failed: ${result.error}`);
      } catch (error) {
        logger.warn(`[TapOnElement] Accessibility long click error: ${error}`);
      }
    }

    try {
      await this.adb.executeCommand(`shell input touchscreen swipe ${x} ${y} ${x} ${y} ${durationMs}`, undefined, undefined, undefined, signal);
    } catch (error) {
      logger.warn(`[TapOnElement] touch input swipe failed, falling back to input swipe: ${error}`);
      await this.adb.executeCommand(`shell input swipe ${x} ${y} ${x} ${y} ${durationMs}`, undefined, undefined, undefined, signal);
    }
  }


  private detectLongPressMetadata(
    previousObservation: ObserveResult | null,
    currentObservation?: ObserveResult
  ): {
    pressRecognized: boolean;
    contextMenuOpened: boolean;
    selectionStarted: boolean;
  } {
    const previousHierarchy = previousObservation?.viewHierarchy;
    const currentHierarchy = currentObservation?.viewHierarchy;
    const contextMenuOpened = this.detectContextMenuOpened(previousHierarchy, currentHierarchy);
    const selectionStarted = this.detectSelectionStarted(currentHierarchy);
    const windowChange = this.detectNewWindow(previousHierarchy, currentHierarchy);

    return {
      pressRecognized: contextMenuOpened || selectionStarted || windowChange,
      contextMenuOpened,
      selectionStarted
    };
  }

  private detectContextMenuOpened(
    previousHierarchy?: ViewHierarchyResult,
    currentHierarchy?: ViewHierarchyResult
  ): boolean {
    if (!currentHierarchy) {
      return false;
    }
    const previousRoots = this.getRootSignatures(previousHierarchy);
    const currentRoots = this.elementUtils.extractRootNodes(currentHierarchy);

    for (const root of currentRoots) {
      const signature = this.getRootSignature(root);
      if (previousRoots.has(signature)) {
        continue;
      }
      if (this.containsMenuIndicators(root)) {
        return true;
      }
    }

    return false;
  }

  private detectNewWindow(
    previousHierarchy?: ViewHierarchyResult,
    currentHierarchy?: ViewHierarchyResult
  ): boolean {
    if (!currentHierarchy) {
      return false;
    }
    const previousRoots = this.getRootSignatures(previousHierarchy);
    const currentRoots = this.elementUtils.extractRootNodes(currentHierarchy);
    if (currentRoots.length === 0) {
      return false;
    }

    return currentRoots.some(root => !previousRoots.has(this.getRootSignature(root)));
  }

  private detectSelectionStarted(currentHierarchy?: ViewHierarchyResult): boolean {
    if (!currentHierarchy) {
      return false;
    }

    const roots = this.elementUtils.extractRootNodes(currentHierarchy);
    let selectionFound = false;
    const selectionKeyPairs: Array<[string, string]> = [
      ["textSelectionStart", "textSelectionEnd"],
      ["selectionStart", "selectionEnd"]
    ];

    for (const root of roots) {
      this.elementUtils.traverseNode(root, (node: any) => {
        if (selectionFound) {
          return;
        }
        const props = this.elementUtils.extractNodeProperties(node);
        for (const [startKey, endKey] of selectionKeyPairs) {
          const startValue = props?.[startKey] ?? props?.[startKey.toLowerCase()];
          const endValue = props?.[endKey] ?? props?.[endKey.toLowerCase()];
          if (startValue === undefined || endValue === undefined) {
            continue;
          }
          const startNumeric = typeof startValue === "string" ? parseInt(startValue, 10) : Number(startValue);
          const endNumeric = typeof endValue === "string" ? parseInt(endValue, 10) : Number(endValue);
          if (!Number.isNaN(startNumeric) && !Number.isNaN(endNumeric) && endNumeric > startNumeric) {
            selectionFound = true;
            return;
          }
        }
      });
      if (selectionFound) {
        break;
      }
    }

    return selectionFound;
  }

  private getRootSignatures(viewHierarchy?: ViewHierarchyResult): Set<string> {
    if (!viewHierarchy) {
      return new Set();
    }
    const roots = this.elementUtils.extractRootNodes(viewHierarchy);
    return new Set(roots.map(root => this.getRootSignature(root)));
  }

  private getRootSignature(root: any): string {
    const props = this.elementUtils.extractNodeProperties(root);
    const resourceId = props["resource-id"] ?? props.resourceId ?? "";
    const className = props.class ?? props.className ?? "";
    const bounds = props.bounds ?? "";
    const text = props.text ?? props["content-desc"] ?? "";
    return `${resourceId}|${className}|${bounds}|${text}`;
  }

  private containsMenuIndicators(root: any): boolean {
    let found = false;
    this.elementUtils.traverseNode(root, (node: any) => {
      if (found) {
        return;
      }
      const props = this.elementUtils.extractNodeProperties(node);
      const resourceId = (props["resource-id"] ?? props.resourceId ?? "").toLowerCase();
      const className = (props.class ?? props.className ?? "").toLowerCase();
      const text = (props.text ?? props["content-desc"] ?? "").toLowerCase();
      if (
        resourceId.includes("menu") ||
        resourceId.includes("popup") ||
        className.includes("menu") ||
        className.includes("popup") ||
        text.includes("menu") ||
        text.includes("popup")
      ) {
        found = true;
      }
    });
    return found;
  }
}
