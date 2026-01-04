/**
 * Options for tapping on an element
 */
export interface TapOnElementOptions {
  // Element selection - one of these must be provided
  text?: string;
  elementId?: string;

  // Container to restrict search
  containerElementId?: string;

  // Action to perform
  action: "tap" | "doubleTap" | "longPress" | "longPressDrag" | "focus";

  // Optional duration for long press actions (milliseconds)
  duration?: number;

  // Drag target for long press drag
  dragTo?: {
    x?: number;
    y?: number;
    text?: string;
    elementId?: string;
  };
}
