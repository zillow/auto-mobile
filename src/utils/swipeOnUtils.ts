import { SwipeDirection, SwipeOnOptions } from "../models";

/**
 * Maps scroll content direction to finger swipe direction.
 * When gestureType is "scrollTowardsDirection", the direction describes where
 * the content scrolls, which is opposite to finger movement.
 */
export const SCROLL_TO_FINGER_DIRECTION: Record<SwipeDirection, SwipeDirection> = {
  up: "down",    // content scrolls up → finger swipes down
  down: "up",    // content scrolls down → finger swipes up
  left: "right", // content scrolls left → finger swipes right
  right: "left"  // content scrolls right → finger swipes left
};

interface ResolvedSwipeDirection {
  /** The resolved finger movement direction */
  direction?: SwipeDirection;
  /** Descriptive message for the tool response */
  message?: string;
  /** Error message if resolution failed */
  error?: string;
}

/**
 * Resolves the swipe direction based on the provided options.
 * If gestureType is provided, it interprets the direction accordingly:
 * - "swipeFingerTowardsDirection": direction is finger movement (default)
 * - "scrollTowardsDirection": direction is content scroll direction (inverted for finger)
 */
export const resolveSwipeDirection = (
  options: Pick<SwipeOnOptions, "direction" | "gestureType">
): ResolvedSwipeDirection => {
  const { direction, gestureType } = options;

  if (!direction) {
    return { error: "direction is required" };
  }

  // Default behavior: direction describes finger movement
  if (!gestureType || gestureType === "swipeFingerTowardsDirection") {
    return {
      direction,
      message: `Swiping ${direction} (finger gesture)`
    };
  }

  // gestureType === "scrollTowardsDirection"
  // Direction describes where content scrolls, invert for finger movement
  const fingerDirection = SCROLL_TO_FINGER_DIRECTION[direction];
  const contentRevealed = direction === "up" ? "above" :
    direction === "down" ? "below" :
      direction === "left" ? "from left" : "from right";

  return {
    direction: fingerDirection,
    message: `Scrolling ${direction} to reveal content ${contentRevealed}`
  };
};
