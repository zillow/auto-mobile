import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { BootedDevice, ClipboardResult } from "../../models";
import { logger } from "../../utils/logger";
import { createGlobalPerformanceTracker } from "../../utils/PerformanceTracker";
import { AccessibilityServiceClient } from "../observe/AccessibilityServiceClient";

export class Clipboard {
  private device: BootedDevice;
  private adb: AdbClient;

  constructor(device: BootedDevice, adb: AdbClient | null = null) {
    this.device = device;
    this.adb = adb || new AdbClient(device);
  }

  async execute(
    action: "copy" | "paste" | "clear" | "get",
    text?: string
  ): Promise<ClipboardResult> {
    const perf = createGlobalPerformanceTracker();
    perf.serial("clipboard");

    try {
      // Platform-specific clipboard execution
      switch (this.device.platform) {
        case "android":
          return await perf.track("androidClipboard", () =>
            this.executeAndroidClipboard(action, text)
          );
        case "ios":
          perf.end();
          return {
            success: false,
            action,
            error: "iOS clipboard operations are not yet supported"
          };
        default:
          perf.end();
          return {
            success: false,
            action,
            error: `Unsupported platform: ${this.device.platform}`
          };
      }
    } catch (error) {
      perf.end();
      return {
        success: false,
        action,
        error: `Failed to execute clipboard ${action}: ${error instanceof Error ? error.message : String(error)}`
      };
    } finally {
      perf.end();
    }
  }

  /**
   * Execute Android-specific clipboard operation
   * Tries accessibility service first, falls back to ADB cmd clipboard
   * @param action - Clipboard action to perform
   * @param text - Text for copy action
   * @returns Result of the clipboard operation
   */
  private async executeAndroidClipboard(
    action: "copy" | "paste" | "clear" | "get",
    text?: string
  ): Promise<ClipboardResult> {
    // Validate input
    if (action === "copy" && !text) {
      return {
        success: false,
        action,
        error: "Text is required for copy action"
      };
    }

    // Try accessibility service first (preferred method)
    const a11yClient = AccessibilityServiceClient.getInstance(this.device, this.adb);

    try {
      const a11yResult = await a11yClient.requestClipboard(action, text);

      if (a11yResult.success) {
        logger.info(`[Clipboard] ${action} via accessibility service: ${a11yResult.totalTimeMs}ms`);
        const a11yClipboardResult: ClipboardResult = {
          success: true,
          action,
          text: a11yResult.text,
          method: "a11y"
        };

        // A11y clipboard reads can be restricted; try ADB when get returns empty.
        if (action !== "get" || (a11yResult.text?.length ?? 0) > 0) {
          return a11yClipboardResult;
        }

        logger.warn("[Clipboard] Accessibility service returned empty clipboard; trying ADB fallback");
        try {
          const adbResult = await this.executeAdbClipboard(action, text);
          if (adbResult.success && (adbResult.text?.length ?? 0) > 0) {
            logger.info("[Clipboard] Retrieved clipboard via ADB fallback after empty a11y result");
            return adbResult;
          }
          if (!adbResult.success) {
            logger.warn(`[Clipboard] ADB fallback for clipboard get failed: ${adbResult.error}`);
          }
        } catch (error) {
          logger.warn(`[Clipboard] ADB fallback error: ${error}`);
        }

        return a11yClipboardResult;
      }

      logger.warn(`[Clipboard] Accessibility service ${action} failed: ${a11yResult.error}`);
    } catch (error) {
      logger.warn(`[Clipboard] Accessibility service error: ${error}`);
    }

    // Fall back to ADB cmd clipboard
    try {
      return await this.executeAdbClipboard(action, text);
    } catch (error) {
      return {
        success: false,
        action,
        error: `All clipboard methods failed. Last error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Execute clipboard operation via ADB cmd clipboard
   * @param action - Clipboard action to perform
   * @param text - Text for copy action
   * @returns Result of the clipboard operation
   */
  private async executeAdbClipboard(
    action: "copy" | "paste" | "clear" | "get",
    text?: string
  ): Promise<ClipboardResult> {
    try {
      switch (action) {
        case "copy": {
          if (!text) {
            return {
              success: false,
              action,
              error: "Text is required for copy action"
            };
          }
          // Escape text for shell command using single quotes (safer than double quotes)
          // In single-quoted strings, only single quotes need escaping: ' becomes '\''
          const escapedText = text.replace(/'/g, "'\\''");
          const result = await this.adb.executeCommand(`shell cmd clipboard set '${escapedText}'`);

          // Check if cmd clipboard is supported
          if (result.includes("No shell command implementation")) {
            return {
              success: false,
              action,
              error: "cmd clipboard is not supported on this device/API level",
              method: "adb"
            };
          }

          logger.info(`[Clipboard] Set clipboard via ADB cmd clipboard`);
          return {
            success: true,
            action,
            method: "adb"
          };
        }

        case "get": {
          const result = await this.adb.executeCommand("shell cmd clipboard get");

          // Check if cmd clipboard is supported
          if (result.includes("No shell command implementation")) {
            return {
              success: false,
              action,
              error: "cmd clipboard is not supported on this device/API level",
              method: "adb"
            };
          }

          logger.info(`[Clipboard] Got clipboard via ADB cmd clipboard`);
          return {
            success: true,
            action,
            text: result.trim(),
            method: "adb"
          };
        }

        case "clear": {
          const result = await this.adb.executeCommand("shell cmd clipboard clear");

          // Check if cmd clipboard is supported
          if (result.includes("No shell command implementation")) {
            return {
              success: false,
              action,
              error: "cmd clipboard is not supported on this device/API level",
              method: "adb"
            };
          }

          logger.info(`[Clipboard] Cleared clipboard via ADB cmd clipboard`);
          return {
            success: true,
            action,
            method: "adb"
          };
        }

        case "paste": {
          // For paste, we need to use key event since cmd clipboard doesn't have a paste command
          // First, try to get clipboard content to verify it exists
          const clipboardContent = await this.adb.executeCommand("shell cmd clipboard get");

          if (clipboardContent.includes("No shell command implementation")) {
            return {
              success: false,
              action,
              error: "cmd clipboard is not supported on this device/API level",
              method: "adb"
            };
          }

          // Use KEYCODE_PASTE (279) to paste
          await this.adb.executeCommand("shell input keyevent KEYCODE_PASTE");

          logger.info(`[Clipboard] Pasted clipboard via ADB keyevent`);
          return {
            success: true,
            action,
            method: "adb"
          };
        }

        default:
          return {
            success: false,
            action,
            error: `Unknown clipboard action: ${action}`
          };
      }
    } catch (error) {
      return {
        success: false,
        action,
        error: `ADB clipboard operation failed: ${error instanceof Error ? error.message : String(error)}`,
        method: "adb"
      };
    }
  }
}
