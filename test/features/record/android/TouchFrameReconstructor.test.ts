import { describe, test, expect, beforeEach } from "bun:test";
import { TouchFrameReconstructor } from "../../../../src/features/record/android/TouchFrameReconstructor";
import type { RawTouchFrame, GestureEvent } from "../../../../src/features/record/android/types";

// Helper: feed multiple lines and collect all non-null results
function feedLines(
  r: TouchFrameReconstructor,
  lines: string[]
): Array<RawTouchFrame | GestureEvent> {
  const results: Array<RawTouchFrame | GestureEvent> = [];
  let t = 1000;
  for (const line of lines) {
    const result = r.feedLine(line, t++);
    if (result) {results.push(result);}
  }
  return results;
}

function isFrame(x: RawTouchFrame | GestureEvent): x is RawTouchFrame {
  return "activeSlots" in x;
}

// ---------------------------------------------------------------------------
// Test fixtures — realistic getevent -lt output
// ---------------------------------------------------------------------------

const SINGLE_FINGER_DOWN = [
  "[  1.000000] EV_ABS    ABS_MT_TRACKING_ID   00000001",
  "[  1.000001] EV_ABS    ABS_MT_POSITION_X    000001a4",
  "[  1.000002] EV_ABS    ABS_MT_POSITION_Y    000002b0",
  "[  1.000003] EV_KEY    BTN_TOUCH            DOWN",
  "[  1.000004] EV_SYN    SYN_REPORT           00000000",
];

const SINGLE_FINGER_UP = [
  "[  1.100000] EV_ABS    ABS_MT_TRACKING_ID   ffffffff",
  "[  1.100001] EV_KEY    BTN_TOUCH            UP",
  "[  1.100002] EV_SYN    SYN_REPORT           00000000",
];

