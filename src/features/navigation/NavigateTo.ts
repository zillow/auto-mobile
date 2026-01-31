import { BootedDevice, NavigateToResult } from "../../models";
import { AdbClientFactory, defaultAdbClientFactory } from "../../utils/android-cmdline-tools/AdbClientFactory";
import type { AdbExecutor } from "../../utils/android-cmdline-tools/interfaces/AdbExecutor";
import { logger } from "../../utils/logger";
import { createGlobalPerformanceTracker } from "../../utils/PerformanceTracker";
import { ToolRegistry } from "../../server/toolRegistry";
import {
  NavigationGraphManager,
  ToolCallInteraction
} from "./NavigationGraphManager";
import { ProgressCallback } from "../../server/toolRegistry";
import { SmartNavigationHelper } from "./SmartNavigationHelper";
import { UIStateSetup } from "./interfaces/UIStateSetup";
import { DefaultUIStateSetup } from "./DefaultUIStateSetup";
import { ScreenTransitionWaiter } from "./interfaces/ScreenTransitionWaiter";
import { DefaultScreenTransitionWaiter } from "./DefaultScreenTransitionWaiter";

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
  private adb: AdbExecutor;
  private navigationManager: NavigationGraphManager;
  private uiStateSetup: UIStateSetup;
  private screenWaiter: ScreenTransitionWaiter;

  private static readonly MAX_TIMEOUT_MS = 30000; // 30 seconds
  private static readonly STEP_TIMEOUT_MS = 5000; // 5 seconds per step
  private static readonly POLL_INTERVAL_MS = 500; // Check screen every 500ms

  constructor(
    device: BootedDevice,
    adbFactory: AdbClientFactory = defaultAdbClientFactory,
    uiStateSetup: UIStateSetup | null = null,
    screenWaiter: ScreenTransitionWaiter | null = null
  ) {
    this.device = device;
    this.adb = adbFactory.create(device);
    this.navigationManager = NavigationGraphManager.getInstance();

    // Use injected dependencies or create defaults
    this.uiStateSetup = uiStateSetup || new DefaultUIStateSetup(this.device, this.adb);
    this.screenWaiter = screenWaiter || new DefaultScreenTransitionWaiter(
      this.navigationManager,
      NavigateTo.POLL_INTERVAL_MS
    );
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
          const reached = await this.screenWaiter.waitForScreen(targetScreen, NavigateTo.STEP_TIMEOUT_MS);

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
      const pathResult = await this.navigationManager.findPath(targetScreen);

      if (!pathResult.found) {
        perf.end();
        const knownScreens = await this.navigationManager.getKnownScreens();
        return {
          success: false,
          error: `No known path from "${currentScreen}" to "${targetScreen}". ` +
            `Known screens: ${knownScreens.join(", ") || "none"}`,
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
              const scrollAction = await this.uiStateSetup.setupScrollPosition(edge.uiState.scrollPosition, options.platform);
              if (scrollAction) {
                executedPath.push(scrollAction);
              }
            }

            // Set up required UI state before executing the tool call
            const setupActions = await this.uiStateSetup.setupUIState(edge, options.platform);
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
        const reached = await this.screenWaiter.waitForScreen(edge.to, NavigateTo.STEP_TIMEOUT_MS);
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
   * Sleep for the specified duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
