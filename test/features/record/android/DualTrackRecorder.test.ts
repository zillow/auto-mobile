import { describe, test, expect, beforeEach } from "bun:test";
import { DualTrackRecorder, MERGE_WINDOW_MS } from "../../../../src/features/record/android/DualTrackRecorder";
import type { GestureEmitter, GestureEvent, A11ySource } from "../../../../src/features/record/android/types";
import type { BootedDevice } from "../../../../src/models";
import { FakeTimer } from "../../../fakes/FakeTimer";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

type InteractionListener = (event: { type: string; [key: string]: unknown }) => void;

class FakeGestureEmitter implements GestureEmitter {
  private onGestureHandler?: (event: GestureEvent) => void;

  start(
    onGesture: (event: GestureEvent) => void,
    _onError?: (err: Error) => void
  ): void {
    this.onGestureHandler = onGesture;
  }

  stop(): void {
    this.onGestureHandler = undefined;
  }

  emit(event: GestureEvent): void {
    this.onGestureHandler?.(event);
  }
}

class FakeA11ySource implements A11ySource {
  private listener?: InteractionListener;

  async ensureConnected(): Promise<boolean> {
    return true;
  }

  onInteraction(listener: InteractionListener): () => void {
    this.listener = listener;
    return () => {
      this.listener = undefined;
    };
  }

