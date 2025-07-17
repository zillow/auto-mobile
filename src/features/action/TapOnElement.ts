import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { ViewHierarchy } from "../observe/ViewHierarchy";
import { ActionableError, Element, ObserveResult, TapOnElementResult, ViewHierarchyResult } from "../../models";
import { AdbUtils } from "../../utils/adb";
import { TapOnElementOptions } from "../../models/TapOnElementOptions";
import { ElementUtils } from "../utility/ElementUtils";
import { logger } from "../../utils/logger";

/**
 * Command to tap on UI element containing specified text
 */
export class TapOnElement extends BaseVisualChange {
  private viewHierarchy: ViewHierarchy;
  private elementUtils: ElementUtils;

  constructor(deviceId: string, adb: AdbUtils | null = null) {
    super(deviceId, adb);
    this.viewHierarchy = new ViewHierarchy(deviceId, this.adb);
    this.elementUtils = new ElementUtils();
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

  findElementToTap(options: TapOnElementOptions, viewHierarchy: ViewHierarchyResult): Element {
    if (options.text) {
      // Find the UI element that contains the text
      const element = this.elementUtils.findElementByText(
        viewHierarchy,
        options.text,
        options.containerElementId,
        true,
        false,
      );

      if (!element) {
        throw new ActionableError(`Element not found with provided text`);
      }

      return element;
    } else if (options.elementId) {
      // Find the UI element that matches the id
      const elements = this.elementUtils.findElementsByResourceId(
        viewHierarchy,
        options.elementId,
        options.containerElementId,
      );

      if (!elements) {
        throw new ActionableError(`Element not found with provided resourceId`);
      }

      return elements[0];
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

          const element = this.findElementToTap(options, viewHierarchy);
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

          if (options.action === "tap") {
            await this.adb.executeCommand(`shell input tap ${tapPoint.x} ${tapPoint.y}`);
          } else if (options.action === "longPress") {
            await this.adb.executeCommand(`shell input swipe ${tapPoint.x} ${tapPoint.y} ${tapPoint.x} ${tapPoint.y} 1000`);
          } else if (options.action === "doubleTap") {
            await this.adb.executeCommand(`shell input tap ${tapPoint.x} ${tapPoint.y}`);
            await new Promise(resolve => setTimeout(resolve, 200));
            await this.adb.executeCommand(`shell input tap ${tapPoint.x} ${tapPoint.y}`);
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
}
