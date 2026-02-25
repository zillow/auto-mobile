import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import {
  ActionableError,
  BootedDevice,
  Element,
  ElementSelectionResult,
  ObserveResult,
  TapOnElementResult,
  TapOnSelectedElement,
  ViewHierarchyResult
} from "../../models";
import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { TapOnElementOptions } from "../../models/TapOnElementOptions";
import type { ElementParser } from "../../utils/interfaces/ElementParser";
import type { ElementFinder } from "../../utils/interfaces/ElementFinder";
import type { ElementGeometry } from "../../utils/interfaces/ElementGeometry";
import { DefaultElementParser } from "../utility/ElementParser";
import { DefaultElementFinder } from "../utility/ElementFinder";
import { DefaultElementGeometry } from "../utility/ElementGeometry";
import { DefaultElementSelector } from "../utility/DefaultElementSelector";
import { logger } from "../../utils/logger";
import { CtrlProxyClient } from "../observe/android";
import { XCTestServiceClient } from "../observe/ios";
import { createGlobalPerformanceTracker } from "../../utils/PerformanceTracker";
import { DEFAULT_VISION_CONFIG, getVisionEnrichedError, type VisionFallbackConfig, type VisionAnalyzer } from "../../vision/index";
import { buildElementSearchDebugContext } from "../../utils/DebugContextBuilder";
import { throwIfAborted } from "../../utils/toolUtils";
import { SelectionStateTracker, SelectionCaptureState, TakeScreenshotCapturer, type ScreenshotCapturer } from "../navigation/SelectionStateTracker";
import { AccessibilityDetector } from "../../utils/interfaces/AccessibilityDetector";
import { accessibilityDetector as defaultAccessibilityDetector } from "../../utils/AccessibilityDetector";
import type { ElementSelector } from "../../utils/interfaces/ElementSelector";
import type { Timer } from "../../utils/SystemTimer";
import { NodeCryptoService } from "../../utils/crypto";
import { ViewHierarchy } from "../observe/ViewHierarchy";
import { serverConfig } from "../../utils/ServerConfig";
import { attachRawViewHierarchy } from "../../utils/viewHierarchySearch";
import { refreshAndroidViewHierarchy } from "./refreshAndroidViewHierarchy";
import { boundsEqual } from "../../utils/bounds";
import { isTruthyFlag } from "../../utils/elementProperties";
import { TalkBackTapStrategy } from "../talkback/TalkBackTapStrategy";
import {
  DefaultTalkBackNavigationDriverFactory,
  type TalkBackNavigationDriverFactory
} from "../talkback/TalkBackNavigationDriver";

type SearchUntilStats = NonNullable<TapOnElementResult["searchUntil"]>;

/**
 * Dependencies for TapOnElement that can be injected for testing.
 */
export interface TapOnElementDependencies {
  visionConfig?: VisionFallbackConfig;
  screenshotCapturer?: ScreenshotCapturer;
  visionAnalyzer?: VisionAnalyzer;
  selectionStateTracker?: SelectionStateTracker;
  accessibilityDetector?: AccessibilityDetector;
  timer?: Timer;
  elementSelector?: ElementSelector;
  talkBackStrategy?: TalkBackTapStrategy;
  talkBackDriverFactory?: TalkBackNavigationDriverFactory;
}

/**
 * Command to tap on UI element containing specified text
 */
export class TapOnElement extends BaseVisualChange {
  private finder: ElementFinder;
  private geometry: ElementGeometry;
  private elementParser: ElementParser;
  private accessibilityService: CtrlProxyClient;
  private visionConfig: VisionFallbackConfig;
  private screenshotCapturer: ScreenshotCapturer;
  private visionAnalyzer: VisionAnalyzer | undefined;
  private selectionStateTracker: SelectionStateTracker;
  private accessibilityDetector: AccessibilityDetector;
  private elementSelector: ElementSelector;
  private viewHierarchy: ViewHierarchy;
  private talkBackStrategy: TalkBackTapStrategy;
  private talkBackDriverFactory: TalkBackNavigationDriverFactory;
  private static readonly SEARCH_UNTIL_DEFAULT_MS = 500;
  private static readonly SEARCH_UNTIL_MIN_MS = 100;
  private static readonly SEARCH_UNTIL_MAX_MS = 12000;

