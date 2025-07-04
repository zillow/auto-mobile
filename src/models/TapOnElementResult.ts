import { Element } from "./Element";
import { ObserveResult } from "./ObserveResult";

/**
 * Result of a tap on text operation
 */
export interface TapOnElementResult {
  success: boolean;
  action: string;
  element: Element;
  observation?: ObserveResult;
  error?: string;
}
