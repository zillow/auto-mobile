import { logger } from "../../utils/logger";
import { ObserveResult } from "../../models";
import { GetScreenSize } from "./GetScreenSize";
import { GetSystemInsets } from "./GetSystemInsets";
import { ViewHierarchy } from "./ViewHierarchy";
import { Window } from "./Window";
import { TakeScreenshot } from "./TakeScreenshot";
import { AdbUtils } from "../../utils/adb";
import { ScreenSize } from "../../models";
import { SystemInsets } from "../../models";
import { ViewHierarchyResult } from "../../models";
import { DeepLinkManager } from "../../utils/deepLinkManager";

/**
 * Observe command class that combines screen details, view hierarchy and screenshot
 */
export class ObserveScreen {
  private screenSize: GetScreenSize;
  private systemInsets: GetSystemInsets;
  private viewHierarchy: ViewHierarchy;
  private window: Window;
  private screenshotUtil: TakeScreenshot;
  private adb: AdbUtils;
  private deepLinkManager: DeepLinkManager;

  constructor(deviceId: string | null = null, adb: AdbUtils | null = null) {
    this.adb = adb || new AdbUtils(deviceId);
    this.screenSize = new GetScreenSize(deviceId, this.adb);
    this.systemInsets = new GetSystemInsets(deviceId, this.adb);
    this.viewHierarchy = new ViewHierarchy(deviceId, this.adb);
    this.window = new Window(deviceId, this.adb);
    this.screenshotUtil = new TakeScreenshot(deviceId, this.adb);
    this.deepLinkManager = new DeepLinkManager(deviceId);
  }

  /**
   * Collect screen size and handle errors
   * @param result - ObserveResult to update
   */
  public async collectScreenSize(result: ObserveResult): Promise<void> {
    try {
      const screenSizeStart = Date.now();
      result.screenSize = await this.screenSize.execute();
      logger.debug(`Screen size retrieval took ${Date.now() - screenSizeStart}ms`);
    } catch (error) {
      logger.warn("Failed to get screen size:", error);
      this.appendError(result, "Failed to retrieve screen dimensions");
    }
  }

  /**
   * Collect system insets and handle errors
   * @param result - ObserveResult to update
   */
  public async collectSystemInsets(result: ObserveResult): Promise<void> {
    try {
      const insetsStart = Date.now();
      result.systemInsets = await this.systemInsets.execute();
      logger.debug(`System insets retrieval took ${Date.now() - insetsStart}ms`);
    } catch (error) {
      logger.warn("Failed to get system insets:", error);
      this.appendError(result, "Failed to retrieve system insets");
    }
  }

  /**
   * Collect screenshot and handle errors
   * @param result - ObserveResult to update
   */
  public async collectScreenshot(result: ObserveResult): Promise<void> {
    try {
      const screenshotStart = Date.now();
      const activeHash = await this.window.getActiveHash();
      const screenshotResult = await this.screenshotUtil.execute(activeHash, {
        format: "webp",
      });
      if (screenshotResult.success && screenshotResult.path) {
        result.screenshotPath = screenshotResult.path;
      } else if (screenshotResult.error) {
        logger.warn("Failed to take screenshot for view hierarchy:", screenshotResult.error);
        this.appendError(result, "Failed to capture screenshot");
      }
      logger.debug(`Screenshot took ${Date.now() - screenshotStart}ms`);
    } catch (error) {
      logger.warn("Failed to take screenshot:", error);
      this.appendError(result, "Failed to capture screenshot");
    }
  }

  /**
   * Collect view hierarchy and handle errors
   * @param result - ObserveResult to update
   * @param withViewHierarchy - Whether to collect view hierarchy
   */
  public async collectViewHierarchy(result: ObserveResult, withViewHierarchy: boolean): Promise<void> {
    if (!withViewHierarchy) {
      return;
    }

    try {
      const viewHierarchyStart = Date.now();
      const viewHierarchy = await this.viewHierarchy.getViewHierarchy(result.screenshotPath);
      logger.debug(`View hierarchy retrieval took ${Date.now() - viewHierarchyStart}ms`);
      if (viewHierarchy) {
        result.viewHierarchy = viewHierarchy;

        // Extract focused element from view hierarchy
        const focusedElement = this.viewHierarchy.findFocusedElement(viewHierarchy);
        if (focusedElement) {
          result.focusedElement = focusedElement;
          logger.debug(`Found focused element: ${focusedElement.text || focusedElement["resource-id"] || "no text/id"}`);
        }

        // Automatically detect intent chooser - ensure we have a string to work with
        const hierarchyXml = typeof viewHierarchy === "string" ? viewHierarchy : JSON.stringify(viewHierarchy);
        await this.detectIntentChooser(result, hierarchyXml);
      }
    } catch (error) {
      logger.warn("Failed to get view hierarchy:", error);

      // Check if the error is due to screen being off
      const errorStr = String(error);
      if (
        errorStr.includes("null root node returned by UiTestAutomationBridge") ||
        (errorStr.includes("cat:") && errorStr.includes("No such file or directory")) ||
        (errorStr.includes("screen appears to be off"))
      ) {
        this.appendError(result, "Screen appears to be off or device is locked");
      } else {
        this.appendError(result, "Failed to retrieve view hierarchy");
      }
    }
  }

