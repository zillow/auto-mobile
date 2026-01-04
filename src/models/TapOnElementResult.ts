import { Element } from "./Element";
import { ObserveResult } from "./ObserveResult";
import { ToolDebugInfo } from "../utils/DebugContextBuilder";

/**
 * Result of a tap on text operation
 */
export interface TapOnElementResult {
  success: boolean;
  action: string;
  element: Element;
  observation?: ObserveResult;
  error?: string;
  debug?: ToolDebugInfo;
  pressRecognized?: boolean;
  contextMenuOpened?: boolean;
  selectionStarted?: boolean;
}
