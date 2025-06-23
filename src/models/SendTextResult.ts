import { ObserveResult } from "./ObserveResult";

/**
 * Result of a send text operation
 */
export interface SendTextResult {
  success: boolean;
  text: string;
  imeAction?: string;
  observation?: ObserveResult;
  error?: string;
}
