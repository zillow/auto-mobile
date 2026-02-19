import { describe, test, expect, beforeEach } from "bun:test";
import { GestureClassifier } from "../../../../src/features/record/android/GestureClassifier";
import { GESTURE_THRESHOLDS } from "../../../../src/features/record/android/types";
import type { RawTouchFrame } from "../../../../src/features/record/android/types";
import type { CoordScaler } from "../../../../src/features/record/android/AxisRanges";

// Identity scaler: raw coords == screen coords
const identityScaler: CoordScaler = {
  toScreenX: (x: number) => x,
  toScreenY: (y: number) => y,
};

// density = 1.0 so dp thresholds equal pixel thresholds
const DENSITY = 1.0;

function makeFrame(
  arrivedAt: number,
  activeSlots: Array<{ slotId: number; trackingId: number; x: number; y: number }>,
  releasedSlots: number[] = []
): RawTouchFrame {
  return {
    arrivedAt,
    activeSlots: activeSlots.map(s => ({ ...s, pressure: 0 })),
    releasedSlots,
  };
}

describe("GestureClassifier", () => {
  let c: GestureClassifier;

  beforeEach(() => {
    c = new GestureClassifier(identityScaler, DENSITY);
  });

  // -------------------------------------------------------------------------
  // tap
  // -------------------------------------------------------------------------

  test("short low-displacement contact → tap", () => {
    // DOWN frame
    c.feedFrame(makeFrame(0, [{ slotId: 0, trackingId: 1, x: 500, y: 800 }]));
    // UP frame (within TAP_TIMEOUT and below slop)
    const result = c.feedFrame(makeFrame(50, [], [0]));
    expect(result?.type).toBe("tap");
    expect(result?.screenX).toBe(500);
    expect(result?.screenY).toBe(800);
  });

  test("tap duration exactly at LONG_PRESS_MS threshold is still a tap", () => {
    c.feedFrame(makeFrame(0, [{ slotId: 0, trackingId: 1, x: 200, y: 300 }]));
    const result = c.feedFrame(makeFrame(GESTURE_THRESHOLDS.LONG_PRESS_MS - 1, [], [0]));
    expect(result?.type).toBe("tap");
  });

  // -------------------------------------------------------------------------
  // longPress
  // -------------------------------------------------------------------------

  test("long low-displacement contact → longPress with durationMs", () => {
    c.feedFrame(makeFrame(0, [{ slotId: 0, trackingId: 1, x: 300, y: 400 }]));
    const result = c.feedFrame(makeFrame(GESTURE_THRESHOLDS.LONG_PRESS_MS, [], [0]));
    expect(result?.type).toBe("longPress");
    expect(result?.durationMs).toBe(GESTURE_THRESHOLDS.LONG_PRESS_MS);
    expect(result?.screenX).toBe(300);
    expect(result?.screenY).toBe(400);
  });

  test("very long press reports correct duration", () => {
    c.feedFrame(makeFrame(0, [{ slotId: 0, trackingId: 1, x: 100, y: 100 }]));
    const result = c.feedFrame(makeFrame(2000, [], [0]));
    expect(result?.type).toBe("longPress");
    expect(result?.durationMs).toBe(2000);
  });

  // -------------------------------------------------------------------------
  // doubleTap
  // -------------------------------------------------------------------------

  test("two taps at same location within DOUBLE_TAP_MS → doubleTap", () => {
    // First tap
    c.feedFrame(makeFrame(0, [{ slotId: 0, trackingId: 1, x: 500, y: 500 }]));
    const tap1 = c.feedFrame(makeFrame(50, [], [0]));
    expect(tap1?.type).toBe("tap");

    // Second tap soon after, same location
    c.feedFrame(makeFrame(100, [{ slotId: 0, trackingId: 2, x: 500, y: 500 }]));
    const result = c.feedFrame(makeFrame(150, [], [0]));
    expect(result?.type).toBe("doubleTap");
    expect(result?.screenX).toBe(500);
  });

  test("two taps too far apart in time → two separate taps", () => {
    c.feedFrame(makeFrame(0, [{ slotId: 0, trackingId: 1, x: 500, y: 500 }]));
    const tap1 = c.feedFrame(makeFrame(50, [], [0]));
    expect(tap1?.type).toBe("tap");

    c.feedFrame(makeFrame(GESTURE_THRESHOLDS.DOUBLE_TAP_MS + 500, [{ slotId: 0, trackingId: 2, x: 500, y: 500 }]));
    const tap2 = c.feedFrame(makeFrame(GESTURE_THRESHOLDS.DOUBLE_TAP_MS + 550, [], [0]));
    expect(tap2?.type).toBe("tap"); // NOT doubleTap
  });

  test("two taps too far apart in space → two separate taps", () => {
    c.feedFrame(makeFrame(0, [{ slotId: 0, trackingId: 1, x: 100, y: 100 }]));
    const tap1 = c.feedFrame(makeFrame(50, [], [0]));
    expect(tap1?.type).toBe("tap");

    // Second tap far away
    c.feedFrame(makeFrame(100, [{ slotId: 0, trackingId: 2, x: 900, y: 900 }]));
    const tap2 = c.feedFrame(makeFrame(150, [], [0]));
    expect(tap2?.type).toBe("tap");
  });

  // -------------------------------------------------------------------------
  // swipe
  // -------------------------------------------------------------------------

  test("high-displacement horizontal contact → swipe right", () => {
    c.feedFrame(makeFrame(0, [{ slotId: 0, trackingId: 1, x: 100, y: 500 }]));
    // Move finger right
    c.feedFrame(makeFrame(50, [{ slotId: 0, trackingId: 1, x: 600, y: 500 }]));
    const result = c.feedFrame(makeFrame(100, [], [0]));
    expect(result?.type).toBe("swipe");
    expect(result?.direction).toBe("right");
    expect(result?.startX).toBe(100);
    expect(result?.endX).toBe(600);
  });

  test("high-displacement contact leftward → swipe left", () => {
    c.feedFrame(makeFrame(0, [{ slotId: 0, trackingId: 1, x: 800, y: 500 }]));
    c.feedFrame(makeFrame(50, [{ slotId: 0, trackingId: 1, x: 200, y: 500 }]));
    const result = c.feedFrame(makeFrame(100, [], [0]));
    expect(result?.direction).toBe("left");
  });

  test("downward swipe → direction down", () => {
    c.feedFrame(makeFrame(0, [{ slotId: 0, trackingId: 1, x: 500, y: 100 }]));
    c.feedFrame(makeFrame(50, [{ slotId: 0, trackingId: 1, x: 500, y: 800 }]));
    const result = c.feedFrame(makeFrame(100, [], [0]));
    expect(result?.direction).toBe("down");
  });

  test("upward swipe → direction up", () => {
    c.feedFrame(makeFrame(0, [{ slotId: 0, trackingId: 1, x: 500, y: 900 }]));
    c.feedFrame(makeFrame(50, [{ slotId: 0, trackingId: 1, x: 500, y: 100 }]));
    const result = c.feedFrame(makeFrame(100, [], [0]));
    expect(result?.direction).toBe("up");
  });

  test("high-velocity swipe → speed fast", () => {
    // 1000px in 10ms = 100000px/s >> FLING threshold of 50dp/s (with density=1)
    c.feedFrame(makeFrame(0, [{ slotId: 0, trackingId: 1, x: 0, y: 500 }]));
    c.feedFrame(makeFrame(10, [{ slotId: 0, trackingId: 1, x: 1000, y: 500 }]));
    const result = c.feedFrame(makeFrame(10, [], [0]));
    expect(result?.speed).toBe("fast");
  });

  test("low-velocity swipe → speed normal", () => {
    // 100px in 10000ms = very slow
    c.feedFrame(makeFrame(0, [{ slotId: 0, trackingId: 1, x: 0, y: 500 }]));
    c.feedFrame(makeFrame(10000, [{ slotId: 0, trackingId: 1, x: 100, y: 500 }]));
    const result = c.feedFrame(makeFrame(10000, [], [0]));
    expect(result?.type).toBe("swipe");
    expect(result?.speed).toBe("normal");
  });

  // -------------------------------------------------------------------------
  // pinch
  // -------------------------------------------------------------------------

  test("two fingers diverging → pinch out", () => {
    // Initial: fingers close together (distance ~100px)
    c.feedFrame(makeFrame(0, [
      { slotId: 0, trackingId: 1, x: 450, y: 500 },
      { slotId: 1, trackingId: 2, x: 550, y: 500 },
    ]));

    // Move apart (distance ~400px)
    c.feedFrame(makeFrame(100, [
      { slotId: 0, trackingId: 1, x: 300, y: 500 },
      { slotId: 1, trackingId: 2, x: 700, y: 500 },
    ]));

    // Both fingers lift
    const result = c.feedFrame(makeFrame(200, [], [0, 1]));
    expect(result?.type).toBe("pinch");
    expect(result?.pinchDirection).toBe("out");
    expect(result?.scale).toBeGreaterThan(1);
  });

  test("two fingers converging → pinch in", () => {
    // Initial: fingers far apart (~400px)
    c.feedFrame(makeFrame(0, [
      { slotId: 0, trackingId: 1, x: 300, y: 500 },
      { slotId: 1, trackingId: 2, x: 700, y: 500 },
    ]));

    // Move together (~100px)
    c.feedFrame(makeFrame(100, [
      { slotId: 0, trackingId: 1, x: 450, y: 500 },
      { slotId: 1, trackingId: 2, x: 550, y: 500 },
    ]));

    const result = c.feedFrame(makeFrame(200, [], [0, 1]));
    expect(result?.type).toBe("pinch");
    expect(result?.pinchDirection).toBe("in");
    expect(result?.scale).toBeLessThan(1);
  });

  test("two-finger scale change < PINCH_MIN_SCALE_DELTA → no pinch emitted", () => {
    // Barely any movement: distance 100 → 105 (scale ~1.05 < 1.1 threshold)
    c.feedFrame(makeFrame(0, [
      { slotId: 0, trackingId: 1, x: 450, y: 500 },
      { slotId: 1, trackingId: 2, x: 550, y: 500 },
    ]));
    c.feedFrame(makeFrame(100, [
      { slotId: 0, trackingId: 1, x: 448, y: 500 },
      { slotId: 1, trackingId: 2, x: 553, y: 500 },
    ]));

    const result = c.feedFrame(makeFrame(200, [], [0, 1]));
    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  test("returns null for intermediate frames with no release", () => {
    c.feedFrame(makeFrame(0, [{ slotId: 0, trackingId: 1, x: 100, y: 100 }]));
    const result = c.feedFrame(makeFrame(50, [{ slotId: 0, trackingId: 1, x: 110, y: 100 }]));
    expect(result).toBeNull();
  });

  test("DOWN frame alone returns null", () => {
    const result = c.feedFrame(makeFrame(0, [{ slotId: 0, trackingId: 1, x: 500, y: 500 }]));
    expect(result).toBeNull();
  });
});
