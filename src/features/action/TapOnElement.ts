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
import type { Timer } from "../../utils/SystemTimer";

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
  private static readonly MAX_ATTEMPTS = 5;
  private static readonly AWAIT_POLL_INTERVAL_MS = 100;

  constructor(
    device: BootedDevice,
    adb: AdbClient | null = null,
    axe: AxeClient | null = null,
    webdriver: WebDriverAgent | null = null,
    visionConfig?: VisionFallbackConfig,
    selectionStateTracker?: SelectionStateTracker,
    accessibilityDetector?: AccessibilityDetector,
    timer?: Timer
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

  async handleElementResult(
    element: Element | null,
    options: TapOnElementOptions,
    attempt: number,
    observeResult?: ObserveResult,
    signal?: AbortSignal,
    containerFound: boolean = true
  ): Promise<Element> {
    if (!element && attempt < TapOnElement.MAX_ATTEMPTS) {
      const delayNextAttempt = Math.min(10 * Math.pow(2, attempt), 1000);
      await this.timer.sleep(delayNextAttempt);

      let latestViewHierarchy: ViewHierarchyResult | null = null;

      // Platform-specific view hierarchy retrieval
      switch (this.device.platform) {
        case "android":
          const queryOptions = {
            query: options.text || options.elementId || "",
            containerElementId: options.container?.elementId
          };
          latestViewHierarchy = await this.accessibilityService.getAccessibilityHierarchy(queryOptions, undefined, false, 0, signal);
          break;
        case "ios":
          latestViewHierarchy = await this.webdriver.getViewHierarchy(this.device);
          break;
        default:
          throw new ActionableError(`Unsupported platform: ${this.device.platform}`);
      }

      if (latestViewHierarchy) {
        logger.info(`Retrying to find element after ${delayNextAttempt}ms delay`);
        return await this.findElementToTap(
          options,
          latestViewHierarchy,
          attempt + 1,
          observeResult,
          signal
        );
      }
    }

    if (!element && options.container && !containerFound) {
      const containerLabel = options.container.elementId
        ? `elementId '${options.container.elementId}'`
        : `text '${options.container.text}'`;
      throw new ActionableError(
        `Container element not found with provided ${containerLabel}`
      );
    }

    // Vision fallback: Try Claude vision API if all retries exhausted
    if (!element && attempt >= TapOnElement.MAX_ATTEMPTS && this.visionConfig.enabled && observeResult) {
      logger.info("🔍 Element not found after retries, trying vision fallback...");

      try {
        // Take a screenshot for vision analysis
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

        // If high confidence navigation steps provided, throw error with steps
        if (visionResult.confidence === "high" && visionResult.navigationSteps && visionResult.navigationSteps.length > 0) {
          const stepsText = visionResult.navigationSteps
            .map((step, i) => `${i + 1}. ${step.description}`)
            .join("\n");

          throw new ActionableError(
            `Element not found, but AI suggests these steps:\n${stepsText}\n\n` +
            `(Cost: $${visionResult.costUsd.toFixed(4)}, Confidence: ${visionResult.confidence})`
          );
        }

        // If alternative selectors found, throw error with suggestions
        if (visionResult.alternativeSelectors && visionResult.alternativeSelectors.length > 0) {
          const suggestions = visionResult.alternativeSelectors
            .map(alt => `- ${alt.type}: "${alt.value}" (${alt.reasoning})`)
            .join("\n");

          throw new ActionableError(
            `Element not found. AI suggests trying:\n${suggestions}\n\n` +
            `(Cost: $${visionResult.costUsd.toFixed(4)}, Confidence: ${visionResult.confidence})`
          );
        }

        // Otherwise, throw detailed error with vision insights
        throw new ActionableError(
          `Element not found. ${visionResult.reason || "No clear path found."}\n\n` +
          `(Cost: $${visionResult.costUsd.toFixed(4)}, Confidence: ${visionResult.confidence})`
        );

      } catch (error) {
        if (error instanceof ActionableError) {
          throw error;
        }
        logger.error("Vision fallback failed:", error);
        // Fall through to standard error
      }
    }

    if (!element) {
      if (options.text) {
        const containerHint = options.container
          ? ` within container ${options.container.elementId ? `elementId '${options.container.elementId}'` : `text '${options.container.text}'`}`
          : "";
        throw new ActionableError(`Element not found with provided text '${options.text}'${containerHint}`);
      } else {
        const containerHint = options.container
          ? ` within container ${options.container.elementId ? `elementId '${options.container.elementId}'` : `text '${options.container.text}'`}`
          : "";
        throw new ActionableError(`Element not found with provided elementId '${options.elementId}'${containerHint}`);
      }
    }

    return element;
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

  async findElementToTap(
    options: TapOnElementOptions,
    viewHierarchy: ViewHierarchyResult,
    attempt: number = 0,
    observeResult?: ObserveResult,
    signal?: AbortSignal
  ): Promise<Element> {
    const containerFound = this.isContainerAvailable(viewHierarchy, options.container);
    if (options.text) {
      // Find the UI element that contains the text
      const element = this.elementUtils.findElementByText(
        viewHierarchy,
        options.text,
        options.container,
        true,
        false,
      );

      return await this.handleElementResult(element, options, attempt, observeResult, signal, containerFound);
    } else if (options.elementId) {
      // Find the UI element that matches the id
      const element = this.elementUtils.findElementByResourceId(
        viewHierarchy,
        options.elementId,
        options.container,
      );

      return await this.handleElementResult(element, options, attempt, observeResult, signal, containerFound);
    } else {
      throw new ActionableError(`tapOn requires non-blank text or elementId to interact with`);
    }
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

    try {
      throwIfAborted(signal);
      // Tap on the calculated point using observedChange
      const result = await this.observedInteraction(
        async (observeResult: ObserveResult) => {
          previousObserveResult = observeResult;
          throwIfAborted(signal);

          const viewHierarchy = observeResult.viewHierarchy;
          if (!viewHierarchy) {
            perf.end();
            return { success: false, error: "Unable to get view hierarchy, cannot tap on element" };
          }

          const element = await perf.track("findElement", () =>
            this.findElementToTap(options, viewHierarchy, 0, observeResult, signal)
          );
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
              await: options.await,
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
      if (!result.success || !options.await?.element) {
        return result;
      }

      if (!options.await.element.id && !options.await.element.text) {
        return {
          ...result,
          success: false,
          error: "await.element requires either id or text",
          awaitTimeout: true,
          awaitDuration: 0
        };
      }

      const awaitOutcome = await this.waitForAwaitElement(
        options.await,
        result.observation
      );

      const awaitResult: TapOnElementResult = {
        ...result,
        awaitedElement: awaitOutcome.awaitedElement,
        awaitDuration: awaitOutcome.awaitDuration,
        awaitTimeout: awaitOutcome.awaitTimeout,
        observation: awaitOutcome.observation || result.observation
      };

      if (awaitOutcome.awaitTimeout && options.strictAwait) {
        return {
          ...awaitResult,
          success: false,
          error: "Tap succeeded but awaited element not found within timeout"
        };
      }

      return awaitResult;
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
      // TalkBack mode: Use AccessibilityService ACTION_CLICK
      await this.executeAndroidTapWithAccessibility(action, element, durationMs, options, signal);
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
   */
  private async executeAndroidTapWithAccessibility(
    action: string,
    element: Element,
    durationMs: number,
    options?: TapOnElementOptions,
    signal?: AbortSignal
  ): Promise<void> {
    const resourceId = element?.["resource-id"];
    if (!resourceId) {
      throw new ActionableError("Cannot perform accessibility action: element has no resource-id");
    }

    // Determine if we should set accessibility focus first
    // Default to true for TalkBack mode (mimics user behavior)
    const shouldFocusFirst = options?.focusFirst ?? true;

    if (shouldFocusFirst && action !== "longPress") {
      // Set accessibility focus before action (except for long press which handles focus internally)
      try {
        await this.accessibilityService.requestAction("focus", resourceId);
        // Brief delay for TalkBack announcement
        await this.timer.sleep(100);
      } catch (error) {
        logger.warn(`[TapOnElement] Failed to set accessibility focus: ${error}`);
        // Continue with action anyway
      }
    }

    if (action === "tap") {
      const result = await this.accessibilityService.requestAction("click", resourceId);
      if (!result.success) {
        throw new ActionableError(`Failed to perform accessibility click: ${result.error}`);
      }
    } else if (action === "longPress") {
      const result = await this.accessibilityService.requestAction("long_click", resourceId);
      if (!result.success) {
        throw new ActionableError(`Failed to perform accessibility long click: ${result.error}`);
      }
    } else if (action === "doubleTap") {
      // Double tap: Two ACTION_CLICK calls with delay
      const result1 = await this.accessibilityService.requestAction("click", resourceId);
      if (!result1.success) {
        throw new ActionableError(`Failed to perform first accessibility click: ${result1.error}`);
      }
      await this.timer.sleep(100);
      const result2 = await this.accessibilityService.requestAction("click", resourceId);
      if (!result2.success) {
        throw new ActionableError(`Failed to perform second accessibility click: ${result2.error}`);
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

  private async waitForAwaitElement(
    awaitOptions: NonNullable<TapOnElementOptions["await"]>,
    initialObservation?: ObserveResult
  ): Promise<{
    awaitedElement?: Element;
    awaitDuration: number;
    awaitTimeout: boolean;
    observation?: ObserveResult;
  }> {
    const startTime = this.timer.now();
    const timeoutMs = awaitOptions.timeout ?? 5000;
    const queryOptions = {
      text: awaitOptions.element.text,
      elementId: awaitOptions.element.id
    };

    if (initialObservation?.viewHierarchy) {
      const existing = this.findAwaitElement(awaitOptions, initialObservation.viewHierarchy);
      if (existing) {
        return {
          awaitedElement: existing,
          awaitDuration: this.timer.now() - startTime,
          awaitTimeout: false,
          observation: initialObservation
        };
      }
    }

    let lastObservation: ObserveResult | undefined;

    while (this.timer.now() - startTime < timeoutMs) {
      const observation = await this.observeScreen.execute(
        queryOptions,
        new NoOpPerformanceTracker(),
        false,
        startTime
      );
      lastObservation = observation;

      if (observation.viewHierarchy) {
        const found = this.findAwaitElement(awaitOptions, observation.viewHierarchy);
        if (found) {
          return {
            awaitedElement: found,
            awaitDuration: this.timer.now() - startTime,
            awaitTimeout: false,
            observation
          };
        }
      }

      await this.timer.sleep(TapOnElement.AWAIT_POLL_INTERVAL_MS);
    }

    return {
      awaitDuration: this.timer.now() - startTime,
      awaitTimeout: true,
      observation: lastObservation
    };
  }

  private findAwaitElement(
    awaitOptions: NonNullable<TapOnElementOptions["await"]>,
    viewHierarchy: ViewHierarchyResult
  ): Element | null {
    if (awaitOptions.element.id) {
      return this.elementUtils.findElementByResourceId(
        viewHierarchy,
        awaitOptions.element.id,
        undefined
      );
    }

    if (awaitOptions.element.text) {
      return this.elementUtils.findElementByText(
        viewHierarchy,
        awaitOptions.element.text,
        undefined,
        true,
        false
      );
    }

    return null;
  }
}
