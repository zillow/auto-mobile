import { Element } from "./Element";

/**
 * Represents a match found during element search with debugging info
 */
export interface DebugSearchMatch {
  /**
   * The matched element
   */
  element: Element;

  /**
   * What property matched (text, content-desc, resource-id, etc.)
   */
  matchedProperty: string;

  /**
   * The actual value that matched
   */
  matchedValue: string;

  /**
   * Whether this was an exact match
   */
  isExactMatch: boolean;

  /**
   * The element's class name
   */
  className?: string;

  /**
   * The element's resource ID
   */
  resourceId?: string;

  /**
   * Whether the element is clickable
   */
  clickable: boolean;

  /**
   * Whether the element is enabled
   */
  enabled: boolean;

  /**
   * Whether the element is visible on screen
   */
  visible: boolean;

  /**
   * Z-order/accessibility score if available
   */
  accessibility?: number;
}

/**
 * Result from debug search operation
 */
export interface DebugSearchResult {
  /**
   * The search query used
   */
  query: {
    text?: string;
    resourceId?: string;
    container?: {
      elementId?: string;
      text?: string;
    };
    partialMatch: boolean;
    caseSensitive: boolean;
  };

  /**
   * All matches found
   */
  matches: DebugSearchMatch[];

  /**
   * The element that would be selected by the normal search
   */
  selectedMatch?: DebugSearchMatch;

  /**
   * Total elements in the hierarchy
   */
  totalElements: number;

  /**
   * Elements that were considered but didn't match
   */
  nearMisses?: {
    element: Element;
    property: string;
    value: string;
    reason: string;
  }[];

  /**
   * Timestamp when search was performed
   */
  timestamp: number;
}
