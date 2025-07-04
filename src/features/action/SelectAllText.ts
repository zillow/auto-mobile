import { AdbUtils } from "../../utils/adb";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { SelectAllTextResult } from "../../models/SelectAllTextResult";
import { ElementUtils } from "../utility/ElementUtils";
import { DoubleTap } from "./DoubleTap";

export class SelectAllText extends BaseVisualChange {
  private readonly deviceId: string;
  private elementUtils: ElementUtils;

  constructor(deviceId: string, adb: AdbUtils | null = null) {
    super(deviceId, adb);
    this.deviceId = deviceId;
    this.elementUtils = new ElementUtils();
  }

  async execute(progress?: ProgressCallback): Promise<SelectAllTextResult> {
    return this.observedInteraction(
      async () => {
        try {
          // Observe the screen with tolerancePercent 0 to get latest ViewHierarchy
          const observation = await this.observeScreen.execute();

          if (!observation.viewHierarchy) {
            return {
              success: false,
              error: "Could not get view hierarchy to find text input fields"
            };
          }

          // Find the focused text input field
          let targetElement = this.findFocusedTextInput(observation.viewHierarchy);

          // If no focused element, find any text input field
          if (!targetElement) {
            targetElement = this.findAnyTextInput(observation.viewHierarchy);
          }

          if (!targetElement) {
            return {
              success: false,
              error: "Could not find any text input field to select text in. Please focus on a text field first."
            };
          }

          // Verify it's a text input field
          if (!this.isTextInputElement(targetElement)) {
            return {
              success: false,
              error: "Selected element is not a text input field. SelectAllText can only be used on EditText fields."
            };
          }

          // Get center coordinates of the text field
          const center = this.elementUtils.getElementCenter(targetElement);

          // Perform double tap to select all text
          const doubleTap = new DoubleTap(this.deviceId);
          await doubleTap.execute(center.x, center.y);

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

  private isTextInputElement(element: any): boolean {
    const inputClasses = [
      "android.widget.EditText",
      "android.widget.AutoCompleteTextView",
      "android.widget.MultiAutoCompleteTextView",
      "androidx.appcompat.widget.AppCompatEditText"
    ];

    const nodeProperties = this.elementUtils.extractNodeProperties(element);
    return nodeProperties.class &&
      inputClasses.some(cls => nodeProperties.class.includes(cls));
  }

  private findFocusedTextInput(viewHierarchy: any): any {
    const rootNodes = this.elementUtils.extractRootNodes(viewHierarchy);
    const inputClasses = [
      "android.widget.EditText",
      "android.widget.AutoCompleteTextView",
      "android.widget.MultiAutoCompleteTextView",
      "androidx.appcompat.widget.AppCompatEditText"
    ];

    for (const rootNode of rootNodes) {
      let foundElement: any = null;
      this.elementUtils.traverseNode(rootNode, (node: any) => {
        if (foundElement) {return;} // Already found one

        const nodeProperties = this.elementUtils.extractNodeProperties(node);
        if ((nodeProperties.focused === "true" || nodeProperties.focused === true) &&
          nodeProperties.class &&
          inputClasses.some(cls => nodeProperties.class.includes(cls))) {
          const parsedNode = this.elementUtils.parseNodeBounds(node);
          if (parsedNode) {
            foundElement = parsedNode;
          }
        }
      });

      if (foundElement) {return foundElement;}
    }

    return null;
  }

  private findAnyTextInput(viewHierarchy: any): any {
    const rootNodes = this.elementUtils.extractRootNodes(viewHierarchy);
    const inputClasses = [
      "android.widget.EditText",
      "android.widget.AutoCompleteTextView",
      "android.widget.MultiAutoCompleteTextView",
      "androidx.appcompat.widget.AppCompatEditText"
    ];

    for (const rootNode of rootNodes) {
      let foundElement: any = null;
      this.elementUtils.traverseNode(rootNode, (node: any) => {
        if (foundElement) {return;} // Already found one

        const nodeProperties = this.elementUtils.extractNodeProperties(node);
        if (nodeProperties.class &&
          inputClasses.some(cls => nodeProperties.class.includes(cls))) {
          const parsedNode = this.elementUtils.parseNodeBounds(node);
          if (parsedNode) {
            foundElement = parsedNode;
          }
        }
      });

      if (foundElement) {return foundElement;}
    }

    return null;
  }
}