  emit(event: { type: string; [key: string]: unknown }): void {
    this.listener?.(event);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fakeDevice: BootedDevice = {
  deviceId: "emulator-5554",
  name: "Test Device",
  platform: "android",
};

const TAP_ELEMENT = {
  "resource-id": "com.example:id/login_btn",
  "bounds": { left: 300, top: 860, right: 400, bottom: 920 },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DualTrackRecorder", () => {
  let fakeGestures: FakeGestureEmitter;
  let fakeA11y: FakeA11ySource;
  let fakeTimer: FakeTimer;
  let recorder: DualTrackRecorder;

  beforeEach(() => {
    fakeGestures = new FakeGestureEmitter();
    fakeA11y = new FakeA11ySource();
    fakeTimer = new FakeTimer();
    fakeTimer.enableAutoAdvance();
    recorder = new DualTrackRecorder(fakeDevice, fakeGestures, fakeA11y, fakeTimer);
  });

  test("tap gesture + matching A11y element → tapOn step", async () => {
    await recorder.start();

    fakeGestures.emit({ type: "tap", arrivedAt: Date.now(), screenX: 342, screenY: 891 });
    fakeA11y.emit({ type: "tap", timestamp: Date.now(), element: TAP_ELEMENT });

    await new Promise<void>(r => setImmediate(r));
    const { steps } = await recorder.stop();

    expect(steps).toHaveLength(1);
    expect(steps[0].tool).toBe("tapOn");
    expect(steps[0].params.action).toBe("tap");
    expect(steps[0].params.elementId).toBe("com.example:id/login_btn");
  });

  test("doubleTap gesture + matching A11y element → tapOn doubleTap step", async () => {
    await recorder.start();

    fakeGestures.emit({ type: "doubleTap", arrivedAt: Date.now(), screenX: 342, screenY: 891 });
    fakeA11y.emit({ type: "tap", timestamp: Date.now(), element: TAP_ELEMENT });

    await new Promise<void>(r => setImmediate(r));
    const { steps } = await recorder.stop();

    expect(steps[0].tool).toBe("tapOn");
    expect(steps[0].params.action).toBe("doubleTap");
  });

  test("longPress gesture + matching A11y element → tapOn longPress step", async () => {
    await recorder.start();

    fakeGestures.emit({ type: "longPress", arrivedAt: Date.now(), screenX: 342, screenY: 891 });
    fakeA11y.emit({ type: "longPress", timestamp: Date.now(), element: TAP_ELEMENT });

    await new Promise<void>(r => setImmediate(r));
    const { steps } = await recorder.stop();

    expect(steps[0].tool).toBe("tapOn");
    expect(steps[0].params.action).toBe("longPress");
  });

  test("swipe gesture with direction + A11y element → swipeOn step with direction", async () => {
    await recorder.start();

    fakeGestures.emit({
      type: "swipe",
      arrivedAt: Date.now(),
      direction: "up",
      startX: 500, startY: 800, endX: 500, endY: 200,
    });
    fakeA11y.emit({
      type: "swipe",
      timestamp: Date.now(),
      element: { "resource-id": "com.example:id/list", "bounds": { left: 0, top: 0, right: 1080, bottom: 1920 } },
      scrollDeltaX: 0,
      scrollDeltaY: 100,
    });

    await new Promise<void>(r => setImmediate(r));
    const { steps } = await recorder.stop();

    expect(steps[0].tool).toBe("swipeOn");
    // getevent direction takes precedence over A11y scrollDelta
    expect(steps[0].params.direction).toBe("up");
  });

  test("pinch emits pinchOn immediately without waiting for A11y", async () => {
    await recorder.start();

    fakeGestures.emit({ type: "pinch", arrivedAt: Date.now(), pinchDirection: "in", scale: 0.5 });

    const { steps } = await recorder.stop();

    expect(steps).toHaveLength(1);
    expect(steps[0].tool).toBe("pinchOn");
    expect(steps[0].params.direction).toBe("in");
    expect(steps[0].params.scale).toBe(0.5);
  });

  test("pressButton emits immediately without waiting for A11y", async () => {
    await recorder.start();

    fakeGestures.emit({ type: "pressButton", arrivedAt: Date.now(), button: "back" });

    const { steps } = await recorder.stop();

    expect(steps).toHaveLength(1);
    expect(steps[0].tool).toBe("pressButton");
    expect(steps[0].params.button).toBe("back");
  });

  test("inputText from A11y with no gesture match → inputText step", async () => {
    await recorder.start();

    fakeA11y.emit({
      type: "inputText",
      timestamp: Date.now(),
      text: "hello@example.com",
      element: { "resource-id": "com.example:id/email_field" },
    });

    const { steps } = await recorder.stop();

    expect(steps).toHaveLength(1);
    expect(steps[0].tool).toBe("inputText");
    expect(steps[0].params.text).toBe("hello@example.com");
  });

  test("consecutive inputText events on same element are coalesced", async () => {
    await recorder.start();

    const element = { "resource-id": "com.example:id/search", "bounds": { left: 0, top: 0, right: 500, bottom: 60 } };
    fakeA11y.emit({ type: "inputText", timestamp: 100, text: "h", element });
    fakeA11y.emit({ type: "inputText", timestamp: 200, text: "he", element });
    fakeA11y.emit({ type: "inputText", timestamp: 300, text: "hel", element });

    const { steps } = await recorder.stop();
    // Should be coalesced into a single step with the last text
    expect(steps).toHaveLength(1);
    expect(steps[0].params.text).toBe("hel");
  });

  test("buffered A11y event is rejected when gesture does not hit element bounds", async () => {
    await recorder.start();

    // A11y event arrives first (goes into buffer), then gesture arrives at a far-away coord
    fakeA11y.emit({ type: "tap", timestamp: Date.now(), element: TAP_ELEMENT });
    fakeGestures.emit({ type: "tap", arrivedAt: Date.now(), screenX: 10, screenY: 10 }); // far from TAP_ELEMENT bounds

    await new Promise<void>(r => setImmediate(r));
    const { steps } = await recorder.stop();

    // Step should be dropped: gesture coords don't hit element bounds even though types match
    expect(steps).toHaveLength(0);
  });

  test("buffered A11y event older than 2×MERGE_WINDOW_MS is pruned and not matched", async () => {
    // Advance fake timer to well past the staleness window so timestamp:0 is considered stale
    fakeTimer.setCurrentTime(MERGE_WINDOW_MS * 3);
    await recorder.start();

    // Emit A11y event with timestamp: 0 — very old relative to current fake time
    fakeA11y.emit({ type: "tap", timestamp: 0, element: TAP_ELEMENT });
    // Gesture arrives at the "current" fake time
    fakeGestures.emit({ type: "tap", arrivedAt: fakeTimer.now(), screenX: 342, screenY: 891 });

    await new Promise<void>(r => setImmediate(r));
    const { steps } = await recorder.stop();

    // Stale buffered event should be pruned; step dropped
    expect(steps).toHaveLength(0);
  });

  test("tap with no matching A11y element is skipped", async () => {
    await recorder.start();

    fakeGestures.emit({ type: "tap", arrivedAt: Date.now(), screenX: 50, screenY: 50 });
    // No A11y event emitted

    await new Promise<void>(r => setImmediate(r));
    const { steps } = await recorder.stop();

    // Step is dropped because no element identity
    expect(steps).toHaveLength(0);
  });

  test("inputText coalescing skipped when intervening step exists", async () => {
    await recorder.start();

    const element = { "resource-id": "com.example:id/search" };
    fakeA11y.emit({ type: "inputText", timestamp: 100, text: "hello", element });
    // Intervening tap
    fakeGestures.emit({ type: "pressButton", arrivedAt: Date.now(), button: "back" });
    // Second edit on the same field — must NOT coalesce with first
    fakeA11y.emit({ type: "inputText", timestamp: 200, text: "world", element });

    const { steps } = await recorder.stop();
    expect(steps).toHaveLength(3);
    expect(steps[0].tool).toBe("inputText");
    expect(steps[0].params.text).toBe("hello");
    expect(steps[1].tool).toBe("pressButton");
    expect(steps[2].tool).toBe("inputText");
    expect(steps[2].params.text).toBe("world");
  });

  test("windowChange A11y events are not emitted as steps", async () => {
    await recorder.start();

    fakeA11y.emit({ type: "windowChange", timestamp: Date.now(), packageName: "com.example" });
    // Also add a real step to ensure we're tracking correctly
    fakeGestures.emit({ type: "pressButton", arrivedAt: Date.now(), button: "home" });

    const { steps } = await recorder.stop();

    expect(steps).toHaveLength(1);
    expect(steps[0].tool).toBe("pressButton");
  });

  test("multiple independent gestures produce multiple steps", async () => {
    await recorder.start();

    fakeGestures.emit({ type: "pressButton", arrivedAt: Date.now(), button: "back" });
    fakeGestures.emit({ type: "pressButton", arrivedAt: Date.now(), button: "home" });

    const { steps } = await recorder.stop();

    expect(steps).toHaveLength(2);
    expect(steps[0].params.button).toBe("back");
    expect(steps[1].params.button).toBe("home");
  });

  test("stopTestRecording returns correct step count", async () => {
    await recorder.start();
    fakeGestures.emit({ type: "pressButton", arrivedAt: Date.now(), button: "back" });
    const { stepCount } = await recorder.stop();
    expect(stepCount).toBe(1);
  });

  test("A11y event with text element using content-desc falls back to text selector", async () => {
    await recorder.start();

    fakeGestures.emit({ type: "tap", arrivedAt: Date.now(), screenX: 250, screenY: 400 });
    fakeA11y.emit({
      type: "tap",
      timestamp: Date.now(),
      element: {
        "content-desc": "Sign in",
        "bounds": { left: 200, top: 380, right: 400, bottom: 420 },
      },
    });

    await new Promise<void>(r => setImmediate(r));
    const { steps } = await recorder.stop();

    expect(steps[0].tool).toBe("tapOn");
    expect(steps[0].params.text).toBe("Sign in");
    expect(steps[0].params.elementId).toBeUndefined();
  });
});
