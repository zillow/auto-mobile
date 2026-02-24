/**
 * Shared utility for applying vision fallback error enrichment across tools.
 */

import { VisionFallback } from "./VisionFallback";
import type { VisionFallbackConfig, ElementSearchCriteria, VisionAnalyzer } from "./VisionTypes";
import type { ScreenshotCapturer } from "../features/navigation/SelectionStateTracker";
import { logger } from "../utils/logger";

/**
 * Attempts to enrich an error message using vision fallback (AI-based element search).
 * If vision is disabled, screenshot unavailable, or vision fails, returns baseError unchanged.
 */
export async function getVisionEnrichedError(
  screenshotCapturer: ScreenshotCapturer,
  viewHierarchy: unknown,
  searchCriteria: ElementSearchCriteria,
  visionConfig: VisionFallbackConfig,
  baseError: string,
  signal?: AbortSignal,
  visionAnalyzer?: VisionAnalyzer
): Promise<string> {
  if (!visionConfig.enabled) {
    return baseError;
  }

  try {
    const screenshotPath = await screenshotCapturer.capture(signal);
    if (!screenshotPath) {
      logger.error("Failed to capture screenshot for vision fallback");
      return baseError;
    }

    const analyzer: VisionAnalyzer = visionAnalyzer ?? new VisionFallback(visionConfig);
    const visionResult = await analyzer.analyzeAndSuggest(
      screenshotPath,
      viewHierarchy,
      searchCriteria
    );

    if (visionResult.confidence === "high" && visionResult.navigationSteps && visionResult.navigationSteps.length > 0) {
      const stepsText = visionResult.navigationSteps
        .map((step, i) => `${i + 1}. ${step.description}`)
        .join("\n");
      return (
        `Element not found, but AI suggests these steps:\n${stepsText}\n\n` +
        `(Cost: $${visionResult.costUsd.toFixed(4)}, Confidence: ${visionResult.confidence})`
      );
    }

    if (visionResult.alternativeSelectors && visionResult.alternativeSelectors.length > 0) {
      const suggestions = visionResult.alternativeSelectors
        .map(alt => `- ${alt.type}: "${alt.value}" (${alt.reasoning})`)
        .join("\n");
      return (
        `Element not found. AI suggests trying:\n${suggestions}\n\n` +
        `(Cost: $${visionResult.costUsd.toFixed(4)}, Confidence: ${visionResult.confidence})`
      );
    }

    return (
      `${baseError}. ${visionResult.reason || "No clear path found."}\n\n` +
      `(Cost: $${visionResult.costUsd.toFixed(4)}, Confidence: ${visionResult.confidence})`
    );
  } catch (error) {
    logger.error("Vision fallback failed:", error);
    return baseError;
  }
}
