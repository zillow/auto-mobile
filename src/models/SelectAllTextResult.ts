import { ObserveResult } from "./ObserveResult";

/**
 * Result of a select all text operation
 */
export interface SelectAllTextResult {
  success: boolean;
  observation?: ObserveResult;
  error?: string;
}
