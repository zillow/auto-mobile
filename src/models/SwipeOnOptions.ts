/**
 * Options for swiping on screen or element
 */
export type SwipeDirection = "up" | "down" | "left" | "right";

/**
 * Gesture type clarifies how to interpret the direction parameter:
 * - "swipeFingerTowardsDirection": direction describes where the finger moves (default)
 * - "scrollTowardsDirection": direction describes where the content scrolls to
 */
export type GestureType = "swipeFingerTowardsDirection" | "scrollTowardsDirection";

export interface SwipeOnOptions {
  // Include system insets (status/navigation bars)
  includeSystemInsets?: boolean; // Include status/navigation bars (default false)

  // Container to swipe within (optional, defaults to screen/window if not specified)
  container?: {
    elementId?: string; // Resource ID of container
    text?: string; // Text within container
  };

  // Auto-target a scrollable container when no container is specified (default true)
  autoTarget?: boolean;

  // Direction - interpretation depends on gestureType
  direction?: SwipeDirection;

  // How to interpret the direction parameter
  gestureType?: GestureType;

  // Search for element while scrolling (optional)
  lookFor?: {
    elementId?: string;
    text?: string;
    maxTime?: number; // Max time to search (default 15000ms) - internal only
  };

  // Gesture options
  speed?: "slow" | "normal" | "fast"; // Speed preset
  duration?: number; // Manual duration override (ms) - internal only
  scrollMode?: "adb" | "a11y"; // Execution mode (Android only) - internal only
}
