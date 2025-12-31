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
import { ModalState, ScrollPosition } from "../../utils/interfaces/NavigationGraph";
import { ProgressCallback } from "../../server/toolRegistry";
import { UIStateExtractor } from "./UIStateExtractor";
import { ObserveScreen } from "../observe/ObserveScreen";
import { SmartNavigationHelper } from "./SmartNavigationHelper";

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

      // Check if we should use smart back button navigation
      // Get current screen's back stack depth from the last observation
      const currentNode = this.navigationManager.getNode(currentScreen);
      const currentBackStackDepth = currentNode?.backStackDepth ?? 0;

      if (currentBackStackDepth > 0) {
        const backNavResult = SmartNavigationHelper.shouldUseBackButton(
          currentScreen,
          targetScreen,
          currentBackStackDepth
        );

        if (backNavResult.shouldUseBack) {
          logger.info(
            `[NAVIGATE_TO] Using smart back button navigation: ` +
            `${backNavResult.backPresses} back presses. Reason: ${backNavResult.reason}`
          );

          // Execute back button presses
          const executedPath: string[] = [];
          for (let i = 0; i < backNavResult.backPresses; i++) {
            if (progress) {
              await progress(
                i,
                backNavResult.backPresses,
                `Pressing back button (${i + 1}/${backNavResult.backPresses})`
              );
            }

            await this.pressBack();
            executedPath.push("pressButton(back)");

            // Small delay between presses to allow screen transitions
            await new Promise(resolve => setTimeout(resolve, 300));
          }

          // Wait for target screen
          const reached = await this.waitForScreen(targetScreen, NavigateTo.STEP_TIMEOUT_MS);

          if (progress) {
            await progress(
              backNavResult.backPresses,
              backNavResult.backPresses,
              reached ? `Arrived at ${targetScreen}` : `Waiting for ${targetScreen}`
            );
          }

          perf.end();
          return {
            success: reached,
            message: reached
              ? `Successfully navigated to "${targetScreen}" using back button`
              : `Pressed back ${backNavResult.backPresses} times but did not reach "${targetScreen}"`,
            currentScreen: this.navigationManager.getCurrentScreen(),
            targetScreen,
            stepsExecuted: executedPath.length,
            path: executedPath,
            durationMs: Date.now() - startTime
          };
        } else {
          logger.debug(
            `[NAVIGATE_TO] Not using back button navigation. Reason: ${backNavResult.reason}`
          );
        }
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
            // Set up scroll position if required (must happen before UI state setup)
            if (edge.uiState?.scrollPosition) {
              const scrollAction = await this.setupScrollPosition(edge.uiState.scrollPosition, options.platform);
              if (scrollAction) {
                executedPath.push(scrollAction);
              }
            }

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
   * Handles modal stack alignment and selected elements.
   *
   * @returns Array of setup actions that were performed
   */
  private async setupUIState(edge: NavigationEdge, platform: string): Promise<string[]> {
    const requiredState = edge.uiState;

    // Early return if no UI state requirements
    if (!requiredState?.modalStack?.length && !requiredState?.selectedElements?.length) {
      logger.debug(`[NAVIGATE_TO] No UI state requirements for edge`);
      return [];
    }

    const setupActions: string[] = [];

    // Get current UI state from a fresh observation
    const currentState = await this.getCurrentUIState(platform);
    if (!currentState) {
      logger.warn(`[NAVIGATE_TO] Could not get current UI state, proceeding anyway`);
      return [];
    }

    // Step 1: Handle modal stack alignment
    if (requiredState.modalStack?.length) {
      const modalStackActions = await this.setupModalStack(
        currentState.modalStack || [],
        requiredState.modalStack,
        platform
      );
      setupActions.push(...modalStackActions);
    }

    // Step 2: Handle selected elements (tabs, menu items, etc.)
    if (requiredState.selectedElements?.length) {
      // Get current state again after modal stack changes if modals were dismissed
      const updatedState = setupActions.length > 0
        ? await this.getCurrentUIState(platform)
        : currentState;

      if (updatedState) {
        const missingElements = this.findMissingSelections(
          requiredState.selectedElements,
          updatedState.selectedElements
        );

        // Tap on missing elements to set up the required state
        for (const element of missingElements) {
          const tapped = await this.tapOnElement(element, platform);
          if (tapped) {
            setupActions.push(`tapOn(${JSON.stringify(element)})`);
          }
        }
      }
    }

    if (setupActions.length === 0) {
      logger.debug(`[NAVIGATE_TO] UI state already matches requirements`);
    }

    return setupActions;
  }

  /**
   * Set up scroll position to make a navigation element visible.
   * Uses swipeOn with lookFor to scroll until the target element is found.
   *
   * @returns Description of the scroll action performed, or null if skipped
   */
  private async setupScrollPosition(
    scrollPosition: ScrollPosition,
    platform: string
  ): Promise<string | null> {
    logger.info(
      `[NAVIGATE_TO] Setting up scroll position: ` +
      `target=${scrollPosition.targetElement.text || scrollPosition.targetElement.resourceId}, ` +
      `direction=${scrollPosition.direction}`
    );

    try {
      // Get the swipeOn tool from the registry
      const swipeOnTool = ToolRegistry.getTool("swipeOn");
      if (!swipeOnTool) {
        logger.warn(`[NAVIGATE_TO] swipeOn tool not found, skipping scroll setup`);
        return null;
      }

      // Build swipeOn arguments with lookFor
      const swipeOnArgs: any = {
        platform,
        direction: scrollPosition.direction,
        lookFor: {
          text: scrollPosition.targetElement.text,
          elementId: scrollPosition.targetElement.resourceId
        }
      };

      // Add container if specified
      if (scrollPosition.container) {
        swipeOnArgs.container = {
          text: scrollPosition.container.text,
          elementId: scrollPosition.container.resourceId
        };
      }

      // Add speed if specified
      if (scrollPosition.speed) {
        swipeOnArgs.speed = scrollPosition.speed;
      }

      // Execute swipeOn with lookFor
      const result = await swipeOnTool.handler(swipeOnArgs);

      if (result?.success && result?.found) {
        logger.info(`[NAVIGATE_TO] Successfully scrolled to target element`);
        return `swipeOn(lookFor: ${JSON.stringify(scrollPosition.targetElement)})`;
      } else {
        // Element not found after scrolling - log warning but continue
        logger.warn(
          `[NAVIGATE_TO] Could not find target element after scrolling, ` +
          `continuing anyway (element might still be accessible)`
        );
        return null;
      }
    } catch (error) {
      logger.warn(`[NAVIGATE_TO] Error setting up scroll position: ${error}, continuing anyway`);
      return null;
    }
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

  /**
   * Align the current modal stack with the required modal stack.
   * Dismisses extra modals and opens missing ones.
   *
   * @returns Array of actions performed
   */
  private async setupModalStack(
    currentStack: ModalState[],
    requiredStack: ModalState[],
    platform: string
  ): Promise<string[]> {
    const actions: string[] = [];

    // Dismiss extra modals from the top down
    while (currentStack.length > requiredStack.length) {
      const topModal = currentStack[currentStack.length - 1];
      logger.info(`[NAVIGATE_TO] Dismissing modal: ${topModal.type} (layer ${topModal.layer})`);

      const dismissed = await this.dismissTopModal(topModal, platform);
      if (dismissed) {
        actions.push(`dismissModal(${topModal.type})`);
        currentStack.pop();
        // Small delay for modal to dismiss
        await this.sleep(300);
      } else {
        logger.warn(`[NAVIGATE_TO] Failed to dismiss ${topModal.type}, stopping modal alignment`);
        break;
      }
    }

    // Note: Opening modals is complex and depends on app-specific UI interactions
    // For now, we only handle dismissal. Opening modals will happen naturally
    // when executing the navigation edge interaction.
    if (requiredStack.length > currentStack.length) {
      logger.debug(
        `[NAVIGATE_TO] Required modal stack has ${requiredStack.length - currentStack.length} more modal(s), ` +
        `will be opened by navigation interaction`
      );
    }

    return actions;
  }

  /**
   * Dismiss the top modal using context-aware dismissal methods.
   * Tries different strategies based on modal type.
   *
   * @returns true if dismissal succeeded
   */
  private async dismissTopModal(modal: ModalState, platform: string): Promise<boolean> {
    logger.debug(`[NAVIGATE_TO] Attempting to dismiss ${modal.type} modal`);

    // Strategy 1: Try back button (works for most dialogs)
    if (modal.type === "dialog") {
      try {
        await this.pressBack();
        await this.sleep(200);

        // Verify dismissal
        const currentState = await this.getCurrentUIState(platform);
        const dismissed = !currentState?.modalStack?.some(m => m.windowId === modal.windowId);
        if (dismissed) {
          logger.info(`[NAVIGATE_TO] Dismissed ${modal.type} with back button`);
          return true;
        }
      } catch (error) {
        logger.debug(`[NAVIGATE_TO] Back button failed for ${modal.type}: ${error}`);
      }
    }

    // Strategy 2: Swipe down for bottom sheets
    if (modal.type === "bottomsheet") {
      try {
        const swipeTool = ToolRegistry.getTool("swipe");
        if (swipeTool) {
          // Swipe down from middle of screen to dismiss bottom sheet
          await swipeTool.handler({
            action: "swipe",
            direction: "down",
            platform
          });
          await this.sleep(200);

          // Verify dismissal
          const currentState = await this.getCurrentUIState(platform);
          const dismissed = !currentState?.modalStack?.some(m => m.windowId === modal.windowId);
          if (dismissed) {
            logger.info(`[NAVIGATE_TO] Dismissed bottom sheet with swipe down`);
            return true;
          }
        }

        // Fallback to back button
        await this.pressBack();
        await this.sleep(200);

        const currentState = await this.getCurrentUIState(platform);
        const dismissed = !currentState?.modalStack?.some(m => m.windowId === modal.windowId);
        if (dismissed) {
          logger.info(`[NAVIGATE_TO] Dismissed bottom sheet with back button`);
          return true;
        }
      } catch (error) {
        logger.debug(`[NAVIGATE_TO] Swipe down failed for bottom sheet: ${error}`);
      }
    }

    // Strategy 3: Look for close/cancel button
    if (modal.type === "dialog" || modal.type === "bottomsheet") {
      try {
        const closeButtonTapped = await this.tapCloseButton(platform);
        if (closeButtonTapped) {
          await this.sleep(200);

          // Verify dismissal
          const currentState = await this.getCurrentUIState(platform);
          const dismissed = !currentState?.modalStack?.some(m => m.windowId === modal.windowId);
          if (dismissed) {
            logger.info(`[NAVIGATE_TO] Dismissed ${modal.type} with close button`);
            return true;
          }
        }
      } catch (error) {
        logger.debug(`[NAVIGATE_TO] Close button tap failed: ${error}`);
      }
    }

    // Strategy 4: Tap outside (for popups and menus)
    if (modal.type === "popup" || modal.type === "menu" || modal.type === "overlay") {
      try {
        // Tap top-left corner (usually outside modal)
        await this.adb.executeCommand("shell input tap 50 50");
        await this.sleep(200);

        // Verify dismissal
        const currentState = await this.getCurrentUIState(platform);
        const dismissed = !currentState?.modalStack?.some(m => m.windowId === modal.windowId);
        if (dismissed) {
          logger.info(`[NAVIGATE_TO] Dismissed ${modal.type} by tapping outside`);
          return true;
        }
      } catch (error) {
        logger.debug(`[NAVIGATE_TO] Tap outside failed: ${error}`);
      }
    }

    // Final fallback: back button
    try {
      await this.pressBack();
      await this.sleep(200);

      const currentState = await this.getCurrentUIState(platform);
      const dismissed = !currentState?.modalStack?.some(m => m.windowId === modal.windowId);
      if (dismissed) {
        logger.info(`[NAVIGATE_TO] Dismissed ${modal.type} with back button (fallback)`);
        return true;
      }
    } catch (error) {
      logger.debug(`[NAVIGATE_TO] Final back button attempt failed: ${error}`);
    }

    logger.warn(`[NAVIGATE_TO] All dismissal strategies failed for ${modal.type}`);
    return false;
  }

  /**
   * Try to tap a close/cancel button in the current view.
   */
  private async tapCloseButton(platform: string): Promise<boolean> {
    const tapTool = ToolRegistry.getTool("tapOn");
    if (!tapTool) {
      return false;
    }

    // Common close button texts
    const closeTexts = ["Close", "Cancel", "Dismiss", "×", "✕"];

    for (const text of closeTexts) {
      try {
        await tapTool.handler({
          action: "tap",
          text,
          platform
        });
        logger.debug(`[NAVIGATE_TO] Tapped close button: "${text}"`);
        return true;
      } catch (error) {
        // Button not found, try next
        continue;
      }
    }

    return false;
  }
}
