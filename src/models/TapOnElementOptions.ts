/**
 * Options for tapping on an element
 */
export interface TapOnElementOptions {
  // Element selection - one of these must be provided
  text?: string;
  elementId?: string;

  // Container to restrict search
  container?: {
    elementId?: string;
    text?: string;
  };

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

  // Optional await for an element to appear after tap
  await?: {
    element: {
      id?: string;
      text?: string;
    };
    timeout?: number;
  };

  // Fail the tap if the awaited element is not found within the timeout
  strictAwait?: boolean;
}
