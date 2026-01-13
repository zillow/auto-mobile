import type { Element } from "./Element";
import type { ElementSelectionStrategy } from "./ElementSelectionStrategy";

/**
 * Result of selecting an element from a list of matches.
 */
export interface ElementSelectionResult {
  element: Element | null;
  indexInMatches: number;
  totalMatches: number;
  strategy: ElementSelectionStrategy;
}
