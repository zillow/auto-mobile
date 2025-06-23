import { AdbUtils } from "../../utils/adb";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { GestureOptions } from "../../models/GestureOptions";
import { ExecuteGesture } from "./ExecuteGesture";
import { ElementUtils } from "../utility/ElementUtils";
import { SwipeResult } from "../../models";
import { ActionableError } from "../../models/ActionableError";

export interface ElementTarget {
  index: number;
  text?: string;
}

export interface SwipeFromElementToElementResult extends SwipeResult {
  fromElement?: {
    index: number;
    text?: string;
    bounds: {
      left: number;
      top: number;
      right: number;
      bottom: number;
    };
    center: {
      x: number;
      y: number;
    };
  };
  toElement?: {
    index: number;
    text?: string;
    bounds: {
      left: number;
      top: number;
      right: number;
      bottom: number;
    };
    center: {
      x: number;
      y: number;
    };
  };
}

/**
 * Executes drag and drop gestures between UI elements using index-based selection
 */
export class SwipeFromElementToElement extends BaseVisualChange {
  private executeGesture: ExecuteGesture;
  private elementUtils: ElementUtils;

  constructor(deviceId: string | null = null, adb: AdbUtils | null = null) {
    super(deviceId, adb);
    this.executeGesture = new ExecuteGesture(deviceId, adb);
    this.elementUtils = new ElementUtils();
  }

  /**
   * Perform a drag and drop gesture from one element to another
   * @param from - Source element target (index and optional text)
   * @param to - Destination element target (index and optional text)
   * @param options - Additional gesture options
   * @param progress - Optional progress callback
   * @returns Result of the drag and drop operation
   */
  async execute(
    from: ElementTarget,
    to: ElementTarget,
    options: GestureOptions = {},
    progress?: ProgressCallback
  ): Promise<SwipeFromElementToElementResult> {
    return this.observedChange(
      async () => {
        // First, get the current view hierarchy
        const observeResult = await this.observeScreen.execute();
        if (!observeResult.viewHierarchy) {
          throw new ActionableError("Could not get view hierarchy for drag and drop operation.");
        }

        // Find the source element by index
        const fromElementResult = this.elementUtils.findElementByIndex(
          observeResult.viewHierarchy,
          from.index
        );

        if (!fromElementResult) {
          const flattenedElements = this.elementUtils.flattenViewHierarchy(observeResult.viewHierarchy);
          throw new ActionableError(
            `Source element not found at index ${from.index}. ` +
            `Available indices: 0-${flattenedElements.length - 1}`
          );
        }

        // Validate source element text if provided
        if (from.text && !this.elementUtils.validateElementText(fromElementResult, from.text)) {
          throw new ActionableError(
            `Source element at index ${from.index} has text "${fromElementResult.text || "none"}" ` +
            `but expected "${from.text}"`
          );
        }

        // Find the destination element by index
        const toElementResult = this.elementUtils.findElementByIndex(
          observeResult.viewHierarchy,
          to.index
        );

        if (!toElementResult) {
          const flattenedElements = this.elementUtils.flattenViewHierarchy(observeResult.viewHierarchy);
          throw new ActionableError(
            `Destination element not found at index ${to.index}. ` +
            `Available indices: 0-${flattenedElements.length - 1}`
          );
        }

        // Validate destination element text if provided
        if (to.text && !this.elementUtils.validateElementText(toElementResult, to.text)) {
          throw new ActionableError(
            `Destination element at index ${to.index} has text "${toElementResult.text || "none"}" ` +
            `but expected "${to.text}"`
          );
        }

        // Calculate center points for both elements
        const fromCenter = this.elementUtils.getElementCenter(fromElementResult.element);
        const toCenter = this.elementUtils.getElementCenter(toElementResult.element);

        // Execute the swipe gesture from source to destination
        const swipeResult = await this.executeGesture.swipe(
          fromCenter.x,
          fromCenter.y,
          toCenter.x,
          toCenter.y,
          {
            duration: options.duration || 500,
            easing: options.easing || "accelerateDecelerate",
            fingers: options.fingers || 1,
            randomize: options.randomize || false,
            lift: options.lift !== false, // Default to true
            pressure: options.pressure || 1
          }
        );

        // Return enriched result with element information
        const result: SwipeFromElementToElementResult = {
          ...swipeResult,
          fromElement: {
            index: from.index,
            text: fromElementResult.text,
            bounds: fromElementResult.element.bounds,
            center: fromCenter
          },
          toElement: {
            index: to.index,
            text: toElementResult.text,
            bounds: toElementResult.element.bounds,
            center: toCenter
          }
        };

        return result;
      },
      {
        changeExpected: false, // Drag and drop might not always change the view hierarchy
        timeoutMs: options.duration ? options.duration + 2000 : 2500,
        progress
      }
    );
  }
}
