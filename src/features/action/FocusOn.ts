import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { SingleTap } from "./SingleTap";
import { ElementUtils } from "../utility/ElementUtils";
import { ObserveScreen } from "../observe/ObserveScreen";
import { FocusOnResult } from "../../models/FocusOnResult";
import { ActionableError } from "../../models";
import { logger } from "../../utils/logger";

export interface FocusOnOptions {
    retryCount?: number;
    verificationTimeoutMs?: number;
}

export class FocusOn extends BaseVisualChange {
  private readonly deviceId: string;
  private elementUtils: ElementUtils;
  private singleTap: SingleTap;

  constructor(deviceId: string, adb: any = null) {
    super(deviceId, adb);
    this.deviceId = deviceId;
    this.elementUtils = new ElementUtils();
    this.singleTap = new SingleTap(deviceId, adb);
  }

  async execute(
    elementId: string,
    options: FocusOnOptions = {},
    progress?: ProgressCallback
  ): Promise<FocusOnResult> {
    const { retryCount = 2, verificationTimeoutMs = 3000 } = options;

    return this.observedChange(
      async () => {
        if (progress) {
          await progress(10, 100, "Getting current view hierarchy...");
        }

        // Get current view hierarchy
        const observeScreen = new ObserveScreen(this.deviceId, this.adb);
        const observation = await observeScreen.execute();

        if (!observation.viewHierarchy) {
          throw new ActionableError("Could not get view hierarchy to check focus state");
        }

        if (progress) {
          await progress(30, 100, "Finding target element...");
        }

        // Find the target element
        const elements = this.elementUtils.findElementsByResourceId(
          observation.viewHierarchy,
          elementId,
          true // partial match
        );

        if (elements.length === 0) {
          throw new ActionableError(`Element not found with ID: ${elementId}`);
        }

        const targetElement = elements[0];
        const center = this.elementUtils.getElementCenter(targetElement);

        if (progress) {
          await progress(50, 100, "Checking current focus state...");
        }

        // Check if element is already focused
        const isFocused = this.isElementFocused(targetElement);

        if (isFocused) {
          logger.info(`Element ${elementId} is already focused, no action needed`);
          return {
            success: true,
            elementId,
            element: targetElement,
            wasAlreadyFocused: true,
            focusChanged: false,
            x: center.x,
            y: center.y
          };
        }

        if (progress) {
          await progress(70, 100, "Tapping element to establish focus...");
        }

        // Element is not focused, tap it
        await this.singleTap.execute(center.x, center.y);

        if (progress) {
          await progress(85, 100, "Verifying focus state...");
        }

        // Verify focus was established (with retry logic)
        let focusVerified = false;
        let attempts = 0;
        const maxAttempts = retryCount + 1;

        while (!focusVerified && attempts < maxAttempts) {
          // Wait a short time for focus to be established
          await new Promise(resolve => setTimeout(resolve, 200));

          // Re-observe to check focus state
          const newObservation = await observeScreen.execute();
          if (newObservation.viewHierarchy) {
            const updatedElements = this.elementUtils.findElementsByResourceId(
              newObservation.viewHierarchy,
              elementId,
              true
            );

            if (updatedElements.length > 0) {
              focusVerified = this.isElementFocused(updatedElements[0]);
            }
          }

          attempts++;
          if (!focusVerified && attempts < maxAttempts) {
            logger.info(`Focus verification attempt ${attempts} failed, retrying...`);
            if (progress) {
              await progress(85 + (attempts * 5), 100, `Retrying focus verification (${attempts}/${maxAttempts})...`);
            }
          }
        }

        return {
          success: true,
          elementId,
          element: targetElement,
          wasAlreadyFocused: false,
          focusChanged: focusVerified,
          focusVerified,
          x: center.x,
          y: center.y,
          attempts
        };
      },
      {
        changeExpected: true,
        timeoutMs: verificationTimeoutMs,
        progress
      }
    );
  }

  /**
     * Check if an element is currently focused based on view hierarchy attributes
     * @param element - The element to check
     * @returns True if the element appears to be focused
     */
  private isElementFocused(element: any): boolean {
    // Check for focus-related attributes
    const focused = element.focused === "true" || element.focused === true;
    const selected = element.selected === "true" || element.selected === true;

    // Some UI frameworks use 'isFocused' instead of 'focused'
    const isFocused = element.isFocused === "true" || element.isFocused === true;

    // Check if element has keyboard focus (for text inputs)
    const hasKeyboardFocus = element["has-keyboard-focus"] === "true" || element["has-keyboard-focus"] === true;

    return focused || selected || isFocused || hasKeyboardFocus;
  }
}
