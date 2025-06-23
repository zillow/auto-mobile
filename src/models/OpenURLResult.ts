import { ObserveResult } from "./ObserveResult";

/**
 * Result of an open URL operation
 */
export interface OpenURLResult {
  success: boolean;
  url: string;
  observation?: ObserveResult;
  error?: string;
}
