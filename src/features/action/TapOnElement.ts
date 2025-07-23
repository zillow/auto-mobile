import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import {
  ActionableError,
  BootedDevice,
  Element,
  ObserveResult,
  TapOnElementResult,
  ViewHierarchyResult
} from "../../models";
import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { TapOnElementOptions } from "../../models/TapOnElementOptions";
import { ElementUtils } from "../utility/ElementUtils";
import { logger } from "../../utils/logger";
import { AccessibilityServiceClient } from "../observe/AccessibilityServiceClient";
import { IdbPython } from "../../utils/ios-cmdline-tools/idbPython";

/**
 * Command to tap on UI element containing specified text
 */
export class TapOnElement extends BaseVisualChange {
  private elementUtils: ElementUtils;
  private accessibilityService: AccessibilityServiceClient;
  private static readonly MAX_ATTEMPTS = 5;

  constructor(
    device: BootedDevice,
    adb: AdbUtils | null = null,
    idb: IdbPython | null = null
  ) {
    super(device, adb, idb);
    this.elementUtils = new ElementUtils();
    this.accessibilityService = new AccessibilityServiceClient(device, this.adb);
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

  async handleElementResult(element: Element | null, options: TapOnElementOptions, attempt: number): Promise<Element> {
    if (!element && attempt < TapOnElement.MAX_ATTEMPTS) {
      const delayNextAttempt = 100 * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delayNextAttempt));

      let latestViewHierarchy: ViewHierarchyResult | null = null;

      // Platform-specific view hierarchy retrieval
      switch (this.device.platform) {
        case "android":
          latestViewHierarchy = await this.accessibilityService.getAccessibilityHierarchy();
          break;
        case "ios":
          latestViewHierarchy = await this.idb.getViewHierarchy();
          break;
        default:
          throw new ActionableError(`Unsupported platform: ${this.device.platform}`);
      }

      if (latestViewHierarchy) {
        logger.info("Retrying to find element");
        return await this.findElementToTap(
          options,
          latestViewHierarchy,
          attempt + 1
        );
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

  async findElementToTap(options: TapOnElementOptions, viewHierarchy: ViewHierarchyResult, attempt: number = 0): Promise<Element> {
    if (options.text) {
      // Find the UI element that contains the text
      const element = this.elementUtils.findElementByText(
        viewHierarchy,
        options.text,
        options.containerElementId,
        true,
        false,
      );

      return await this.handleElementResult(element, options, attempt);
    } else if (options.elementId) {
      // Find the UI element that matches the id
      const element = this.elementUtils.findElementByResourceId(
        viewHierarchy,
        options.elementId,
        options.containerElementId,
      );

      return await this.handleElementResult(element, options, attempt);
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

    try {
      // Tap on the calculated point using observedChange
      return await this.observedInteraction(
        async (observeResult: ObserveResult) => {

          const viewHierarchy = observeResult.viewHierarchy;
          if (!viewHierarchy) {
            return { success: false, error: "Unable to get view hierarchy, cannot tap on element" };
          }

          const element = await this.findElementToTap(options, viewHierarchy);
          const tapPoint = this.elementUtils.getElementCenter(element);

          if (options.action === "focus") {
            // Check if element is already focused
            const isFocused = this.elementUtils.isElementFocused(element);

            if (isFocused) {
              logger.info(`Element is already focused, no action needed`);
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

          return {
            success: true,
            action: options.action,
            element,
          };
        },
        {
          changeExpected: false,
          timeoutMs: 3000, // Reduce timeout for faster execution
          progress
        }
      );
    } catch (error) {
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
      await this.idb.tap(x, y);
    } else if (action === "longPress") {
      // iOS long press is implemented as a tap with longer duration
      await this.idb.tap(x, y, 1000);
    } else if (action === "doubleTap") {
      // iOS double tap - perform two quick taps
      await this.idb.tap(x, y);
      await new Promise(resolve => setTimeout(resolve, 200));
      await this.idb.tap(x, y);
    }
  }
}
