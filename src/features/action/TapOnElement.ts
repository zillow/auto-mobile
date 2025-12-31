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
    observeResult?: ObserveResult
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
        return await this.findElementToTap(
          options,
          latestViewHierarchy,
          attempt + 1,
          observeResult
        );
      }
    }

    // Vision fallback: Try Claude vision API if all retries exhausted
    if (!element && attempt >= TapOnElement.MAX_ATTEMPTS && this.visionConfig.enabled && observeResult) {
      logger.info("🔍 Element not found after retries, trying vision fallback...");

      try {
        // Take a screenshot for vision analysis
        const screenshot = new TakeScreenshot(this.device, this.adb);
        const screenshotResult = await screenshot.execute({});

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
    observeResult?: ObserveResult
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

      return await this.handleElementResult(element, options, attempt, observeResult);
    } else if (options.elementId) {
      // Find the UI element that matches the id
      const element = this.elementUtils.findElementByResourceId(
        viewHierarchy,
        options.elementId,
        options.containerElementId,
      );

      return await this.handleElementResult(element, options, attempt, observeResult);
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
  async execute(options: TapOnElementOptions, progress?: ProgressCallback): Promise<TapOnElementResult> {
    if (!options.action) {
      return this.createErrorResult(options.action, "tap on action is required");
    }

    const perf = createGlobalPerformanceTracker();
    perf.serial("tapOnElement");

    try {
      // Tap on the calculated point using observedChange
      return await this.observedInteraction(
        async (observeResult: ObserveResult) => {

          const viewHierarchy = observeResult.viewHierarchy;
          if (!viewHierarchy) {
            perf.end();
            return { success: false, error: "Unable to get view hierarchy, cannot tap on element" };
          }

          const element = await perf.track("findElement", () =>
            this.findElementToTap(options, viewHierarchy, 0, observeResult)
          );
          const tapPoint = this.elementUtils.getElementCenter(element);

          if (options.action === "focus") {
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
                await this.executeAndroidTap(options.action, tapPoint.x, tapPoint.y);
                break;
              case "ios":
                await this.executeiOSTap(options.action, tapPoint.x, tapPoint.y);
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
          perf
        }
      );
    } catch (error) {
      perf.end();
      throw new ActionableError(`Failed to perform tap on element: ${error}`);
    }
  }

  /**
   * Execute Android-specific tap operations
   * @param action - The tap action to perform
   * @param x - X coordinate
   * @param y - Y coordinate
   */
  private async executeAndroidTap(action: string, x: number, y: number): Promise<void> {
    if (action === "tap") {
      await this.adb.executeCommand(`shell input tap ${x} ${y}`);
    } else if (action === "longPress") {
      await this.adb.executeCommand(`shell input swipe ${x} ${y} ${x} ${y} 1000`);
    } else if (action === "doubleTap") {
      await this.adb.executeCommand(`shell input tap ${x} ${y}`);
      await new Promise(resolve => setTimeout(resolve, 200));
      await this.adb.executeCommand(`shell input tap ${x} ${y}`);
    }
  }

  /**
   * Execute iOS-specific tap operations
   * @param action - The tap action to perform
   * @param x - X coordinate
   * @param y - Y coordinate
   */
  private async executeiOSTap(action: string, x: number, y: number): Promise<void> {
    if (action === "tap") {
      await this.axe.tap(x, y);
    } else if (action === "longPress") {
      // iOS long press is implemented as a tap with longer duration
      await this.axe.tap(x, y, 1000);
    } else if (action === "doubleTap") {
      // iOS double tap - perform two quick taps
      await this.axe.tap(x, y);
      await new Promise(resolve => setTimeout(resolve, 200));
      await this.axe.tap(x, y);
    }
  }
}
