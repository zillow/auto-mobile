import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { BootedDevice, ClearTextResult } from "../../models";
import type { ElementParser } from "../../utils/interfaces/ElementParser";
import { DefaultElementParser } from "../utility/ElementParser";
import { ObserveResult } from "../../models";
import { createGlobalPerformanceTracker } from "../../utils/PerformanceTracker";
import { CtrlProxyClient } from "../observe/android";
import { XCTestServiceClient } from "../observe/ios";
import { logger } from "../../utils/logger";
import { ANDROID_INPUT_CLASSES } from "../../utils/elementProperties";

export class ClearText extends BaseVisualChange {
  private parser: ElementParser;

  constructor(device: BootedDevice, adb: AdbClient | null = null, parser: ElementParser = new DefaultElementParser()) {
    super(device, adb);
    this.parser = parser;
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
    const a11yClient = CtrlProxyClient.getInstance(this.device, this.adb);
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
   * Execute iOS-specific clear text using XCTestService.
   */
  private async executeiOSClearText(observeResult: ObserveResult): Promise<ClearTextResult> {
    try {
      const client = XCTestServiceClient.getInstance(this.device);
      const result = await client.requestClearText();

      if (result.success) {
        logger.info(`[ClearText] Cleared text via XCTestService`);
        return { success: true };
      }

      logger.warn(`[ClearText] XCTestService clear failed: ${result.error}`);
      return { success: false, error: result.error };
    } catch (error) {
      logger.error(`[ClearText] XCTestService exception: ${error}`);
      return { success: false, error: String(error) };
    }
  }

  private findFocusedElementTextLength(viewHierarchy: any): number {
    let textLength = 0;
    const rootNodes = this.parser.extractRootNodes(viewHierarchy);

    for (const rootNode of rootNodes) {
      this.parser.traverseNode(rootNode, (node: any) => {
        const nodeProperties = this.parser.extractNodeProperties(node);
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
    const rootNodes = this.parser.extractRootNodes(viewHierarchy);

    for (const rootNode of rootNodes) {
      this.parser.traverseNode(rootNode, (node: any) => {
        const nodeProperties = this.parser.extractNodeProperties(node);
        if (nodeProperties.class &&
          ANDROID_INPUT_CLASSES.some(cls => nodeProperties.class.includes(cls)) &&
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