  constructor(
    device: BootedDevice,
    adb: AdbClient | null = null,
    options: TapOnElementDependencies = {}
  ) {
    super(device, adb, options.timer);
    this.finder = new DefaultElementFinder();
    this.geometry = new DefaultElementGeometry();
    this.elementParser = new DefaultElementParser();
    this.accessibilityService = CtrlProxyClient.getInstance(device, this.adbFactory);
    this.visionConfig = options.visionConfig || DEFAULT_VISION_CONFIG;
    this.screenshotCapturer = options.screenshotCapturer ?? new TakeScreenshotCapturer(device, this.adbFactory);
    this.visionAnalyzer = options.visionAnalyzer;
    this.viewHierarchy = new ViewHierarchy(device, this.adbFactory);
    this.selectionStateTracker = options.selectionStateTracker ?? new SelectionStateTracker({
      screenshotCapturer: this.screenshotCapturer
    });
    this.accessibilityDetector = options.accessibilityDetector || defaultAccessibilityDetector;
    this.elementSelector = options.elementSelector ?? new DefaultElementSelector();
    this.talkBackStrategy = options.talkBackStrategy ?? new TalkBackTapStrategy({ timer: this.timer });
    this.talkBackDriverFactory = options.talkBackDriverFactory ?? new DefaultTalkBackNavigationDriverFactory(this.adbFactory);
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

  private validateOptions(options: TapOnElementOptions): string | null {
    const selectorCount = [options.text, options.elementId].filter(Boolean).length;
    if (selectorCount !== 1) {
      return "tapOn requires exactly one of text or elementId";
    }

    if (options.container) {
      const containerSelectorCount = [options.container.elementId, options.container.text].filter(Boolean).length;
      if (containerSelectorCount !== 1) {
        return "tapOn container must specify exactly one of elementId or text";
      }
    }

    return null;
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
  ): { selection: ElementSelectionResult; containerFound: boolean } {
    const containerFound = this.isContainerAvailable(viewHierarchy, options.container);
    if (options.text) {
      return {
        selection: this.elementSelector.selectByText(viewHierarchy, options.text, {
          container: options.container,
          partialMatch: true,
          caseSensitive: false,
          strategy: options.selectionStrategy
        }),
        containerFound
      };
    }
    if (options.elementId) {
      return {
        selection: this.elementSelector.selectByResourceId(viewHierarchy, options.elementId, {
          container: options.container,
          partialMatch: false,
          strategy: options.selectionStrategy
        }),
        containerFound
      };
    }
    throw new ActionableError("tapOn requires non-blank text or elementId to interact with");
  }

  private prepareViewHierarchyForResponse(
    rawHierarchy: ViewHierarchyResult,
    screenSize?: ObserveResult["screenSize"]
  ): ViewHierarchyResult {
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

    if (this.device.platform === "android") {
      const filtered = this.viewHierarchy.filterViewHierarchy(rawHierarchy);
      attachRawViewHierarchy(filtered, rawHierarchy);
      return filtered;
    }

    if (this.device.platform === "ios" && screenSize?.width && screenSize?.height) {
      const filtered = this.viewHierarchy.filterOffscreenNodes(
        rawHierarchy,
        screenSize.width,
        screenSize.height
      );
      attachRawViewHierarchy(filtered, rawHierarchy);
      return filtered;
    }

    return rawHierarchy;
  }

  private async refreshViewHierarchy(
    timeoutMs: number,
    screenSize?: ObserveResult["screenSize"],
    signal?: AbortSignal
  ): Promise<ViewHierarchyResult | null> {
    const effectiveTimeoutMs = Math.max(0, timeoutMs);
    switch (this.device.platform) {
      case "android": {
        const rawHierarchy = await refreshAndroidViewHierarchy(
          this.accessibilityService,
          this.viewHierarchy,
          effectiveTimeoutMs,
          signal
        );

        return rawHierarchy
          ? this.prepareViewHierarchyForResponse(rawHierarchy, screenSize)
          : null;
      }
      case "ios":
      {
        const xcTestClient = XCTestServiceClient.getInstance(this.device);
        const rawHierarchy = await xcTestClient.getAccessibilityHierarchy();
        return rawHierarchy
          ? this.prepareViewHierarchyForResponse(rawHierarchy, screenSize)
          : null;
      }
      default:
        throw new ActionableError(`Unsupported platform: ${this.device.platform}`);
    }
  }

  private async searchForElement(
    options: TapOnElementOptions,
    observeResult: ObserveResult,
    signal?: AbortSignal
  ): Promise<{
    selection: ElementSelectionResult;
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
    let selection = initialSearch.selection;
    let element = selection.element;
    let containerFoundEver = initialSearch.containerFound;

    if (!element) {
      const deadline = startTime + searchDurationMs;
      while (this.timer.now() < deadline) {
        throwIfAborted(signal);
        const remainingTimeMs = Math.max(0, deadline - this.timer.now());
        const refreshedHierarchy = await this.refreshViewHierarchy(
          remainingTimeMs,
          observeResult.screenSize,
          signal
        );
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
        selection = searchResult.selection;
        element = selection.element;
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
      selection,
      viewHierarchy: latestViewHierarchy,
      containerFound: containerFoundEver,
      stats
    };
  }

  private buildSelectedElementMetadata(selection: ElementSelectionResult): TapOnSelectedElement | undefined {
    if (!selection.element) {
      return undefined;
    }

    const bounds = selection.element.bounds;
    const center = this.geometry.getElementCenter(selection.element);
    const text = typeof selection.element.text === "string" && selection.element.text.length > 0
      ? selection.element.text
      : (typeof selection.element["content-desc"] === "string"
        ? selection.element["content-desc"]
        : (typeof selection.element["ios-accessibility-label"] === "string"
          ? selection.element["ios-accessibility-label"]
          : ""));
    const resourceId = typeof selection.element["resource-id"] === "string"
      ? selection.element["resource-id"]
      : "";

    return {
      text,
      resourceId,
      bounds: {
        left: bounds.left,
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
        centerX: center.x,
        centerY: center.y
      },
      indexInMatches: selection.indexInMatches,
      totalMatches: selection.totalMatches,
      selectionStrategy: selection.strategy
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

    let baseError: string;
    if (options.text) {
      const containerHint = options.container
        ? ` within container ${options.container.elementId ? `elementId '${options.container.elementId}'` : `text '${options.container.text}'`}`
        : "";
      baseError = `Element not found with provided text '${options.text}'${containerHint}`;
    } else {
      const containerHint = options.container
        ? ` within container ${options.container.elementId ? `elementId '${options.container.elementId}'` : `text '${options.container.text}'`}`
        : "";
      baseError = `Element not found with provided elementId '${options.elementId}'${containerHint}`;
    }

    if (this.visionConfig.enabled && observeResult) {
      logger.info("🔍 Element not found after polling, trying vision fallback...");
      const enrichedMsg = await getVisionEnrichedError(
        this.screenshotCapturer,
        observeResult.viewHierarchy,
        {
          text: options.text,
          resourceId: options.elementId,
          description: `Interactive element for tapping (action: ${options.action})`,
        },
        this.visionConfig,
        baseError,
        signal,
        this.visionAnalyzer
      );
      throw new ActionableError(enrichedMsg);
    }

    throw new ActionableError(baseError);
  }

  private isContainerAvailable(
    viewHierarchy: ViewHierarchyResult,
    container?: { elementId?: string; text?: string }
  ): boolean {
    if (!container) {
      return true;
    }

    return this.finder.hasContainerElement(viewHierarchy, container);
  }

  private isClickableElement(element: Element): boolean {
    return isTruthyFlag(element.clickable);
  }

  private isLongClickableElement(element: Element): boolean {
    return isTruthyFlag(element["long-clickable"]) || isTruthyFlag(element.longClickable);
  }

  private isClickableProps(props: Record<string, unknown>): boolean {
    return isTruthyFlag(props.clickable);
  }

  private isLongClickableProps(props: Record<string, unknown>): boolean {
    return isTruthyFlag(props["long-clickable"]) || isTruthyFlag(props.longClickable);
  }

  private nodeMatchesElement(
    target: Element,
    props: Record<string, unknown>,
    parsed: Element
  ): boolean {
    if (!boundsEqual(parsed.bounds, target.bounds)) {
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

    const validationError = this.validateOptions(options);
    if (validationError) {
      return this.createErrorResult(options.action, validationError);
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
          if (!searchOutcome.selection.element) {
            await this.handleElementNotFound(options, observeResult, searchOutcome.containerFound, signal);
          }
          const selection = searchOutcome.selection;
          const element = selection.element as Element;
          const selectedElementMetadata = this.buildSelectedElementMetadata(selection);
          const initialTapPoint = this.geometry.getElementCenter(element);
          let action = options.action;
          const longPressDuration = this.getLongPressDuration(options, this.device.platform);

          if (action === "focus") {
            // Check if element is already focused
            const isFocused = this.finder.isElementFocused(element);

            if (isFocused) {
              logger.info(`Element is already focused, no action needed`);
              perf.end();
              return {
                success: true,
                action,
                element: element,
                selectedElement: selectedElementMetadata,
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
            ? (await this.accessibilityDetector.detectMethod(this.device.id, this.adb)) === "talkback"
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
          const tapPoint = this.geometry.getElementCenter(tapElement);

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
            selectedElement: selectedElementMetadata,
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
    // Check if TalkBack is enabled (not just any accessibility service)
    const talkBackEnabled = typeof isTalkBackEnabled === "boolean"
      ? isTalkBackEnabled
      : (await this.accessibilityDetector.detectMethod(this.device.id, this.adb)) === "talkback";

    const resourceId = element?.["resource-id"];

    // Use accessibility service only if TalkBack is enabled AND element has resource-id
    // Otherwise fall back to coordinate-based tapping
    if (talkBackEnabled && resourceId) {
      // TalkBack mode: Use CtrlProxy ACTION_CLICK with coordinate fallback
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
   * Execute tap using CtrlProxy actions (TalkBack mode)
   * Uses focus navigation when TalkBack is enabled, falls back to coordinate-based tapping if navigation fails
   */
  private async executeAndroidTapWithAccessibility(
    action: string,
    x: number,
    y: number,
    element: Element,
    durationMs: number,
    _options?: TapOnElementOptions,
    signal?: AbortSignal
  ): Promise<void> {
    const resourceId = element?.["resource-id"];
    if (!resourceId) {
      logger.warn("[TapOnElement] Element has no resource-id, falling back to coordinate-based tap");
      await this.executeAndroidTapWithCoordinates(action, x, y, durationMs, element, signal);
      return;
    }

    const driver = this.talkBackDriverFactory.createDriver(this.device);

    // Try focus navigation for tap and doubleTap actions
    // Long press still uses coordinate-based approach as it's more reliable
    if (action === "tap" || action === "doubleTap") {
      const result = await this.talkBackStrategy.executeTap(
        this.device.id,
        element,
        action as "tap" | "doubleTap",
        driver
      );

      if (result.success) {
        return;
      }

      logger.warn(
        `[TapOnElement] Focus navigation failed (${result.error}), ` +
        `falling back to coordinate-based tap at (${x}, ${y})`
      );
    }

    // Fallback to coordinate-based taps via accessibility service dispatchGesture
    const fallbackAction = action as "tap" | "doubleTap" | "longPress";
    const fallbackResult = await this.talkBackStrategy.executeCoordinateFallback(
      x,
      y,
      fallbackAction,
      durationMs,
      driver
    );

    if (!fallbackResult.success) {
      logger.warn(
        `[TapOnElement] Accessibility coordinate tap failed (${fallbackResult.error}), ` +
        `falling back to ADB tap at (${x}, ${y})`
      );
      await this.executeAndroidTapWithCoordinates(action, x, y, durationMs, element, signal);
    }
  }

  /**
   * Execute iOS-specific tap operations using XCTestService
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
    // Use short duration (50ms) for tap/doubleTap, full duration for longPress
    const tapDuration = action === "longPress" ? durationMs : 50;

    const client = XCTestServiceClient.getInstance(this.device);

    if (action === "doubleTap") {
      // Double tap - perform two taps
      const firstResult = await client.requestTapCoordinates(x, y, tapDuration);
      if (!firstResult.success) {
        throw new ActionableError(`XCTestService tap failed: ${firstResult.error}`);
      }

      await this.timer.sleep(200);

      const secondResult = await client.requestTapCoordinates(x, y, tapDuration);
      if (!secondResult.success) {
        throw new ActionableError(`XCTestService second tap failed: ${secondResult.error}`);
      }
    } else {
      // Single tap or long press
      const result = await client.requestTapCoordinates(x, y, tapDuration);
      if (!result.success) {
        throw new ActionableError(`XCTestService tap failed: ${result.error}`);
      }
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
    const currentRoots = this.elementParser.extractRootNodes(currentHierarchy);

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
    const currentRoots = this.elementParser.extractRootNodes(currentHierarchy);
    if (currentRoots.length === 0) {
      return false;
    }

    return currentRoots.some(root => !previousRoots.has(this.getRootSignature(root)));
  }

  private detectSelectionStarted(currentHierarchy?: ViewHierarchyResult): boolean {
    if (!currentHierarchy) {
      return false;
    }

    const roots = this.elementParser.extractRootNodes(currentHierarchy);
    let selectionFound = false;
    const selectionKeyPairs: Array<[string, string]> = [
      ["textSelectionStart", "textSelectionEnd"],
      ["selectionStart", "selectionEnd"]
    ];

    for (const root of roots) {
      this.elementParser.traverseNode(root, (node: any) => {
        if (selectionFound) {
          return;
        }
        const props = this.elementParser.extractNodeProperties(node);
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
    const roots = this.elementParser.extractRootNodes(viewHierarchy);
    return new Set(roots.map(root => this.getRootSignature(root)));
  }

  private getRootSignature(root: any): string {
    const props = this.elementParser.extractNodeProperties(root);
    const resourceId = props["resource-id"] ?? props.resourceId ?? "";
    const className = props.class ?? props.className ?? "";
    const bounds = props.bounds ?? "";
    const text = props.text ?? props["content-desc"] ?? "";
    return `${resourceId}|${className}|${bounds}|${text}`;
  }

  private containsMenuIndicators(root: any): boolean {
    let found = false;
    this.elementParser.traverseNode(root, (node: any) => {
      if (found) {
        return;
      }
      const props = this.elementParser.extractNodeProperties(node);
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
