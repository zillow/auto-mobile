// Export all screenshot-related classes and interfaces
export { ScreenshotComparator, ScreenshotComparisonResult } from "./ScreenshotComparator";
export { PerceptualHasher } from "./PerceptualHasher";
export { ScreenshotCache } from "./ScreenshotCache";
export { ScreenshotMatcher, SimilarScreenshotResult } from "./ScreenshotMatcher";
export { ScreenshotUtils } from "./ScreenshotUtils";

// Re-export types for convenience
export type {
  ScreenshotComparisonResult as ComparisonResult,
  SimilarScreenshotResult as SimilarResult
} from "./ScreenshotUtils";
