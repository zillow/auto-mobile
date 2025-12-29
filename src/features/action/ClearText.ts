import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { BootedDevice, ClearTextResult } from "../../models";
import { ElementUtils } from "../utility/ElementUtils";
import { ObserveResult } from "../../models";
import { AxeClient } from "../../utils/ios-cmdline-tools/AxeClient";
import { createGlobalPerformanceTracker } from "../../utils/PerformanceTracker";
import { AccessibilityServiceClient } from "../observe/AccessibilityServiceClient";
import { logger } from "../../utils/logger";

export class ClearText extends BaseVisualChange {
  private elementUtils: ElementUtils;

  constructor(device: BootedDevice, adb: AdbClient | null = null, axe: AxeClient | null = null) {
    super(device, adb, axe);
    this.elementUtils = new ElementUtils();
  }

  async execute(progress?: ProgressCallback): Promise<ClearTextResult> {
    const perf = createGlobalPerformanceTracker();
    perf.serial("clearText");

    return this.observedInteraction(
      async (observeResult: ObserveResult) => {
        try {
          // Platform-specific clear text execution
          switch (this.device.platform) {
            case "android":
              return await perf.track("androidClearText", () =>
                this.executeAndroidClearText(observeResult)
              );
            case "ios":
              return await perf.track("iOSClearText", () =>
                this.executeiOSClearText(observeResult)
              );
            default:
              perf.end();
              throw new Error(`Unsupported platform: ${this.device.platform}`);
          }
        } catch (error) {
          perf.end();
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
        progress,
        perf,
        skipUiStability: true // Skip UI stability wait - a11y service already waits 100ms for tree update
      }
    );
  }

  /**
   * Execute Android-specific clear text using accessibility service.
   * Falls back to ADB delete key events if a11y service is unavailable.
   */
  private async executeAndroidClearText(observeResult: ObserveResult): Promise<ClearTextResult> {
    // Use accessibility service (fastest method, ~50-80ms vs ~200-500ms for ADB deletes)
    const a11yClient = AccessibilityServiceClient.getInstance(this.device, this.adb);
    const a11yResult = await a11yClient.requestClearText();

    if (a11yResult.success) {
      logger.info(`[ClearText] Cleared text via accessibility service: ${a11yResult.totalTimeMs}ms`);
      return { success: true };
    }

    // Fall back to ADB delete key events
    logger.warn(`[ClearText] Accessibility service clear failed: ${a11yResult.error}, falling back to ADB`);
    return this.executeAdbClearText(observeResult);
  }

  /**
   * [LEGACY] Execute clear text using ADB delete key events.
   * Kept as fallback if accessibility service is unavailable.
   */
  private async executeAdbClearText(observeResult: ObserveResult): Promise<ClearTextResult> {
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

    return { success: true };
  }

  /**
   * Execute iOS-specific clear text.
   */
  private async executeiOSClearText(observeResult: ObserveResult): Promise<ClearTextResult> {
    // iOS uses existing ADB-style clear logic for now
    // TODO: Implement iOS-specific clear text
    return this.executeAdbClearText(observeResult);
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
