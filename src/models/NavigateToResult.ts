/**
 * Result of the navigateTo tool.
 */
export interface NavigateToResult {
  /** Whether navigation was successful */
  success: boolean;

  /** Success or informational message */
  message?: string;

  /** Error message if navigation failed */
  error?: string;

  /** Current screen after navigation attempt */
  currentScreen: string | null;

  /** Target screen that was requested */
  targetScreen: string;

  /** Number of navigation steps successfully executed */
  stepsExecuted: number;

  /** List of actions taken during navigation */
  path?: string[];

  /** Partial path if navigation was interrupted (timeout/error) */
  partialPath?: string[];

  /** Time taken for navigation in milliseconds */
  durationMs?: number;
}
