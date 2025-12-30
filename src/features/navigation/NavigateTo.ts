import { BootedDevice, NavigateToResult } from "../../models";
import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { logger } from "../../utils/logger";
import { createGlobalPerformanceTracker } from "../../utils/PerformanceTracker";
import { ToolRegistry } from "../../server/toolRegistry";
import {
  NavigationGraphManager,
  ToolCallInteraction,
  NavigationEdge,
  UIState
} from "./NavigationGraphManager";
import { ProgressCallback } from "../../server/toolRegistry";
import { UIStateExtractor } from "./UIStateExtractor";
import { ObserveScreen } from "../observe/ObserveScreen";

/**
 * Options for the navigateTo tool.
 */
export interface NavigateToOptions {
  /** Target screen name to navigate to */
  targetScreen: string;
  /** Platform (android/ios) */
  platform: "android" | "ios";
}

/**
 * NavigateTo feature class that uses the navigation graph to traverse an app
 * to reach a target screen.
 */
export class NavigateTo {
  private device: BootedDevice;
  private adb: AdbClient;
  private navigationManager: NavigationGraphManager;

  private static readonly MAX_TIMEOUT_MS = 30000; // 30 seconds
  private static readonly STEP_TIMEOUT_MS = 5000; // 5 seconds per step
  private static readonly POLL_INTERVAL_MS = 500; // Check screen every 500ms

  constructor(device: BootedDevice, adb: AdbClient | null = null) {
    this.device = device;
    this.adb = adb || new AdbClient(device);
    this.navigationManager = NavigationGraphManager.getInstance();
  }

  /**
   * Execute navigation to the target screen.
   */
  async execute(
    options: NavigateToOptions,
    progress?: ProgressCallback
  ): Promise<NavigateToResult> {
    const perf = createGlobalPerformanceTracker();
    perf.serial("navigateTo");

    const startTime = Date.now();
    const { targetScreen } = options;

    try {
      // Get current screen from navigation graph
      const currentScreen = this.navigationManager.getCurrentScreen();

      if (!currentScreen) {
        perf.end();
        return {
          success: false,
          error: "Cannot determine current screen. No navigation events recorded yet.",
          currentScreen: null,
          targetScreen,
          stepsExecuted: 0
        };
      }

      // Already on target screen
      if (currentScreen === targetScreen) {
        perf.end();
        return {
          success: true,
          message: "Already on target screen",
          currentScreen,
          targetScreen,
          stepsExecuted: 0,
          durationMs: Date.now() - startTime
        };
      }

      // Find path to target
      const pathResult = this.navigationManager.findPath(targetScreen);

      if (!pathResult.found) {
        perf.end();
        return {
          success: false,
          error: `No known path from "${currentScreen}" to "${targetScreen}". ` +
            `Known screens: ${this.navigationManager.getKnownScreens().join(", ") || "none"}`,
          currentScreen,
          targetScreen,
          stepsExecuted: 0,
          durationMs: Date.now() - startTime
        };
      }

      // Execute path
      const executedPath: string[] = [];

      for (let i = 0; i < pathResult.path.length; i++) {
        const edge = pathResult.path[i];

        // Check timeout
        if (Date.now() - startTime > NavigateTo.MAX_TIMEOUT_MS) {
          perf.end();
          return {
            success: false,
            error: "Navigation timeout (30 seconds)",
            currentScreen: this.navigationManager.getCurrentScreen(),
            targetScreen,
            stepsExecuted: executedPath.length,
            partialPath: executedPath,
            durationMs: Date.now() - startTime
          };
        }

        // Report progress
        if (progress) {
          await progress(
            i,
            pathResult.path.length,
            `Navigating: ${edge.from} → ${edge.to}`
          );
        }

        logger.info(`[NAVIGATE_TO] Step ${i + 1}/${pathResult.path.length}: ${edge.from} → ${edge.to}`);

        // Execute navigation step
        try {
          if (edge.interaction) {
            // Set up required UI state before executing the tool call
            const setupActions = await this.setupUIState(edge, options.platform);
            if (setupActions.length > 0) {
              executedPath.push(...setupActions);
            }

            // Replay the tool call
            await this.executeToolCall(edge.interaction);
            executedPath.push(`${edge.interaction.toolName}(${JSON.stringify(edge.interaction.args)})`);
          } else {
            // No known interaction - try back button
            logger.info(`[NAVIGATE_TO] No known interaction for edge, using back button`);
            await this.pressBack();
            executedPath.push("pressButton(back)");
          }
        } catch (error) {
          logger.warn(`[NAVIGATE_TO] Error executing step: ${error}`);
          perf.end();
          return {
            success: false,
            error: `Failed to execute step ${i + 1}: ${error}`,
            currentScreen: this.navigationManager.getCurrentScreen(),
            targetScreen,
            stepsExecuted: executedPath.length,
            partialPath: executedPath,
            durationMs: Date.now() - startTime
          };
        }

        // Wait for screen transition
        const reached = await this.waitForScreen(edge.to, NavigateTo.STEP_TIMEOUT_MS);
        if (!reached) {
          logger.warn(`[NAVIGATE_TO] Screen "${edge.to}" not reached within timeout`);
          // Continue anyway - navigation events might be delayed
        }
      }

      // Final progress update
      if (progress) {
        await progress(
          pathResult.path.length,
          pathResult.path.length,
          `Arrived at ${targetScreen}`
        );
      }

      perf.end();
      return {
        success: true,
        message: `Successfully navigated to "${targetScreen}"`,
        currentScreen: this.navigationManager.getCurrentScreen(),
        targetScreen,
        stepsExecuted: executedPath.length,
        path: executedPath,
        durationMs: Date.now() - startTime
      };
    } catch (error) {
      perf.end();
      return {
        success: false,
        error: `Navigation failed: ${error}`,
        currentScreen: this.navigationManager.getCurrentScreen(),
        targetScreen,
        stepsExecuted: 0,
        durationMs: Date.now() - startTime
      };
    }
  }

