import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { BootedDevice, ClearTextResult } from "../../models";
import { ElementUtils } from "../utility/ElementUtils";
import { ObserveResult } from "../../models";
import { Axe } from "../../utils/ios-cmdline-tools/axe";

export class ClearText extends BaseVisualChange {
  private elementUtils: ElementUtils;

  constructor(device: BootedDevice, adb: AdbUtils | null = null, axe: Axe | null = null) {
    super(device, adb, axe);
    this.elementUtils = new ElementUtils();
  }

  async execute(progress?: ProgressCallback): Promise<ClearTextResult> {
    return this.observedInteraction(
      async (observeResult: ObserveResult) => {
        try {
          if (!observeResult.viewHierarchy) {
            // Fallback: if we can't get view hierarchy, use a reasonable default
            await this.clearWithDeletes(200);
            return { success: true };
          }

          let textLength = 0;

          // Look for focused elements first by traversing and checking attributes
          textLength = this.findFocusedElementTextLength(observeResult.viewHierarchy);

          // TODO: Move cursor to the end of the text

          if (textLength > 0) {
            await this.clearWithDeletes(textLength);
          }

          return {
            success: true
          };
        } catch (error) {
          return {
            success: false,
            error: "Failed to clear text"
          };
        }
      },
      {
        changeExpected: false, // TODO: can only make this true once we know for sure there was text in the text field
        tolerancePercent: 0.00,
        timeoutMs: 100,
        progress
      }
    );
  }

  private findFocusedElementTextLength(viewHierarchy: any): number {
    let textLength = 0;
    const rootNodes = this.elementUtils.extractRootNodes(viewHierarchy);

    for (const rootNode of rootNodes) {
      this.elementUtils.traverseNode(rootNode, (node: any) => {
        const nodeProperties = this.elementUtils.extractNodeProperties(node);
        if ((nodeProperties.focused === "true" || nodeProperties.focused === true) &&
          nodeProperties.text && typeof nodeProperties.text === "string") {
          textLength = Math.max(textLength, nodeProperties.text.length);
        }
      });
    }

    return textLength;
  }

  private findAnyTextInputLength(viewHierarchy: any): number {
    let textLength = 0;
    const rootNodes = this.elementUtils.extractRootNodes(viewHierarchy);

    // Common input field classes
    const inputClasses = [
      "android.widget.EditText",
      "android.widget.AutoCompleteTextView",
      "android.widget.MultiAutoCompleteTextView",
      "androidx.appcompat.widget.AppCompatEditText"
    ];

    for (const rootNode of rootNodes) {
      this.elementUtils.traverseNode(rootNode, (node: any) => {
        const nodeProperties = this.elementUtils.extractNodeProperties(node);
        if (nodeProperties.class &&
          inputClasses.some(cls => nodeProperties.class.includes(cls)) &&
          nodeProperties.text && typeof nodeProperties.text === "string") {
          textLength = Math.max(textLength, nodeProperties.text.length);
        }
      });
    }

    return textLength;
  }

  private async clearWithDeletes(count: number): Promise<void> {
    // Move to end of field first to ensure we're deleting from the right position
    await this.adb.executeCommand("shell input keyevent KEYCODE_MOVE_END");

    // Send KEYCODE_DEL commands with no delay
    for (let i = 0; i < count; i++) {
      await this.adb.executeCommand("shell input keyevent KEYCODE_DEL");
    }
  }
}
