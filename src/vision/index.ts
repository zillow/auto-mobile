/**
 * Vision-based element detection fallback module
 */

export { VisionFallback, DEFAULT_VISION_CONFIG } from "./VisionFallback";
export { ClaudeVisionClient } from "./ClaudeVisionClient";
export { getVisionEnrichedError } from "./applyVisionFallback";
export type {
  VisionFallbackConfig,
  VisionFallbackResult,
  ElementSearchCriteria,
  NavigationStep,
  AlternativeSelector,
  ClaudeVisionAnalysis,
  VisionAnalyzer,
} from "./VisionTypes";
