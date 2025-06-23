import { ObserveResult } from "./ObserveResult";

/**
 * Result of a clear text operation
 */
export interface ClearTextResult {
  success: boolean;
  observation?: ObserveResult;
  error?: string;
}
