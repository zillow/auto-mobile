import { beforeEach, describe, expect, test } from "bun:test";
import { SwipeOn } from "../../../src/features/action/SwipeOn";
import { ObserveResult } from "../../../src/models";
import { FakeAwaitIdle } from "../../fakes/FakeAwaitIdle";
import { FakeObserveScreen } from "../../fakes/FakeObserveScreen";
import { FakeGestureExecutor } from "../../fakes/FakeGestureExecutor";
import { FakeWindow } from "../../fakes/FakeWindow";

describe("SwipeOn autoTarget", () => {
  const device = { name: "test-device", platform: "android", deviceId: "device-1" } as const;
  let fakeObserveScreen: FakeObserveScreen;
  let fakeGesture: FakeGestureExecutor;
  let fakeAwaitIdle: FakeAwaitIdle;
  let fakeWindow: FakeWindow;

  const createObserveResult = (viewHierarchy: any): ObserveResult => ({
    timestamp: Date.now(),
    screenSize: { width: 1000, height: 2000 },
    systemInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    viewHierarchy
  });

  const createScrollableNode = (
    bounds: string,
    resourceId: string
  ) => ({
    $: {
      bounds,
      scrollable: "true",
      "resource-id": resourceId,
      class: "androidx.recyclerview.widget.RecyclerView"
    }
  });

  const createHierarchy = (nodes: any[]) => ({
    hierarchy: {
      node: nodes
    }
  });

  const createSwipeOn = () => {
    const swipeOn = new SwipeOn(device, null, null, null, {
      executeGesture: fakeGesture,
      observeScreen: fakeObserveScreen
    });
    (swipeOn as any).awaitIdle = fakeAwaitIdle;
    (swipeOn as any).window = fakeWindow;
    return swipeOn;
  };

  beforeEach(() => {
    fakeObserveScreen = new FakeObserveScreen();
    fakeGesture = new FakeGestureExecutor();
    fakeAwaitIdle = new FakeAwaitIdle();
    fakeWindow = new FakeWindow();
    fakeWindow.setCachedActiveWindow(null);
  });

  test("auto-targets the largest non-fullscreen scrollable when multiple exist", async () => {
    const hierarchy = createHierarchy([
      createScrollableNode("[0,0][1000,2000]", "root-scroll"),
      createScrollableNode("[0,200][1000,1800]", "list-scroll")
    ]);
    fakeObserveScreen.setObserveResult(createObserveResult(hierarchy));

    const swipeOn = createSwipeOn();
    const result = await swipeOn.execute({ direction: "up" });

    expect(result.success).toBe(true);
    expect(result.targetType).toBe("element");
    expect(result.element?.["resource-id"]).toBe("list-scroll");
    expect(result.warning || "").toContain("Auto-targeted scrollable container");
  });

  test("auto-targets the single scrollable that matches the swipe direction", async () => {
    const hierarchy = createHierarchy([
      createScrollableNode("[0,200][1000,1800]", "list-scroll")
    ]);
    fakeObserveScreen.setObserveResult(createObserveResult(hierarchy));

    const swipeOn = createSwipeOn();
    const result = await swipeOn.execute({ direction: "up" });

    expect(result.success).toBe(true);
    expect(result.targetType).toBe("element");
    expect(result.element?.["resource-id"]).toBe("list-scroll");
  });

  test("falls back to screen swipe when single scrollable does not match direction", async () => {
    const hierarchy = createHierarchy([
      createScrollableNode("[0,0][800,200]", "horizontal-scroll")
    ]);
    fakeObserveScreen.setObserveResult(createObserveResult(hierarchy));

    const swipeOn = createSwipeOn();
    const result = await swipeOn.execute({ direction: "up" });

    expect(result.success).toBe(true);
    expect(result.targetType).toBe("screen");
    expect(result.warning || "").toContain("none matched the swipe direction");
  });

  test("respects autoTarget=false and performs a screen swipe", async () => {
    const hierarchy = createHierarchy([
      createScrollableNode("[0,200][1000,1800]", "list-scroll")
    ]);
    fakeObserveScreen.setObserveResult(createObserveResult(hierarchy));

    const swipeOn = createSwipeOn();
    const result = await swipeOn.execute({ direction: "up", autoTarget: false });

    expect(result.success).toBe(true);
    expect(result.targetType).toBe("screen");
    expect(result.warning).toBeUndefined();
  });
});
