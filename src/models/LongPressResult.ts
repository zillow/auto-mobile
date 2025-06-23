import { ObserveResult } from "./ObserveResult";

/**
 * Result of a long press operation
 */
export interface LongPressResult {
  success: boolean;
  x: number;
  y: number;
  observation?: ObserveResult;
  error?: string;
}
