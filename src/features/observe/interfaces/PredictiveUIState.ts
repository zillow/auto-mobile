import type { ObserveResult, Predictions } from "../../../models";

/**
 * Interface for generating predictive UI state based on navigation graph.
 */
export interface PredictiveUIState {
  /**
   * Generate predictions for likely next actions based on current screen state
   * and navigation graph edges.
   * @param result - Current observe result with view hierarchy
   * @returns Promise with predictions for likely actions and interactable elements, or undefined if unavailable
   */
  generate(result: ObserveResult): Promise<Predictions | undefined>;
}
