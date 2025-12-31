/**
 * Global debug mode state
 * Set via CLI --debug flag
 *
 * When debug mode is enabled, tools will include additional debug information
 * in their responses to help troubleshoot failures and understand execution.
 */
let debugModeEnabled = false;

/**
 * Set the global debug mode enabled state
 */
export function setDebugModeEnabled(enabled: boolean): void {
  debugModeEnabled = enabled;
}

/**
 * Check if debug mode is globally enabled
 */
export function isDebugModeEnabled(): boolean {
  return debugModeEnabled;
}