  /**
   * Detect intent chooser dialog in the view hierarchy
   * @param result - ObserveResult to update
   * @param viewHierarchy - View hierarchy to analyze
   */
  private async detectIntentChooser(result: ObserveResult, viewHierarchy: string): Promise<void> {
    try {
      const intentChooserDetected = this.deepLinkManager.detectIntentChooser(viewHierarchy);

      // Add intent chooser detection to result
      result.intentChooserDetected = intentChooserDetected;

      if (intentChooserDetected) {
        logger.info("[ObserveScreen] Intent chooser dialog detected in view hierarchy");
      }
    } catch (error) {
      logger.warn(`[ObserveScreen] Failed to detect intent chooser: ${error}`);
      // Don't fail the observation if intent chooser detection fails
    }
  }

  /**
   * Collect active window information and handle errors
   * @param result - ObserveResult to update
   */
  public async collectActiveWindow(result: ObserveResult): Promise<void> {
    try {
      const windowStart = Date.now();
      const activeWindow = await this.window.getActive();
      logger.info(`Active window retrieval took ${Date.now() - windowStart}ms`);
      if (activeWindow) {
        result.activeWindow = activeWindow;
      }
    } catch (error) {
      logger.warn("Failed to get active window:", error);
      this.appendError(result, "Failed to retrieve active window information");
    }
  }

  /**
   * Collect all observation data
   * @param result - ObserveResult to update
   * @param withViewHierarchy - Whether to collect view hierarchy
   */
  public async collectAllData(result: ObserveResult, withViewHierarchy: boolean): Promise<void> {
    await this.collectScreenSize(result);
    await this.collectSystemInsets(result);
    await this.collectScreenshot(result);
    await this.collectViewHierarchy(result, withViewHierarchy);
    await this.collectActiveWindow(result);
  }

  /**
   * Append error message to result
   * @param result - ObserveResult to update
   * @param newError - Error message to append
   */
  appendError(result: ObserveResult, newError: string): void {
    if (result.error) {
      result.error += `; ${newError}`;
    } else {
      result.error = newError;
    }
  }

  /**
   * Create base observe result object
   * @returns Base ObserveResult with timestamp and default values
   */
  createBaseResult(): ObserveResult {
    return {
      timestamp: new Date().toISOString(),
      screenSize: { width: 0, height: 0 },
      systemInsets: { top: 0, right: 0, bottom: 0, left: 0 }
    };
  }

  /**
   * Execute the observe command
   * @param options - Command options
   * @returns The observation result
   */
  async execute(): Promise<ObserveResult> {

    try {
      logger.debug("Executing observe command");
      const startTime = Date.now();

      // Create base result object with timestamp
      const result = this.createBaseResult();

      // Collect all data components
      await this.collectAllData(result, true);

      logger.debug("Observe command completed");
      logger.debug(`Total observe command execution took ${Date.now() - startTime}ms`);
      return result;
    } catch (err) {
      logger.error("Critical error in observe command:", err);
      return {
        timestamp: new Date().toISOString(),
        screenSize: { width: 0, height: 0 },
        systemInsets: { top: 0, right: 0, bottom: 0, left: 0 },
        error: "Observation failed due to device access error"
      };
    }
  }

  /**
   * Get screen size
   */
  private async getScreenSize(): Promise<ScreenSize> {
    return this.screenSize.execute();
  }

  /**
	 * Get system insets
	 */
  private async getSystemInsets(): Promise<SystemInsets> {
    return this.systemInsets.execute();
  }

  /**
	 * Get view hierarchy
	 */
  private async getViewHierarchy(screenshotPath: string | null = null): Promise<ViewHierarchyResult> {
    return this.viewHierarchy.getViewHierarchy(screenshotPath);
  }

  /**
	 * Get active window
	 */
  private async getActiveWindow(): Promise<any> {
    return this.window.getActive();
  }

  /**
	 * Get active window hash
	 */
  private async getActiveWindowHash(): Promise<any> {
    return this.window.getActiveHash();
  }

  /**
	 * Take screenshot
	 */
  private async takeScreenshot(activityHash: string): Promise<string> {
    const result = await this.screenshotUtil.execute(activityHash);
    if (!result.success || !result.path) {
      throw new Error(result.error || "Failed to take screenshot");
    }
    return result.path;
  }
}
