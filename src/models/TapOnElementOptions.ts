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
  action: "tap" | "doubleTap" | "longPress" | "focus";

  // Optional polling before tap to wait for element to appear
  searchUntil?: {
    duration?: number;
  };

  // Optional duration for long press actions (milliseconds)
  duration?: number;

  // Optional flag to set accessibility focus before performing action (TalkBack mode)
  // If not specified, will be determined automatically based on TalkBack state
  focusFirst?: boolean;
}
