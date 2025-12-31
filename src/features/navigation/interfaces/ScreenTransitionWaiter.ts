/**
 * Interface for waiting for screen transitions to complete.
 * Handles polling and timeout logic for navigation verification.
 */
export interface ScreenTransitionWaiter {
  /**
   * Wait for the navigation graph to report we're on the expected screen.
   * Polls the navigation graph at regular intervals until the screen is reached
   * or the timeout expires.
   *
   * @param screenName - Name of the screen to wait for
   * @param timeoutMs - Maximum time to wait in milliseconds
   * @returns true if screen was reached, false if timeout
   */
  waitForScreen(screenName: string, timeoutMs: number): Promise<boolean>;
}
