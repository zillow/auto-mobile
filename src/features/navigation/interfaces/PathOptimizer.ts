/**
 * Result of back button optimization analysis.
 */
export interface BackButtonRecommendation {
  /** Whether back button navigation should be used */
  shouldUseBack: boolean;
  /** Number of back button presses needed (0 if shouldUseBack is false) */
  backPresses: number;
  /** Human-readable reason for the decision */
  reason: string;
}

/**
 * Navigation method recommendation.
 */
export interface NavigationRecommendation {
  /** Recommended navigation method */
  method: "forward" | "back" | "unknown";
  /** Number of back presses if method is "back" */
  backPresses?: number;
  /** Human-readable reason for the recommendation */
  reason: string;
}

/**
 * Interface for optimizing navigation paths using back stack awareness.
 * Analyzes back stack depth to determine if back button navigation is more efficient.
 */
export interface PathOptimizer {
  /**
   * Determine if back button should be used to navigate from current to target screen.
   *
   * @param currentScreen - Current screen name
   * @param targetScreen - Target screen name
   * @param currentBackStackDepth - Current back stack depth
   * @returns Recommendation with shouldUseBack flag and number of back presses
   */
  shouldUseBackButton(
    currentScreen: string,
    targetScreen: string,
    currentBackStackDepth: number
  ): Promise<BackButtonRecommendation>;

  /**
   * Check if two screens are in the same Android task.
   *
   * @param screen1 - First screen name
   * @param screen2 - Second screen name
   * @returns True if screens are in the same task
   */
  areInSameTask(screen1: string, screen2: string): Promise<boolean>;

  /**
   * Get overall navigation recommendation for reaching a target screen.
   *
   * @param targetScreen - Target screen to navigate to
   * @param currentScreen - Current screen name
   * @param currentBackStackDepth - Current back stack depth
   * @returns Navigation recommendation with method and reasoning
   */
  getNavigationRecommendation(
    targetScreen: string,
    currentScreen: string,
    currentBackStackDepth: number
  ): Promise<NavigationRecommendation>;
}
