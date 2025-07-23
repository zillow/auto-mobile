import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { BaseVisualChange } from "./BaseVisualChange";
import { BootedDevice, SendTextResult } from "../../models";
import { VirtualKeyboardManager } from "../../utils/virtualKeyboardManager";
import { logger } from "../../utils/logger";
import { IdbPython } from "../../utils/ios-cmdline-tools/idbPython";

export class InputText extends BaseVisualChange {
  private virtualKeyboardManager: VirtualKeyboardManager;

  constructor(device: BootedDevice, adb: AdbUtils | null = null, idb: IdbPython | null = null) {
    super(device, adb, idb);
    this.virtualKeyboardManager = new VirtualKeyboardManager(device);
  }

  async execute(
    text: string,
    imeAction?: "done" | "next" | "search" | "send" | "go" | "previous"
  ): Promise<SendTextResult & { method?: "native" | "virtual" }> {
    // Validate text input
    if (text === undefined || text === null) {
      return {
        success: false,
        text: "",
        error: "No text provided"
      };
    }

    // Determine input method
    const inputMethod = VirtualKeyboardManager.getInputMethod(text);

    return this.observedInteraction(
      async () => {
        try {
          if (inputMethod === "virtual") {
            // Automatically setup virtual keyboard for Unicode text
            const setupResult = await this.virtualKeyboardManager.setupAdbKeyboard(false);

            if (!setupResult.success) {
              return {
                success: false,
                text,
                error: `Failed to setup virtual keyboard for Unicode text: ${setupResult.error}`,
                method: "virtual"
              };
            }

            // Send text using virtual keyboard
            await this.sendUnicodeTextViaVirtualKeyboard(text);
          } else {
            // Use native input for ASCII text
            await this.sendAsciiText(text);
          }

          // Handle IME action if specified
          if (imeAction) {
            await this.executeImeAction(imeAction);
          }

          return {
            success: true,
            text,
            imeAction,
            method: inputMethod
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          return {
            success: false,
            text,
            error: `Failed to send text input: ${errorMessage}`,
            method: inputMethod
          };
        }
      },
      {
        changeExpected: true,
        tolerancePercent: 0.00,
        timeoutMs: 5000 // Reduce timeout for faster execution
      }
    );
  }

  private async sendUnicodeTextViaVirtualKeyboard(text: string): Promise<void> {
    try {
      logger.info("Sending Unicode text via hybrid approach", {
        textLength: text.length,
        hasUnicode: VirtualKeyboardManager.containsUnicode(text),
        hasNewlines: text.includes("\n")
      });

      // Split text by newlines first, then handle each line separately
      const lines = text.split("\n");

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];

        if (line.length > 0) {
          // Split line by spaces and handle each part separately
          const parts = line.split(" ");

          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];

            if (part.length > 0) {
              // Send the text part via virtual keyboard
              await this.virtualKeyboardManager.sendUnicodeText(part);
            }

            // Add space using native ADB input (except for the last part)
            if (i < parts.length - 1) {
              await this.adb.executeCommand('shell input text "%s"');
              // Small delay to ensure proper sequencing
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }
        }

        // Add newline using KEYCODE_ENTER (except for the last line)
        if (lineIndex < lines.length - 1) {
          await this.adb.executeCommand("shell input keyevent KEYCODE_ENTER");
          // Small delay to ensure proper sequencing
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
    } catch (error) {
      throw new Error(`Failed to send Unicode text via hybrid approach: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async sendAsciiText(text: string): Promise<void> {
    try {
      logger.info("Sending ASCII text via native input", {
        textLength: text.length,
        hasNewlines: text.includes("\n")
      });

      // Split text by newlines first, then handle each line separately
      const lines = text.split("\n");

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];

        if (line.length > 0) {
          // Escape special characters for ASCII text according to ADB shell requirements
          // Based on: https://stackoverflow.com/questions/25791423/adb-shell-input-text-does-not-take-ampersand-character
          const escapedText = line
            .replace(/\\/g, "\\\\")  // Escape backslashes first
            .replace(/"/g, '\\"')    // Escape double quotes
            .replace(/'/g, "\\'")    // Escape single quotes
            .replace(/&/g, "\\&")    // Escape ampersand
            .replace(/</g, "\\<")    // Escape less than
            .replace(/>/g, "\\>")    // Escape greater than
            .replace(/\(/g, "\\(")   // Escape left parenthesis
            .replace(/\)/g, "\\)")   // Escape right parenthesis
            .replace(/\|/g, "\\|")   // Escape pipe
            .replace(/;/g, "\\;")    // Escape semicolon
            .replace(/\$/g, "\\$")   // Escape dollar sign
            .replace(/`/g, "\\`")    // Escape backtick
            .replace(/ /g, "%s");    // Replace spaces with %s

          await this.adb.executeCommand(`shell input text "${escapedText}"`);
        }

        // Add newline using KEYCODE_ENTER (except for the last line)
        if (lineIndex < lines.length - 1) {
          await this.adb.executeCommand("shell input keyevent KEYCODE_ENTER");
          // Small delay to ensure proper sequencing
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
    } catch (error) {
      throw new Error(`Failed to send ASCII text: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async executeImeAction(imeAction: string): Promise<void> {
    // Map IME actions to Android key codes
    const imeKeyCodeMap: { [key: string]: string } = {
      "done": "KEYCODE_ENTER",
      "next": "KEYCODE_TAB",
      "search": "KEYCODE_SEARCH",
      "send": "KEYCODE_ENTER",
      "go": "KEYCODE_ENTER",
      "previous": "KEYCODE_SHIFT_LEFT KEYCODE_TAB" // Shift+Tab for previous
    };

    const keyCode = imeKeyCodeMap[imeAction];
    if (keyCode) {
      // Small delay to ensure text input is processed
      await new Promise(resolve => setTimeout(resolve, 100));

      // Execute the key event(s)
      if (keyCode.includes(" ")) {
        // Handle multiple key combinations like Shift+Tab
        const keys = keyCode.split(" ");
        for (const key of keys) {
          await this.adb.executeCommand(`shell input keyevent ${key}`);
        }
      } else {
        await this.adb.executeCommand(`shell input keyevent ${keyCode}`);
      }
    }
  }
}
