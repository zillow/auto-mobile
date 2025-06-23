import { Point } from "./Point";

/**
 * Path for multi-finger gestures
 */
export interface FingerPath {
  points: Point[];
  finger: number;  // finger identifier (0-9)
}
