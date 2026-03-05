/**
 * Shared types for Android test recording via getevent + CtrlProxy.
 */

// ---------------------------------------------------------------------------
// Touch frame types (output of TouchFrameReconstructor)
// ---------------------------------------------------------------------------

export interface TouchSlot {
  slotId: number;
  /** -1 means the finger has been lifted */
  trackingId: number;
  /** raw sensor x coordinate */
  x: number;
  /** raw sensor y coordinate */
  y: number;
  pressure: number;
}

export interface RawTouchFrame {
  /** Date.now() on host when the SYN_REPORT line was read */
  arrivedAt: number;
  /** Only slots with trackingId >= 0 */
  activeSlots: ReadonlyArray<TouchSlot>;
  /** slotIds whose trackingId became -1 in this frame */
  releasedSlots: ReadonlyArray<number>;
}

// ---------------------------------------------------------------------------
// Gesture types (output of GestureClassifier / GetEventReader)
// ---------------------------------------------------------------------------

type GestureEventType =
  | "tap"
  | "doubleTap"
  | "longPress"
  | "swipe"
  | "pinch"
  | "pressButton";

export interface GestureEvent {
  type: GestureEventType;
  /** Host time of the UP/key event that completed the gesture */
  arrivedAt: number;

  // tap / doubleTap / longPress
  screenX?: number;
  screenY?: number;
  durationMs?: number;

  // swipe
  direction?: "up" | "down" | "left" | "right";
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  speed?: "slow" | "normal" | "fast";

  // pinch
  scale?: number;
  pinchDirection?: "in" | "out";

  // pressButton
  button?: "back" | "home" | "menu" | "power" | "volume_up" | "volume_down" | "recent";
}

/** Thresholds used for gesture classification (dp units where applicable) */
export const GESTURE_THRESHOLDS = {
  TOUCH_SLOP_DP: 8,
  LONG_PRESS_MS: 400,
  TAP_TIMEOUT_MS: 100,
  DOUBLE_TAP_MS: 300,
  DOUBLE_TAP_SLOP_DP: 100,
  FLING_MIN_DP_PER_S: 50,
  PINCH_MIN_SCALE_DELTA: 0.1,
} as const;

// ---------------------------------------------------------------------------
// Interfaces for DI / testing in DualTrackRecorder
// ---------------------------------------------------------------------------

/**
 * Abstraction over GetEventReader for dependency injection in DualTrackRecorder.
 * Start receives the callback so the emitter can call it when a gesture occurs.
 */
export interface GestureEmitter {
  start(
    onGesture: (event: GestureEvent) => void,
    onError?: (err: Error) => void
  ): void;
  stop(): void;
}

/**
 * Minimal subset of CtrlProxyClient needed by DualTrackRecorder.
 */
export interface A11ySource {
  ensureConnected(): Promise<boolean>;
  onInteraction(
    listener: (event: { type: string; [key: string]: unknown }) => void
  ): () => void;
}
