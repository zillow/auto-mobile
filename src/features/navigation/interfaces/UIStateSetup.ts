import { NavigationEdge, ScrollPosition } from "../../../utils/interfaces/NavigationGraph";

/**
 * Result of UI state setup operations.
 */
export interface UIStateSetupResult {
  /** Array of setup actions that were performed (for logging/debugging) */
  actions: string[];
  /** Whether setup was successful */
  success: boolean;
  /** Error message if setup failed */
  error?: string;
}

/**
 * Interface for setting up UI state before navigation steps.
 * Handles modal stack alignment, tab selection, scroll position, etc.
 */
export interface UIStateSetup {
  /**
   * Set up the required UI state before executing a navigation step.
   * Handles modal stack alignment and selected elements (tabs, menu items, etc.).
   *
   * @param edge - Navigation edge containing required UI state
   * @param platform - Platform (android/ios)
   * @returns Array of setup actions that were performed
   */
  setupUIState(edge: NavigationEdge, platform: string): Promise<string[]>;

  /**
   * Set up scroll position to make a navigation element visible.
   * Uses swipeOn with lookFor to scroll until the target element is found.
   *
   * @param scrollPosition - Scroll position requirements
   * @param platform - Platform (android/ios)
   * @returns Description of the scroll action performed, or null if skipped
   */
  setupScrollPosition(
    scrollPosition: ScrollPosition,
    platform: string
  ): Promise<string | null>;
}
