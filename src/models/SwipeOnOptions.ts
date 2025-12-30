/**
 * Options for swiping on screen or element
 */
export interface SwipeOnOptions {
  // Target selection - mutually exclusive groups:
  // 1. Screen swipe
  screen?: boolean;

  // 2. Element by text
  text?: string;

  // 3. Element by resource ID
  elementId?: string;

  // Container to restrict search (optional, for element-based swipes)
  containerElementId?: string;
  containerText?: string;

  // Direction (required)
  direction: "up" | "down" | "left" | "right";

  // Search for element while scrolling (optional)
  lookFor?: {
    text?: string;
    elementId?: string;
    maxTime?: number; // Max time to search (default 15000ms)
  };

  // Gesture options
  speed?: "slow" | "normal" | "fast"; // Speed preset
  duration?: number; // Manual duration override (ms)
  scrollMode?: "adb" | "a11y"; // Execution mode (Android only)

  // Screen swipe options
  includeSystemInsets?: boolean; // Include status/navigation bars (default false)
}
