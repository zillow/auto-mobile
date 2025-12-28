/**
 * Scroll/swipe execution mode
 * - "adb": Use ADB shell input swipe command (default, ~540ms)
 * - "a11y": Use accessibility service dispatchGesture API (~50-150ms, requires accessibility service)
 */
export type ScrollMode = "adb" | "a11y";

/**
 * Options for configuring gestures
 */
export interface GestureOptions {
  duration?: number;            // Total duration of gesture in ms
  easing?: "linear" | "decelerate" | "accelerate" | "accelerateDecelerate";
  fingers?: number;             // Number of touch points (default: 1)
  randomize?: boolean;          // Add small random variations to path
  lift?: boolean;               // Whether to lift finger at end (default: true)
  pressure?: number;            // Touch pressure (0.0-1.0)
  includeSystemInsets?: boolean; // Whether the gesture should be bounded by system insets
  scrollMode?: ScrollMode;      // Execution mode for scroll/swipe gestures (default: "adb")
}
