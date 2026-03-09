/**
 * Result of a global action request.
 */
export interface GlobalActionResult {
  success: boolean;
  action: string;
  error?: string;
}

/**
 * Source for executing global actions (back, home, recents) via the
 * accessibility service, bypassing ADB shell input keyevent.
 */
export interface GlobalActionSource {
  /**
   * Execute a global action on the device.
   * @param action - One of: "back", "home", "recent", "notifications", "power_dialog", "lock_screen"
   * @param timeoutMs - Timeout for the request in milliseconds
   * @returns Result of the action
   */
  executeGlobalAction(
    action: string,
    timeoutMs?: number
  ): Promise<GlobalActionResult>;
}
