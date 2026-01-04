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
import { logger } from "../../utils/logger";
import { AccessibilityServiceClient } from "../observe/AccessibilityServiceClient";
import { AxeClient } from "../../utils/ios-cmdline-tools/AxeClient";
import { WebDriverAgent } from "../../utils/ios-cmdline-tools/WebDriverAgent";
import { createGlobalPerformanceTracker } from "../../utils/PerformanceTracker";
import { VisionFallback, DEFAULT_VISION_CONFIG, type VisionFallbackConfig } from "../../vision/index";
import { TakeScreenshot } from "../observe/TakeScreenshot";
import { buildElementSearchDebugContext } from "../../utils/DebugContextBuilder";
import { throwIfAborted } from "../../utils/toolUtils";

/**
 * Command to tap on UI element containing specified text
 */
export class TapOnElement extends BaseVisualChange {
  private webdriver: WebDriverAgent;
  private elementUtils: ElementUtils;
  private accessibilityService: AccessibilityServiceClient;
  private visionConfig: VisionFallbackConfig;
  private static readonly MAX_ATTEMPTS = 5;

  constructor(
    device: BootedDevice,
    adb: AdbClient | null = null,
    axe: AxeClient | null = null,
    webdriver: WebDriverAgent | null = null,
    visionConfig?: VisionFallbackConfig
  ) {
    super(device, adb, axe);
    this.elementUtils = new ElementUtils();
    this.accessibilityService = AccessibilityServiceClient.getInstance(device, this.adb);
    this.webdriver = webdriver || new WebDriverAgent(device);
    this.visionConfig = visionConfig || DEFAULT_VISION_CONFIG;
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
    signal?: AbortSignal
  ): Promise<Element> {
    if (!element && attempt < TapOnElement.MAX_ATTEMPTS) {
      const delayNextAttempt = Math.min(10 * Math.pow(2, attempt), 1000);
      await new Promise(resolve => setTimeout(resolve, delayNextAttempt));

      let latestViewHierarchy: ViewHierarchyResult | null = null;

      // Platform-specific view hierarchy retrieval
      switch (this.device.platform) {
        case "android":
          const queryOptions = {
            query: options.text || options.elementId || "",
            containerElementId: options.containerElementId
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
        throw new ActionableError(`Element not found with provided text '${options.text}'`);
      } else {
        throw new ActionableError(`Element not found with provided elementId '${options.elementId}'`);
      }
    }

    return element;
  }

  async findElementToTap(
    options: TapOnElementOptions,
    viewHierarchy: ViewHierarchyResult,
    attempt: number = 0,
    observeResult?: ObserveResult,
    signal?: AbortSignal
  ): Promise<Element> {
    if (options.text) {
      // Find the UI element that contains the text
      const element = this.elementUtils.findElementByText(
        viewHierarchy,
        options.text,
        options.containerElementId,
        true,
        false,
      );

      return await this.handleElementResult(element, options, attempt, observeResult, signal);
    } else if (options.elementId) {
      // Find the UI element that matches the id
      const element = this.elementUtils.findElementByResourceId(
        viewHierarchy,
        options.elementId,
        options.containerElementId,
      );

      return await this.handleElementResult(element, options, attempt, observeResult, signal);
    } else {
      throw new ActionableError(`tapOn requires non-blank text or elementId to interact with`);
    }
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
          const tapPoint = this.elementUtils.getElementCenter(element);
          const action = options.action;
          const longPressDuration = this.getLongPressDuration(options, this.device.platform);
          const dragTarget = action === "longPressDrag"
            ? this.resolveDragTarget(options, viewHierarchy)
            : null;

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
                x: tapPoint.x,
                y: tapPoint.y
              };
            }

