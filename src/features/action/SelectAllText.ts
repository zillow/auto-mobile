import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { BootedDevice, SelectAllTextResult } from "../../models";
import { ElementUtils } from "../utility/ElementUtils";
import { ActionableError, ObserveResult } from "../../models";

export class SelectAllText extends BaseVisualChange {
  private elementUtils: ElementUtils;

  constructor(device: BootedDevice, adb: AdbUtils | null = null) {
    super(device, adb);
    this.elementUtils = new ElementUtils();
  }

  async execute(progress?: ProgressCallback): Promise<SelectAllTextResult> {
    return this.observedInteraction(
      async (observeResult: ObserveResult) => {
        try {

          // Find the focused text input field
          const targetElement = this.elementUtils.findFocusedTextInput(observeResult.viewHierarchy);

          // If no focused element, find any text input field
          if (!targetElement) {
            throw new ActionableError("No focused text input field found. Please focus on a text field first.");
          }

          // Get center coordinates of the text field
          const tapPoint = this.elementUtils.getElementCenter(targetElement);

          await this.adb.executeCommand(`shell input tap ${tapPoint.x} ${tapPoint.y}`);
          await new Promise(resolve => setTimeout(resolve, 100));
          await this.adb.executeCommand(`shell input tap ${tapPoint.x} ${tapPoint.y}`);

          return {
            success: true
          };
        } catch (error) {
          return {
            success: false,
            error: `Failed to select all text: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      },
      {
        changeExpected: false,
        tolerancePercent: 0,
        timeoutMs: 500,
        progress
      }
    );
  }

}
