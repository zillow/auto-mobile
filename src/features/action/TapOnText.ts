import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { ViewHierarchy } from "../observe/ViewHierarchy";
import { ElementUtils } from "../utility/ElementUtils";
import { TapOnTextOptions } from "../../models/TapOnTextOptions";
import { TapOnTextResult } from "../../models/TapOnTextResult";
import { Element } from "../../models/Element";
import { AdbUtils } from "../../utils/adb";

/**
 * Command to tap on UI element containing specified text
 */
export class TapOnTextCommand extends BaseVisualChange {
  private viewHierarchy: ViewHierarchy;
  private elementUtils: ElementUtils;

  constructor(deviceId: string, adb: AdbUtils | null = null) {
    super(deviceId, adb);
    this.viewHierarchy = new ViewHierarchy(deviceId, this.adb);
    this.elementUtils = new ElementUtils();
  }

  /**
   * Execute a tap on text
   * @param options - Command options
   * @param progress - Optional progress callback
   * @returns Result of the command
   */
  async execute(options: TapOnTextOptions, progress?: ProgressCallback): Promise<TapOnTextResult> {
    if (!options.text) {
      return {
        success: false,
        text: "",
        error: "Text to tap on is required",
        x: 0,
        y: 0,
        element: {
          bounds: { left: 0, top: 0, right: 0, bottom: 0 }
        } as Element
      };
    }

    try {
      // First observe to get current view hierarchy
      const observation = await this.observeScreen.execute();

      // Find the UI element that contains the text
      const element = this.viewHierarchy.findElementByText(
        observation.viewHierarchy,
        options.text,
        options.fuzzyMatch !== false,
        options.caseSensitive === true
      );

      if (!element) {
        return {
          success: false,
          text: options.text,
          error: `Text not found: ${options.text}`,
          x: 0,
          y: 0,
          element: {
            bounds: { left: 0, top: 0, right: 0, bottom: 0 }
          } as Element
        };
      }

      // Find the first word's spannable if available
      let tapPoint = this.viewHierarchy.getElementCenter(element);
      const spannables = this.viewHierarchy.findSpannables(element);

      if (spannables && spannables.length > 0) {
        // Find the first spannable that contains part of the text
        const firstSpan = spannables.find(span =>
          span.text && options.text.includes(span.text) ||
          (span.text && options.fuzzyMatch !== false &&
            this.elementUtils.fuzzyTextMatch(span.text, options.text, options.caseSensitive === true))
        );

        if (firstSpan) {
          // Use the center of the first word's spannable
          tapPoint = this.viewHierarchy.getElementCenter(firstSpan);
        }
      }

      // Tap on the calculated point using observedChange
      const tapResult = await this.observedChange(
        async () => {
          await this.adb.executeCommand(`shell input tap ${tapPoint.x} ${tapPoint.y}`);

          return {
            success: true,
            text: options.text,
            element,
            x: tapPoint.x,
            y: tapPoint.y
          };
        },
        {
          changeExpected: false,
          timeoutMs: 3000, // Reduce timeout for faster execution
          previousViewHierarchy: observation.viewHierarchy,
          progress
        }
      );

      return tapResult;
    } catch (error) {
      return {
        success: false,
        text: options.text,
        error: "Failed to tap on text",
        x: 0,
        y: 0,
        element: {
          bounds: { left: 0, top: 0, right: 0, bottom: 0 }
        } as Element
      };
    }
  }
}
