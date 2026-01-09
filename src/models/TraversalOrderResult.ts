import type { Element } from "./Element";

/**
 * Result from getTraversalOrder WebSocket command containing ordered accessibility-focusable elements
 */
export interface TraversalOrderResult {
  /**
   * Ordered list of accessibility-focusable elements in TalkBack traversal order
   * (depth-first, left-to-right traversal)
   */
  elements: Element[];

  /**
   * Index of the currently focused element in the elements array.
   * null if no element is focused.
   */
  focusedIndex: number | null;

  /**
   * Total number of focusable elements found
   */
  totalCount: number;

  /**
   * Total time taken to extract traversal order in milliseconds
   */
  totalTimeMs: number;

  /**
   * Optional request ID for correlating responses
   */
  requestId?: string;

  /**
   * Error message if the operation failed
   */
  error?: string;
}
