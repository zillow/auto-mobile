import { NavigationGraphManager } from "./NavigationGraphManager";
import { DefaultPathOptimizer } from "./DefaultPathOptimizer";
import {
  BackButtonRecommendation,
  NavigationRecommendation
} from "./interfaces/PathOptimizer";

/**
 * Helper class for smart navigation using back stack awareness.
 * This is a backward-compatible wrapper around PathOptimizer.
 *
 * @deprecated Use DefaultPathOptimizer instance instead for better testability
 */
export class SmartNavigationHelper {
  private static optimizer: DefaultPathOptimizer | null = null;

  private static getOptimizer(): DefaultPathOptimizer {
    if (!SmartNavigationHelper.optimizer) {
      const navGraph = NavigationGraphManager.getInstance();
      SmartNavigationHelper.optimizer = new DefaultPathOptimizer(navGraph);
    }
    return SmartNavigationHelper.optimizer;
  }

  /**
   * Determine if we should use back button to navigate from current to target screen.
   *
   * @deprecated Use DefaultPathOptimizer instance instead
   */
  public static shouldUseBackButton(
    currentScreen: string,
    targetScreen: string,
    currentBackStackDepth: number
  ): BackButtonRecommendation {
    return SmartNavigationHelper.getOptimizer().shouldUseBackButton(
      currentScreen,
      targetScreen,
      currentBackStackDepth
    );
  }

  /**
   * Check if two screens are in the same task (same app task).
   *
   * @deprecated Use DefaultPathOptimizer instance instead
   */
  public static areInSameTask(screen1: string, screen2: string): boolean {
    return SmartNavigationHelper.getOptimizer().areInSameTask(screen1, screen2);
  }

  /**
   * Get navigation recommendation for reaching a target screen.
   *
   * @deprecated Use DefaultPathOptimizer instance instead
   */
  public static getNavigationRecommendation(
    targetScreen: string,
    currentScreen: string,
    currentBackStackDepth: number
  ): NavigationRecommendation {
    return SmartNavigationHelper.getOptimizer().getNavigationRecommendation(
      targetScreen,
      currentScreen,
      currentBackStackDepth
    );
  }

  /**
   * Reset the optimizer instance (for testing).
   * @internal
   */
  public static resetOptimizer(): void {
    SmartNavigationHelper.optimizer = null;
  }
}
