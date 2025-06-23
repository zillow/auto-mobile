import { ObserveResult } from "./ObserveResult";

/**
 * Result of a tap operation
 */
export interface SwipeResult {
  success: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  duration: number;
  path?: number;
  easing?: "linear" | "decelerate" | "accelerate" | "accelerateDecelerate";
  observation?: ObserveResult;
  error?: string;
}
