import { logger } from "../../utils/logger";
import { NavigationGraphManager } from "./NavigationGraphManager";
import { PathResult } from "../../utils/interfaces/NavigationGraph";

/**
 * Helper class for smart navigation using back stack awareness.
 * Uses back button navigation when it's more efficient than re-navigating.
 */
export class SmartNavigationHelper {
  /**
   * Determine if we should use back button to reach target screen.
   * Returns true if:
   * 1. We have back stack information
   * 2. Target screen exists in the navigation graph
   * 3. Target screen's back stack depth is less than current screen's depth
   * 4. The difference in depth equals the path length (suggesting linear back navigation)
   *
   * @param currentScreen - Current screen name
   * @param targetScreen - Target screen name
   * @param currentBackStackDepth - Current back stack depth
   * @returns Object with shouldUseBack flag and number of times to press back
   */
  public static shouldUseBackButton(
    currentScreen: string,
    targetScreen: string,
    currentBackStackDepth: number
  ): { shouldUseBack: boolean; backPresses: number; reason: string } {
    const navGraph = NavigationGraphManager.getInstance();

    // Get the target node
    const targetNode = navGraph.getNode(targetScreen);
    if (!targetNode) {
      return {
        shouldUseBack: false,
        backPresses: 0,
        reason: "Target screen not in navigation graph"
      };
    }

    // Check if target node has back stack information
    if (targetNode.backStackDepth === undefined) {
      return {
        shouldUseBack: false,
        backPresses: 0,
        reason: "Target screen has no back stack information"
      };
    }

    // Current screen should be deeper in the stack than target
    if (currentBackStackDepth <= targetNode.backStackDepth) {
      return {
        shouldUseBack: false,
        backPresses: 0,
        reason: `Current depth (${currentBackStackDepth}) not greater than target depth (${targetNode.backStackDepth})`
      };
    }

    // Calculate depth difference
    const depthDifference = currentBackStackDepth - targetNode.backStackDepth;

    // Find if there's a known forward path from target to current
    // If yes, then back navigation should work
    const pathResult: PathResult = navGraph.findPath(targetScreen);
    const hasForwardPath = pathResult.found && pathResult.path.length > 0;

    if (!hasForwardPath) {
      logger.debug(
        `[SMART_NAV] No forward path from ${targetScreen} to ${currentScreen}, ` +
        `cannot verify back navigation safety`
      );

      // Be conservative: only use back button if depth difference is 1
      // (very likely to be a simple parent-child relationship)
      if (depthDifference === 1) {
        return {
          shouldUseBack: true,
          backPresses: 1,
          reason: `Depth difference is 1, likely direct parent screen`
        };
      }

      return {
        shouldUseBack: false,
        backPresses: 0,
        reason: "No known navigation path to verify safety"
      };
    }

    // Check if the path length matches the depth difference
    // This suggests a linear navigation path where back button would work
    if (pathResult.path.length === depthDifference) {
      logger.info(
        `[SMART_NAV] Using back button navigation: ${currentScreen} -> ${targetScreen} ` +
        `(${depthDifference} back presses)`
      );

      return {
        shouldUseBack: true,
        backPresses: depthDifference,
        reason: `Path length (${pathResult.path.length}) matches depth difference (${depthDifference})`
      };
    }

    // Path length doesn't match depth - might have branch navigation, tabs, etc.
    // Don't use back button to be safe
    return {
      shouldUseBack: false,
      backPresses: 0,
      reason: `Path length (${pathResult.path.length}) doesn't match depth difference (${depthDifference}), not safe to use back`
    };
  }

  /**
   * Check if two screens are in the same task (same app task).
   * Returns true if both screens have task IDs and they match.
   *
   * @param screen1 - First screen name
   * @param screen2 - Second screen name
   * @returns True if screens are in the same task
   */
  public static areInSameTask(screen1: string, screen2: string): boolean {
    const navGraph = NavigationGraphManager.getInstance();

    const node1 = navGraph.getNode(screen1);
    const node2 = navGraph.getNode(screen2);

    if (!node1 || !node2) {
      return false;
    }

    if (node1.taskId === undefined || node2.taskId === undefined) {
      return false;
    }

    return node1.taskId === node2.taskId;
  }

  /**
   * Get navigation recommendation for reaching a target screen.
   * Provides guidance on whether to use forward navigation or back button.
   *
   * @param targetScreen - Target screen to navigate to
   * @param currentScreen - Current screen name
   * @param currentBackStackDepth - Current back stack depth
   * @returns Navigation recommendation
   */
  public static getNavigationRecommendation(
    targetScreen: string,
    currentScreen: string,
    currentBackStackDepth: number
  ): {
    method: "forward" | "back" | "unknown";
    backPresses?: number;
    reason: string;
  } {
    // Check if we can use back button
    const backResult = this.shouldUseBackButton(
      currentScreen,
      targetScreen,
      currentBackStackDepth
    );

    if (backResult.shouldUseBack) {
      return {
        method: "back",
        backPresses: backResult.backPresses,
        reason: backResult.reason
      };
    }

    // Check if we have a known forward path
    const navGraph = NavigationGraphManager.getInstance();
    const pathResult = navGraph.findPath(targetScreen);

    if (pathResult.found) {
      return {
        method: "forward",
        reason: `Known forward path with ${pathResult.path.length} steps`
      };
    }

    // No known path
    return {
      method: "unknown",
      reason: "No known navigation path to target screen"
    };
  }
}
