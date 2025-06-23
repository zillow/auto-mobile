import { Element } from "./Element";
import { ObserveResult } from "./ObserveResult";

/**
 * Result of a tap on text operation
 */
export interface TapOnTextResult {
  success: boolean;
  text: string;
  element: Element;
  x: number;
  y: number;
  observation?: ObserveResult;
  error?: string;
}
