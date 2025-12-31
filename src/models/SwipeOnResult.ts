import { ObserveResult } from "./ObserveResult";
import { Element } from "./Element";
import { ToolDebugInfo } from "../utils/DebugContextBuilder";

/**
 * Result of a swipeOn operation
 */
export interface SwipeOnResult {
  success: boolean;
  error?: string;

  // Target information
  targetType: "screen" | "element";
  element?: Element; // Set when swiping on an element

  // Swipe coordinates
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  duration: number;

  // Gesture details
  easing?: "linear" | "decelerate" | "accelerate" | "accelerateDecelerate";
  path?: number;

  // Search results (when using lookFor)
  found?: boolean; // Was the target element found?
  scrollIterations?: number; // Number of scrolls performed
  elapsedMs?: number; // Time taken to find element
  hierarchyChanged?: boolean; // Did the hierarchy change during scroll?

  // Observation
  observation?: ObserveResult;

  // A11y mode timing (when scrollMode="a11y")
  a11yTotalTimeMs?: number;
  a11yGestureTimeMs?: number;
  fallbackReason?: string;

  // Debug information (when debug mode is enabled)
  debug?: ToolDebugInfo;
}
