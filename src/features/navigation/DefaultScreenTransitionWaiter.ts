import { logger } from "../../utils/logger";
import { NavigationGraphManager } from "./NavigationGraphManager";
import { ScreenTransitionWaiter } from "./interfaces/ScreenTransitionWaiter";

/**
 * Default implementation of ScreenTransitionWaiter that polls the navigation graph
 * to detect screen transitions.
 */
export class DefaultScreenTransitionWaiter implements ScreenTransitionWaiter {
  private navigationManager: NavigationGraphManager;
  private pollIntervalMs: number;

  /**
   * @param navigationManager - Navigation graph manager to query for current screen
   * @param pollIntervalMs - How often to poll for screen changes (default: 500ms)
   */
  constructor(
    navigationManager: NavigationGraphManager,
    pollIntervalMs: number = 500
  ) {
    this.navigationManager = navigationManager;
    this.pollIntervalMs = pollIntervalMs;
  }

  /**
   * Wait for the navigation graph to report we're on the expected screen.
   */
  async waitForScreen(screenName: string, timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const currentScreen = this.navigationManager.getCurrentScreen();
      if (currentScreen === screenName) {
        logger.debug(`[SCREEN_TRANSITION_WAITER] Reached screen: ${screenName}`);
        return true;
      }
      await this.sleep(this.pollIntervalMs);
    }

    logger.debug(`[SCREEN_TRANSITION_WAITER] Timeout waiting for screen: ${screenName}`);
    return false;
  }

  /**
   * Sleep for the specified duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