  /**
   * Execute a tool call by looking up the tool in the registry.
   */
  private async executeToolCall(interaction: ToolCallInteraction): Promise<void> {
    const tool = ToolRegistry.getTool(interaction.toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${interaction.toolName}`);
    }

    logger.info(`[NAVIGATE_TO] Replaying tool call: ${interaction.toolName}`);

    // Call the tool handler with the original args
    await tool.handler(interaction.args);
  }

  /**
   * Press the back button as a fallback navigation action.
   */
  private async pressBack(): Promise<void> {
    // Use ADB directly for back button
    await this.adb.executeCommand("shell input keyevent 4");
    logger.debug(`[NAVIGATE_TO] Pressed back button`);
  }

  /**
   * Wait for the navigation graph to report we're on the expected screen.
   */
  private async waitForScreen(
    screenName: string,
    timeoutMs: number
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const currentScreen = this.navigationManager.getCurrentScreen();
      if (currentScreen === screenName) {
        logger.debug(`[NAVIGATE_TO] Reached screen: ${screenName}`);
        return true;
      }
      await this.sleep(NavigateTo.POLL_INTERVAL_MS);
    }

    logger.debug(`[NAVIGATE_TO] Timeout waiting for screen: ${screenName}`);
    return false;
  }

  /**
   * Sleep for the specified duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Set up the required UI state before executing a navigation step.
   * Compares the required state (from edge.uiState) with current state
   * and taps on any missing selected elements.
   *
   * @returns Array of setup actions that were performed
   */
  private async setupUIState(edge: NavigationEdge, platform: string): Promise<string[]> {
    const requiredState = edge.uiState;
    if (!requiredState?.selectedElements?.length) {
      logger.debug(`[NAVIGATE_TO] No UI state requirements for edge`);
      return [];
    }

    // Get current UI state from a fresh observation
    const currentState = await this.getCurrentUIState(platform);
    if (!currentState) {
      logger.warn(`[NAVIGATE_TO] Could not get current UI state, proceeding anyway`);
      return [];
    }

    // Find which selected elements are missing
    const missingElements = this.findMissingSelections(
      requiredState.selectedElements,
      currentState.selectedElements
    );

    if (missingElements.length === 0) {
      logger.debug(`[NAVIGATE_TO] UI state already matches requirements`);
      return [];
    }

    // Tap on missing elements to set up the required state
    const setupActions: string[] = [];
    for (const element of missingElements) {
      const tapped = await this.tapOnElement(element, platform);
      if (tapped) {
        setupActions.push(`tapOn(${JSON.stringify(element)})`);
      }
    }

    return setupActions;
  }

  /**
   * Get the current UI state by performing an observation.
   */
  private async getCurrentUIState(_platform: string): Promise<UIState | undefined> {
    try {
      const observeScreen = new ObserveScreen(this.device, this.adb);
      const result = await observeScreen.execute();

      if (!result.viewHierarchy) {
        return undefined;
      }

      return UIStateExtractor.extract(result.viewHierarchy);
    } catch (error) {
      logger.warn(`[NAVIGATE_TO] Error getting current UI state: ${error}`);
      return undefined;
    }
  }

  /**
   * Find selected elements that are required but not currently selected.
   * Only checks elements that have text (tabs, menu items with labels).
   */
  private findMissingSelections(
    required: Array<{ text?: string; resourceId?: string; contentDesc?: string }>,
    current: Array<{ text?: string; resourceId?: string; contentDesc?: string }>
  ): Array<{ text?: string; resourceId?: string; contentDesc?: string }> {
    const missing: Array<{ text?: string; resourceId?: string; contentDesc?: string }> = [];

    for (const req of required) {
      // Skip elements without text (we need text to tap on them)
      if (!req.text) {
        continue;
      }

      // Check if this element is already selected
      const isSelected = current.some(curr =>
        (req.text && curr.text === req.text) ||
        (req.resourceId && curr.resourceId === req.resourceId)
      );

      if (!isSelected) {
        missing.push(req);
        logger.info(`[NAVIGATE_TO] Missing selection: ${req.text || req.resourceId}`);
      }
    }

    return missing;
  }

  /**
   * Tap on an element to select it.
   */
  private async tapOnElement(
    element: { text?: string; resourceId?: string; contentDesc?: string },
    platform: string
  ): Promise<boolean> {
    const tapTool = ToolRegistry.getTool("tapOn");
    if (!tapTool) {
      logger.warn(`[NAVIGATE_TO] tapOn tool not found`);
      return false;
    }

    // Prefer text for tapping as it's most reliable
    const identifier = element.text || element.contentDesc || element.resourceId;
    if (!identifier) {
      logger.warn(`[NAVIGATE_TO] No identifier for element to tap`);
      return false;
    }

    logger.info(`[NAVIGATE_TO] Setting up UI state: tapping "${identifier}"`);

    try {
      const args: Record<string, string> = {
        action: "tap",
        platform
      };

      if (element.text) {
        args.text = element.text;
      } else if (element.resourceId) {
        args.id = element.resourceId;
      }

      await tapTool.handler(args);

      // Small delay for UI to update
      await this.sleep(100);

      return true;
    } catch (error) {
      logger.warn(`[NAVIGATE_TO] Failed to tap on "${identifier}": ${error}`);
      return false;
    }
  }
}