const TWO_FINGER_DOWN = [
  // Slot 0 down
  "[  2.000000] EV_ABS    ABS_MT_SLOT          00000000",
  "[  2.000001] EV_ABS    ABS_MT_TRACKING_ID   00000001",
  "[  2.000002] EV_ABS    ABS_MT_POSITION_X    00000100",
  "[  2.000003] EV_ABS    ABS_MT_POSITION_Y    00000200",
  // Slot 1 down
  "[  2.000004] EV_ABS    ABS_MT_SLOT          00000001",
  "[  2.000005] EV_ABS    ABS_MT_TRACKING_ID   00000002",
  "[  2.000006] EV_ABS    ABS_MT_POSITION_X    00000300",
  "[  2.000007] EV_ABS    ABS_MT_POSITION_Y    00000400",
  "[  2.000008] EV_SYN    SYN_REPORT           00000000",
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TouchFrameReconstructor", () => {
  let r: TouchFrameReconstructor;

  beforeEach(() => {
    r = new TouchFrameReconstructor();
  });

  test("single finger tap produces two frames (DOWN then UP)", () => {
    const results = feedLines(r, [...SINGLE_FINGER_DOWN, ...SINGLE_FINGER_UP]);
    const frames = results.filter(isFrame);
    expect(frames).toHaveLength(2);

    const downFrame = frames[0];
    expect(downFrame.activeSlots).toHaveLength(1);
    expect(downFrame.releasedSlots).toHaveLength(0);
    expect(downFrame.activeSlots[0].x).toBe(0x1a4);
    expect(downFrame.activeSlots[0].y).toBe(0x2b0);
    expect(downFrame.activeSlots[0].trackingId).toBe(1);

    const upFrame = frames[1];
    expect(upFrame.activeSlots).toHaveLength(0);
    expect(upFrame.releasedSlots).toContain(0);
  });

  test("slot with trackingId ffffffff is not included in activeSlots", () => {
    feedLines(r, SINGLE_FINGER_DOWN);
    const results = feedLines(r, SINGLE_FINGER_UP);
    const frames = results.filter(isFrame);
    expect(frames[0].activeSlots).toHaveLength(0);
    expect(frames[0].releasedSlots).toContain(0);
  });

  test("two-finger down frame has two active slots with correct positions", () => {
    const results = feedLines(r, TWO_FINGER_DOWN);
    const frames = results.filter(isFrame);
    expect(frames).toHaveLength(1);
    const frame = frames[0];
    expect(frame.activeSlots).toHaveLength(2);

    const slot0 = frame.activeSlots.find(s => s.slotId === 0);
    const slot1 = frame.activeSlots.find(s => s.slotId === 1);
    expect(slot0?.x).toBe(0x100);
    expect(slot0?.y).toBe(0x200);
    expect(slot1?.x).toBe(0x300);
    expect(slot1?.y).toBe(0x400);
  });

  test("EV_KEY KEY_BACK DOWN emits pressButton gesture event", () => {
    const results = feedLines(r, [
      "[  5.000000] EV_KEY    KEY_BACK             DOWN",
    ]);
    expect(results).toHaveLength(1);
    const event = results[0];
    expect(isFrame(event)).toBe(false);
    expect((event as GestureEvent).type).toBe("pressButton");
    expect((event as GestureEvent).button).toBe("back");
  });

  test("EV_KEY KEY_HOME DOWN emits pressButton with button=home", () => {
    const results = feedLines(r, ["[  5.000000] EV_KEY    KEY_HOME             DOWN"]);
    expect((results[0] as GestureEvent).button).toBe("home");
  });

  test("EV_KEY KEY_VOLUMEUP DOWN emits pressButton with button=volume_up", () => {
    const results = feedLines(r, ["[  5.000000] EV_KEY    KEY_VOLUMEUP         DOWN"]);
    expect((results[0] as GestureEvent).button).toBe("volume_up");
  });

  test("EV_KEY UP events are ignored", () => {
    const results = feedLines(r, ["[  5.000000] EV_KEY    KEY_BACK             UP"]);
    expect(results).toHaveLength(0);
  });

  test("Protocol A SYN_MT_REPORT (value 00000002) lines are ignored", () => {
    const results = feedLines(r, [
      "[  1.000000] EV_ABS    ABS_MT_TRACKING_ID   00000001",
      "[  1.000001] EV_SYN    SYN_MT_REPORT        00000002",
    ]);
    expect(results).toHaveLength(0);
  });

  test("SYN_REPORT emits frame with arrivedAt equal to feedLine timestamp", () => {
    r.feedLine("[  1.000000] EV_ABS    ABS_MT_TRACKING_ID   00000001", 1000);
    r.feedLine("[  1.000001] EV_ABS    ABS_MT_POSITION_X    00000064", 1001);
    const frame = r.feedLine("[  1.000002] EV_SYN    SYN_REPORT           00000000", 1234);
    expect(frame).not.toBeNull();
    expect(isFrame(frame!)).toBe(true);
    expect((frame as RawTouchFrame).arrivedAt).toBe(1234);
  });

  test("multiple SYN_REPORT frames maintain independent slot state", () => {
    // Frame 1: slot 0 at x=100
    r.feedLine("[  1.000000] EV_ABS    ABS_MT_TRACKING_ID   00000001", 100);
    r.feedLine("[  1.000001] EV_ABS    ABS_MT_POSITION_X    00000064", 101);
    r.feedLine("[  1.000002] EV_ABS    ABS_MT_POSITION_Y    000000c8", 102);
    const frame1 = r.feedLine("[  1.000003] EV_SYN    SYN_REPORT           00000000", 103);

    // Frame 2: x moves to 200
    r.feedLine("[  1.016000] EV_ABS    ABS_MT_POSITION_X    000000c8", 116);
    const frame2 = r.feedLine("[  1.016001] EV_SYN    SYN_REPORT           00000000", 117);

    expect(isFrame(frame1!)).toBe(true);
    expect(isFrame(frame2!)).toBe(true);
    expect((frame1 as RawTouchFrame).activeSlots[0].x).toBe(0x64);
    expect((frame2 as RawTouchFrame).activeSlots[0].x).toBe(0xc8);
  });

  test("unrecognised event lines return null", () => {
    const result = r.feedLine("some garbage line", 1000);
    expect(result).toBeNull();
    const result2 = r.feedLine("[  1.0] EV_ABS    ABS_UNKNOWN    00000000", 1001);
    expect(result2).toBeNull();
  });

  test("pressure is parsed for ABS_MT_PRESSURE events", () => {
    r.feedLine("[  1.000000] EV_ABS    ABS_MT_TRACKING_ID   00000001", 100);
    r.feedLine("[  1.000001] EV_ABS    ABS_MT_POSITION_X    00000064", 101);
    r.feedLine("[  1.000002] EV_ABS    ABS_MT_POSITION_Y    000000c8", 102);
    r.feedLine("[  1.000003] EV_ABS    ABS_MT_PRESSURE      00000064", 103);
    const frame = r.feedLine("[  1.000004] EV_SYN    SYN_REPORT           00000000", 104);
    expect(isFrame(frame!)).toBe(true);
    expect((frame as RawTouchFrame).activeSlots[0].pressure).toBe(100);
  });
});
