import { ObserveResult } from "./ObserveResult";

/**
 * Result of a tap operation
 */
export interface TapResult {
  success: boolean;
  x: number;
  y: number;
  observation?: ObserveResult;
  error?: string;
}
