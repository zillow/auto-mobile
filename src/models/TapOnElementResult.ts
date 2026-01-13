import { Element } from "./Element";
import { ElementBounds } from "./ElementBounds";
import { ElementSelectionStrategy } from "./ElementSelectionStrategy";
import { ObserveResult } from "./ObserveResult";
import { ToolDebugInfo } from "../utils/DebugContextBuilder";

export interface TapOnSelectedElementBounds extends ElementBounds {
  centerX: number;
  centerY: number;
}

export interface TapOnSelectedElement {
  text: string;
  resourceId: string;
  bounds: TapOnSelectedElementBounds;
  indexInMatches: number;
  totalMatches: number;
  selectionStrategy: ElementSelectionStrategy;
}

/**
 * Result of a tap on text operation
 */
export interface TapOnElementResult {
  success: boolean;
  action: string;
  element: Element;
  selectedElement?: TapOnSelectedElement;
  observation?: ObserveResult;
  error?: string;
  debug?: ToolDebugInfo;
  pressRecognized?: boolean;
  contextMenuOpened?: boolean;
  selectionStarted?: boolean;
  searchUntil?: {
    durationMs: number;
    requestCount: number;
    changeCount: number;
  };
}
