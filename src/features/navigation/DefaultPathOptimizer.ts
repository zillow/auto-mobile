import { logger } from "../../utils/logger";
import { NavigationGraphManager } from "./NavigationGraphManager";
import { PathResult } from "../../utils/interfaces/NavigationGraph";
import {
  PathOptimizer,
  BackButtonRecommendation,
  NavigationRecommendation
} from "./interfaces/PathOptimizer";

/**
 * Default implementation of PathOptimizer that uses back stack awareness
 * to optimize navigation paths.
 */
export class DefaultPathOptimizer implements PathOptimizer {
  private navigationGraph: NavigationGraphManager;

  constructor(navigationGraph: NavigationGraphManager) {
    this.navigationGraph = navigationGraph;
  }

  /**
   * Determine if we should use back button to reach target screen.
   */
  public async shouldUseBackButton(
    currentScreen: string,
    targetScreen: string,
    currentBackStackDepth: number
  ): Promise<BackButtonRecommendation> {
    // Get the target node
    const targetNode = await this.navigationGraph.getNode(targetScreen);
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
    const pathResult: PathResult = await this.navigationGraph.findPath(targetScreen);
    const hasForwardPath = pathResult.found && pathResult.path.length > 0;

    if (!hasForwardPath) {
      logger.debug(
        `[PATH_OPTIMIZER] No forward path from ${targetScreen} to ${currentScreen}, ` +
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
        `[PATH_OPTIMIZER] Using back button navigation: ${currentScreen} -> ${targetScreen} ` +
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
   */
  public async areInSameTask(screen1: string, screen2: string): Promise<boolean> {
    const node1 = await this.navigationGraph.getNode(screen1);
    const node2 = await this.navigationGraph.getNode(screen2);

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
   */
  public async getNavigationRecommendation(
    targetScreen: string,
    currentScreen: string,
    currentBackStackDepth: number
  ): Promise<NavigationRecommendation> {
    // Check if we can use back button
    const backResult = await this.shouldUseBackButton(
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
    const pathResult = await this.navigationGraph.findPath(targetScreen);

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
