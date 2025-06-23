import { Element } from "./Element";
import { ObserveResult } from "./ObserveResult";

/**
 * Result of an exit dialog operation
 */
export interface ExitDialogResult {
  success: boolean;
  elementFound: boolean;
  element?: Element;
  x?: number;
  y?: number;
  observation?: ObserveResult;
  error?: string;
}
