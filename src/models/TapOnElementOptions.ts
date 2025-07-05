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
  action: "tap" | "doubleTap" | "longPress" | "focus";
}
