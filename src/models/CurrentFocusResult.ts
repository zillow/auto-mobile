import type { Element } from "./Element";

/**
 * Result from getCurrentFocus WebSocket command
 */
export interface CurrentFocusResult {
  /**
   * The element that currently has accessibility focus (TalkBack cursor position).
   * null if no element is focused.
   */
  focusedElement: Element | null;

  /**
   * Total time taken to get current focus in milliseconds
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
