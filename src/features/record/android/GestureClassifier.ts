import type { RawTouchFrame, GestureEvent } from "./types";
import { GESTURE_THRESHOLDS } from "./types";
import type { CoordScaler } from "./AxisRanges";

interface ContactInfo {
  /** Raw sensor position when the finger first touched */
  startX: number;
  startY: number;
  arrivedAt: number;
  /** Last known raw sensor position (updated on each active frame) */
  lastX: number;
  lastY: number;
}

interface LastTap {
  screenX: number;
  screenY: number;
  arrivedAt: number;
}

interface PinchState {
  initialDist: number;
  /** Updated each frame while both fingers are active */
  finalDist: number;
}

/**
 * Classifies sequences of RawTouchFrame events into high-level GestureEvents.
 *
 * Single-finger gestures:
 *   - tap: short, low-displacement contact
 *   - doubleTap: two taps within DOUBLE_TAP_MS at the same location
 *   - longPress: long, low-displacement contact
 *   - swipe: high-displacement contact
 *
 * Two-finger gestures:
 *   - pinch: two contacts with significant scale change
 *
 * Feed frames in order. A GestureEvent is returned when a gesture completes
 * (on finger UP), otherwise null.
 */
export class GestureClassifier {
  /** Per-slot: start position + last known position */
  private contacts: Map<number, ContactInfo> = new Map();
  private lastTap: LastTap | null = null;
  private pinchState: PinchState | null = null;
  private inTwoFingerMode = false;

  /**
   * @param scaler converts raw sensor coordinates to logical screen pixels
   * @param densityDp dp multiplier (e.g. 420/160 = 2.625 for a 420dpi screen)
   */
  constructor(
    private readonly scaler: CoordScaler,
    private readonly densityDp: number
  ) {}

  /** Feed one frame. Returns a completed GestureEvent or null. */
  feedFrame(frame: RawTouchFrame): GestureEvent | null {
    // 1. Register new contacts and update last-known positions
    for (const slot of frame.activeSlots) {
      const existing = this.contacts.get(slot.slotId);
      if (existing) {
        existing.lastX = slot.x;
        existing.lastY = slot.y;
      } else {
        this.contacts.set(slot.slotId, {
          startX: slot.x,
          startY: slot.y,
          arrivedAt: frame.arrivedAt,
          lastX: slot.x,
          lastY: slot.y,
        });
      }
    }

    // 2. Update pinch state while 2 fingers are active
    const activeCount = frame.activeSlots.length;
    if (activeCount === 2) {
      this.inTwoFingerMode = true;
      const [a, b] = frame.activeSlots;
      const dist = this.screenDist(a.x, a.y, b.x, b.y);
      if (!this.pinchState) {
        this.pinchState = { initialDist: dist, finalDist: dist };
      } else {
        this.pinchState.finalDist = dist;
      }
    }

    // 3. Nothing released → nothing to emit
    if (frame.releasedSlots.length === 0) {return null;}

    // 4. Handle pinch completion
    if (this.inTwoFingerMode && this.pinchState) {
      // One or both fingers just lifted
      const result = this.maybeEmitPinch(frame.arrivedAt);
      // Clean up released contacts
      for (const slotId of frame.releasedSlots) {
        this.contacts.delete(slotId);
      }
      // If all fingers are now up, exit two-finger mode
      if (activeCount === 0) {
        this.inTwoFingerMode = false;
        this.pinchState = null;
      }
      return result;
    }

    // 5. Single-finger gesture: exactly 1 slot released, 0 remaining
    if (
      !this.inTwoFingerMode &&
      frame.releasedSlots.length === 1 &&
      activeCount === 0
    ) {
      const slotId = frame.releasedSlots[0];
      const contact = this.contacts.get(slotId);
      this.contacts.delete(slotId);
      if (!contact) {return null;}

      const downX = this.scaler.toScreenX(contact.startX);
      const downY = this.scaler.toScreenY(contact.startY);
      const upX = this.scaler.toScreenX(contact.lastX);
      const upY = this.scaler.toScreenY(contact.lastY);
      const durationMs = frame.arrivedAt - contact.arrivedAt;
      const displacement = dist(downX, downY, upX, upY);
      const slopPx = GESTURE_THRESHOLDS.TOUCH_SLOP_DP * this.densityDp;

      if (displacement < slopPx) {
        return this.evaluateTapOrLongPress(downX, downY, durationMs, frame.arrivedAt);
      }
      return this.evaluateSwipe(downX, downY, upX, upY, durationMs, frame.arrivedAt);
    }

    // Clean up released contacts in other cases
    for (const slotId of frame.releasedSlots) {
      this.contacts.delete(slotId);
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private screenDist(rawX1: number, rawY1: number, rawX2: number, rawY2: number): number {
    return dist(
      this.scaler.toScreenX(rawX1),
      this.scaler.toScreenY(rawY1),
      this.scaler.toScreenX(rawX2),
      this.scaler.toScreenY(rawY2)
    );
  }

  private maybeEmitPinch(arrivedAt: number): GestureEvent | null {
    const pinch = this.pinchState;
    if (!pinch || pinch.initialDist === 0) {return null;}

    const scale = pinch.finalDist / pinch.initialDist;
    if (Math.abs(scale - 1.0) < GESTURE_THRESHOLDS.PINCH_MIN_SCALE_DELTA) {return null;}

    return {
      type: "pinch",
      arrivedAt,
      scale,
      pinchDirection: scale < 1 ? "in" : "out",
    };
  }

  private evaluateTapOrLongPress(
    screenX: number,
    screenY: number,
    durationMs: number,
    arrivedAt: number
  ): GestureEvent {
    if (durationMs >= GESTURE_THRESHOLDS.LONG_PRESS_MS) {
      return { type: "longPress", arrivedAt, screenX, screenY, durationMs };
    }

    // Check for double-tap
    if (this.lastTap) {
      const timeSinceLast = arrivedAt - this.lastTap.arrivedAt;
      const separation = dist(screenX, screenY, this.lastTap.screenX, this.lastTap.screenY);
      const slopPx = GESTURE_THRESHOLDS.DOUBLE_TAP_SLOP_DP * this.densityDp;

      if (
        timeSinceLast <= GESTURE_THRESHOLDS.DOUBLE_TAP_MS &&
        separation <= slopPx
      ) {
        this.lastTap = null;
        return { type: "doubleTap", arrivedAt, screenX, screenY };
      }
    }

    this.lastTap = { screenX, screenY, arrivedAt };
    return { type: "tap", arrivedAt, screenX, screenY };
  }

  private evaluateSwipe(
    downX: number,
    downY: number,
    upX: number,
    upY: number,
    durationMs: number,
    arrivedAt: number
  ): GestureEvent {
    const dx = upX - downX;
    const dy = upY - downY;
    const displacement = dist(downX, downY, upX, upY);

    const direction: GestureEvent["direction"] =
      Math.abs(dx) >= Math.abs(dy)
        ? dx > 0
          ? "right"
          : "left"
        : dy > 0
          ? "down"
          : "up";

    const velocityPxPerSec = durationMs > 0 ? (displacement / durationMs) * 1000 : 0;
    const flingThreshPx = GESTURE_THRESHOLDS.FLING_MIN_DP_PER_S * this.densityDp;
    const speed: GestureEvent["speed"] = velocityPxPerSec >= flingThreshPx ? "fast" : "normal";

    return {
      type: "swipe",
      arrivedAt,
      direction,
      startX: downX,
      startY: downY,
      endX: upX,
      endY: upY,
      speed,
    };
  }
}

function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}