            // if not, change action to tap
            options.action = "tap";
          }

          // Platform-specific tap execution
          await perf.track("executeTap", async () => {
            switch (this.device.platform) {
              case "android":
                await this.executeAndroidTap(
                  options.action,
                  tapPoint.x,
                  tapPoint.y,
                  longPressDuration,
                  element,
                  dragTarget,
                  signal
                );
                break;
              case "ios":
                await this.executeiOSTap(options.action, tapPoint.x, tapPoint.y, longPressDuration, dragTarget);
                break;
              default:
                throw new ActionableError(`Unsupported platform: ${this.device.platform}`);
            }
          });

          perf.end();
          return {
            success: true,
            action: options.action,
            element,
          };
        },
        {
          queryOptions: {
            text: options.text,
            elementId: options.elementId,
            containerElementId: options.containerElementId
          },
          changeExpected: false,
          timeoutMs: 800, // Reduce timeout for faster execution
          progress,
          perf,
          signal
        }
      );
      if (options.action === "longPress" || options.action === "longPressDrag") {
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
          containerElementId: options.containerElementId
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
   * @param dragTarget - Optional drag target
   */
  private async executeAndroidTap(
    action: string,
    x: number,
    y: number,
    durationMs: number,
    element: Element,
    dragTarget?: { x: number; y: number } | null,
    signal?: AbortSignal
  ): Promise<void> {
    if (action === "tap") {
      await this.adb.executeCommand(`shell input tap ${x} ${y}`, undefined, undefined, undefined, signal);
    } else if (action === "longPress") {
      await this.executeAndroidLongPress(x, y, durationMs, element?.["resource-id"], signal);
    } else if (action === "longPressDrag") {
      if (!dragTarget) {
        throw new ActionableError("longPressDrag requires a dragTo target");
      }
      await this.executeAndroidLongPressDrag(x, y, dragTarget.x, dragTarget.y, durationMs, signal);
    } else if (action === "doubleTap") {
      await this.adb.executeCommand(`shell input tap ${x} ${y}`, undefined, undefined, undefined, signal);
      await new Promise(resolve => setTimeout(resolve, 200));
      await this.adb.executeCommand(`shell input tap ${x} ${y}`, undefined, undefined, undefined, signal);
    }
  }

  /**
   * Execute iOS-specific tap operations
   * @param action - The tap action to perform
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param durationMs - Long press duration in milliseconds
   * @param dragTarget - Optional drag target
   */
  private async executeiOSTap(
    action: string,
    x: number,
    y: number,
    durationMs: number,
    dragTarget?: { x: number; y: number } | null
  ): Promise<void> {
    if (action === "tap") {
      await this.axe.tap(x, y);
    } else if (action === "longPress") {
      // iOS long press is implemented as a tap with longer duration
      await this.axe.tap(x, y, durationMs);
    } else if (action === "longPressDrag") {
      if (!dragTarget) {
        throw new ActionableError("longPressDrag requires a dragTo target");
      }
      await this.axe.tap(x, y, durationMs);
      await this.axe.swipe(x, y, dragTarget.x, dragTarget.y);
    } else if (action === "doubleTap") {
      // iOS double tap - perform two quick taps
      await this.axe.tap(x, y);
      await new Promise(resolve => setTimeout(resolve, 200));
      await this.axe.tap(x, y);
    }
  }

  private getLongPressDuration(options: TapOnElementOptions, platform: "android" | "ios"): number {
    if (typeof options.duration === "number" && options.duration > 0) {
      return options.duration;
    }
    return platform === "android" ? 500 : 1000;
  }

  private resolveDragTarget(
    options: TapOnElementOptions,
    viewHierarchy: ViewHierarchyResult
  ): { x: number; y: number } {
    const dragTo = options.dragTo;
    if (!dragTo) {
      throw new ActionableError("longPressDrag requires a dragTo target");
    }

    if (typeof dragTo.x === "number" && typeof dragTo.y === "number") {
      return { x: dragTo.x, y: dragTo.y };
    }

    if (dragTo.text) {
      const targetElement = this.elementUtils.findElementByText(
        viewHierarchy,
        dragTo.text,
        options.containerElementId,
        true,
        false
      );
      if (!targetElement) {
        throw new ActionableError(`Drag target not found with provided text '${dragTo.text}'`);
      }
      return this.elementUtils.getElementCenter(targetElement);
    }

    if (dragTo.elementId) {
      const targetElement = this.elementUtils.findElementByResourceId(
        viewHierarchy,
        dragTo.elementId,
        options.containerElementId
      );
      if (!targetElement) {
        throw new ActionableError(`Drag target not found with provided elementId '${dragTo.elementId}'`);
      }
      return this.elementUtils.getElementCenter(targetElement);
    }

    throw new ActionableError("Drag target must include coordinates, text, or elementId");
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

  private async executeAndroidLongPressDrag(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    durationMs: number,
    signal?: AbortSignal
  ): Promise<void> {
    throwIfAborted(signal);
    try {
      await this.adb.executeCommand(`shell input touchscreen swipe ${startX} ${startY} ${endX} ${endY} ${durationMs}`, undefined, undefined, undefined, signal);
    } catch (error) {
      logger.warn(`[TapOnElement] touch input swipe failed, falling back to input swipe: ${error}`);
      await this.adb.executeCommand(`shell input swipe ${startX} ${startY} ${endX} ${endY} ${durationMs}`, undefined, undefined, undefined, signal);
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
    if (!currentHierarchy?.windows || currentHierarchy.windows.length === 0) {
      return false;
    }
    const previousWindowTypes = new Set(
      (previousHierarchy?.windows || []).map(window => window.windowType.toLowerCase())
    );

    return currentHierarchy.windows.some(window => {
      const windowType = window.windowType.toLowerCase();
      const isMenu = windowType.includes("menu") || windowType.includes("popup");
      return isMenu && !previousWindowTypes.has(windowType);
    });
  }

  private detectNewWindow(
    previousHierarchy?: ViewHierarchyResult,
    currentHierarchy?: ViewHierarchyResult
  ): boolean {
    const previousWindows = previousHierarchy?.windows || [];
    const currentWindows = currentHierarchy?.windows || [];
    if (currentWindows.length === 0) {
      return false;
    }
    const previousSignatures = new Set(
      previousWindows.map(window => `${window.windowId}:${window.windowType}:${window.windowLayer}`)
    );
    return currentWindows.some(window =>
      !previousSignatures.has(`${window.windowId}:${window.windowType}:${window.windowLayer}`)
    );
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
}
