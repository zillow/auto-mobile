import { AdbUtils } from "./android-cmdline-tools/adb";
import { logger } from "./logger";
import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { BootedDevice } from "../models";

const execAsync = promisify(exec);

export class VirtualKeyboardManager {
  private adb: AdbUtils;
  private static readonly ADB_KEYBOARD_ID = "com.android.adbkeyboard/.AdbIME";
  private static readonly ADB_KEYBOARD_PACKAGE = "com.android.adbkeyboard";
  private static readonly APK_URL = "https://github.com/senzhk/ADBKeyBoard/raw/8dd0b6924e45ac5565f77f13cf8e8eaf47dbb1b0/ADBKeyboard.apk";

  constructor(device: BootedDevice | null = null) {
    this.adb = new AdbUtils(device);
  }

  /**
   * Check if Unicode characters are present in text
   */
  static containsUnicode(text: string): boolean {
    return /[^\x00-\x7F]/.test(text);
  }

  /**
   * Determine the optimal input method for the given text
   */
  static getInputMethod(text: string): "native" | "virtual" {
    if (VirtualKeyboardManager.containsUnicode(text)) {
      return "virtual";
    }
    return "native";
  }

  /**
   * Check if ADBKeyboard is installed on the device
   */
  async isAdbKeyboardInstalled(): Promise<boolean> {
    try {
      const result = await this.adb.executeCommand("shell pm list packages | grep com.android.adbkeyboard", undefined, undefined, true);
      return result.includes(VirtualKeyboardManager.ADB_KEYBOARD_PACKAGE);
    } catch (error) {
      logger.warn("Failed to check ADBKeyboard installation", { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  /**
   * Check if ADBKeyboard is enabled as an input method
   */
  async isAdbKeyboardEnabled(): Promise<boolean> {
    try {
      const result = await this.adb.executeCommand("shell ime list");
      return result.includes(VirtualKeyboardManager.ADB_KEYBOARD_ID);
    } catch (error) {
      logger.warn("Failed to check ADBKeyboard enable status", { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  /**
   * Check if ADBKeyboard is currently active
   */
  async isAdbKeyboardActive(): Promise<boolean> {
    try {
      const result = await this.adb.executeCommand("shell settings get secure default_input_method");
      return result.trim() === VirtualKeyboardManager.ADB_KEYBOARD_ID;
    } catch (error) {
      logger.warn("Failed to check active input method", { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  /**
   * Get the currently active input method
   */
  async getCurrentInputMethod(): Promise<string | null> {
    try {
      const result = await this.adb.executeCommand("shell settings get secure default_input_method");
      return result.trim() || null;
    } catch (error) {
      logger.warn("Failed to get current input method", { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  /**
   * Download ADBKeyboard APK
   */
  async downloadAdbKeyboardApk(): Promise<string> {
    const tempDir = "/tmp/auto-mobile/adbkeyboard/";
    const apkPath = path.join(tempDir, `adbkeyboard.apk`);
    await fs.mkdir(tempDir, { recursive: true });

    try {
      logger.info("Downloading ADBKeyboard APK", { url: VirtualKeyboardManager.APK_URL, destination: apkPath });

      // Use curl to download the APK
      const { stderr } = await execAsync(`curl -L -o "${apkPath}" "${VirtualKeyboardManager.APK_URL}"`);

      if (stderr && !stderr.includes("100")) {
        logger.warn("Download may have failed", { stderr });
      }

      // Verify the file exists and has reasonable size (should be > 10KB)
      const stats = await fs.stat(apkPath);
      if (stats && stats.size < 10000) {
        throw new Error(`Downloaded APK is too small (${stats.size} bytes), likely invalid`);
      }

      logger.info(`APK stats: ${stats}`);

      logger.info(`Checking checksum...`);
      const shaCommand = `sha256sum "${apkPath}"`;
      logger.info(`shaCommand: ${shaCommand}`);

      // Perform checksum verification
      const { stdout: sha256sum } = await execAsync(shaCommand);
      const actualChecksum = sha256sum.split(" ")[0];

      // Expected checksum for the ADBKeyboard APK
      const expectedChecksum = "e698adea5633135a067b038f9a0cf41baa4de09888713a81593fb2b9682cdc59";

      if (actualChecksum !== expectedChecksum) {
        logger.warn("APK checksum verification failed", {
          expected: expectedChecksum,
          actual: actualChecksum
        });
        throw new Error(`APK checksum verification failed. Expected: ${expectedChecksum}, Got: ${actualChecksum}`);
      }

      logger.info("APK checksum verified successfully", { checksum: actualChecksum });

      logger.info("ADBKeyboard APK downloaded successfully", { path: apkPath, size: stats.size });
      return apkPath;
    } catch (error) {
      // Clean up failed download
      try {
        await fs.unlink(apkPath);
      } catch {
      }

      throw new Error(`Failed to download ADBKeyboard APK: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Install ADBKeyboard APK
   */
  async installAdbKeyboard(apkPath: string): Promise<void> {
    try {
      logger.info("Installing ADBKeyboard APK", { path: apkPath });

      const result = await this.adb.executeCommand(`install "${apkPath}"`);
      const resultString = result.toString().toLowerCase();

      if (resultString.includes("failure") || resultString.includes("error")) {
        throw new Error(`Installation failed: ${result.toString()}`);
      }

      if (!resultString.includes("success")) {
        logger.warn("Installation result unclear", { result: result.toString() });
      }

      logger.info("ADBKeyboard APK installed successfully");
    } catch (error) {
      throw new Error(`Failed to install ADBKeyboard APK: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Enable ADBKeyboard as input method
   */
  async enableAdbKeyboard(): Promise<void> {
    try {
      logger.info("Enabling ADBKeyboard input method");

      const result = await this.adb.executeCommand(`shell ime enable ${VirtualKeyboardManager.ADB_KEYBOARD_ID}`);
      const resultString = result.toString().toLowerCase();

      if (resultString.includes("error") || resultString.includes("failed")) {
        throw new Error(`Failed to enable ADBKeyboard: ${result.toString()}`);
      }

      logger.info("ADBKeyboard enabled successfully");
    } catch (error) {
      throw new Error(`Failed to enable ADBKeyboard: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Set ADBKeyboard as active input method
   */
  async setAdbKeyboardActive(): Promise<string | null> {
    try {
      // Get current input method before switching
      const previousKeyboard = await this.getCurrentInputMethod();

      logger.info("Setting ADBKeyboard as active input method", { previousKeyboard });

      const result = await this.adb.executeCommand(`shell ime set ${VirtualKeyboardManager.ADB_KEYBOARD_ID}`);
      const resultString = result.toString().toLowerCase();

      if (resultString.includes("error") || resultString.includes("failed")) {
        throw new Error(`Failed to set ADBKeyboard as active: ${result.toString()}`);
      }

      logger.info("ADBKeyboard set as active input method successfully");
      return previousKeyboard;
    } catch (error) {
      throw new Error(`Failed to set ADBKeyboard as active: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Restore previous input method
   */
  async restoreInputMethod(keyboardId: string): Promise<void> {
    try {
      logger.info("Restoring previous input method", { keyboardId });

      const result = await this.adb.executeCommand(`shell ime set "${keyboardId}"`);
      const resultString = result.toString().toLowerCase();

      if (resultString.includes("error") || resultString.includes("failed")) {
        throw new Error(`Failed to restore input method: ${result.toString()}`);
      }

      logger.info("Previous input method restored successfully");
    } catch (error) {
      throw new Error(`Failed to restore input method: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Send Unicode text using ADBKeyboard
   */
  async sendUnicodeText(text: string): Promise<void> {
    try {
      // Verify ADBKeyboard is active
      const isActive = await this.isAdbKeyboardActive();
      if (!isActive) {
        throw new Error("ADBKeyboard is not active, cannot send Unicode text");
      }

      logger.info("Sending Unicode text via ADBKeyboard", { textLength: text.length });

      // Use comprehensive escaping for ADB shell requirements
      // Based on the same escaping logic used for ASCII text input
      const escapedText = text
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
        .replace(/`/g, "\\`");   // Escape backtick

      const result = await this.adb.executeCommand(`shell am broadcast -a ADB_INPUT_TEXT --es msg "${escapedText}"`);
      const resultString = result.toString().toLowerCase();

      if (resultString.includes("error") || resultString.includes("failed")) {
        throw new Error(`ADBKeyboard text input failed: ${result.toString()}`);
      }

      logger.info("Unicode text sent successfully via ADBKeyboard");
    } catch (error) {
      throw new Error(`Failed to send Unicode text: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Clear text using ADBKeyboard
   */
  async clearText(): Promise<void> {
    try {
      logger.info("Clearing text via ADBKeyboard");

      const result = await this.adb.executeCommand("shell am broadcast -a ADB_CLEAR_TEXT");
      const resultString = result.toString().toLowerCase();

      if (resultString.includes("error") || resultString.includes("failed")) {
        throw new Error(`ADBKeyboard clear text failed: ${result.toString()}`);
      }

      logger.info("Text cleared successfully via ADBKeyboard");
    } catch (error) {
      throw new Error(`Failed to clear text: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Clean up temporary APK file
   */
  async cleanupApk(apkPath: string): Promise<void> {
    try {
      await fs.unlink(apkPath);
      logger.info("Temporary APK file cleaned up", { path: apkPath });
    } catch (error) {
      logger.warn("Failed to clean up temporary APK file", {
        path: apkPath,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Complete setup process for ADBKeyboard
   */
  async setupAdbKeyboard(force: boolean = false): Promise<{
    success: boolean;
    message: string;
    keyboardId?: string;
    previousKeyboard?: string;
    error?: string;
  }> {
    let apkPath: string | null = null;

    try {
      // Check if already installed and setup (unless force is true)
      if (!force && await this.isAdbKeyboardInstalled() && await this.isAdbKeyboardEnabled()) {
        const previousKeyboard = await this.setAdbKeyboardActive();
        return {
          success: true,
          message: "ADBKeyboard was already installed and has been activated",
          keyboardId: VirtualKeyboardManager.ADB_KEYBOARD_ID,
          previousKeyboard: previousKeyboard || undefined
        };
      }

      // Download APK if not installed or force is true
      if (force || !await this.isAdbKeyboardInstalled()) {
        apkPath = await this.downloadAdbKeyboardApk();
        await this.installAdbKeyboard(apkPath);
      }

      // Enable if not enabled
      if (!await this.isAdbKeyboardEnabled()) {
        await this.enableAdbKeyboard();
      }

      // Set as active and get previous keyboard
      const previousKeyboard = await this.setAdbKeyboardActive();

      // Verify setup
      const isActive = await this.isAdbKeyboardActive();
      if (!isActive) {
        throw new Error("ADBKeyboard setup completed but keyboard is not active");
      }

      return {
        success: true,
        message: "ADBKeyboard installed and activated successfully",
        keyboardId: VirtualKeyboardManager.ADB_KEYBOARD_ID,
        previousKeyboard: previousKeyboard || undefined
      };

    } catch (error) {
      return {
        success: false,
        message: "Failed to setup ADBKeyboard",
        error: error instanceof Error ? error.message : String(error)
      };
    } finally {
      // Clean up APK file if it was downloaded
      if (apkPath) {
        await this.cleanupApk(apkPath);
      }
    }
  }
}
