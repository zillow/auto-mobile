import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { SwipeOn } from "../../../src/features/action/SwipeOn";
import { ObserveResult } from "../../../src/models";
import { AccessibilityServiceClient } from "../../../src/features/observe/AccessibilityServiceClient";
import { FakeAwaitIdle } from "../../fakes/FakeAwaitIdle";
import { FakeAccessibilityDetector } from "../../fakes/FakeAccessibilityDetector";
import { FakeObserveScreen } from "../../fakes/FakeObserveScreen";
import { FakeGestureExecutor } from "../../fakes/FakeGestureExecutor";
import { FakeWindow } from "../../fakes/FakeWindow";

describe("SwipeOn autoTarget", () => {
  const device = { name: "test-device", platform: "android", deviceId: "device-1" } as const;
  let fakeObserveScreen: FakeObserveScreen;
  let fakeGesture: FakeGestureExecutor;
  let fakeAwaitIdle: FakeAwaitIdle;
  let fakeWindow: FakeWindow;
  let fakeAccessibilityDetector: FakeAccessibilityDetector;
  let getInstanceSpy: ReturnType<typeof spyOn> | null = null;

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
      "scrollable": "true",
      "resource-id": resourceId,
      "class": "androidx.recyclerview.widget.RecyclerView"
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
      observeScreen: fakeObserveScreen,
      accessibilityDetector: fakeAccessibilityDetector
    });
    (swipeOn as any).awaitIdle = fakeAwaitIdle;
    (swipeOn as any).window = fakeWindow;
    return swipeOn;
  };

  beforeEach(() => {
    fakeAccessibilityDetector = new FakeAccessibilityDetector();
    fakeAccessibilityDetector.setTalkBackEnabled(false);
    getInstanceSpy = spyOn(AccessibilityServiceClient, "getInstance").mockReturnValue({} as AccessibilityServiceClient);
    fakeObserveScreen = new FakeObserveScreen();
    fakeGesture = new FakeGestureExecutor();
    fakeAwaitIdle = new FakeAwaitIdle();
    fakeWindow = new FakeWindow();
    fakeWindow.setCachedActiveWindow(null);
  });

  afterEach(() => {
    getInstanceSpy?.mockRestore();
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

describe("SwipeOn container overlays", () => {
  const device = { name: "test-device", platform: "android", deviceId: "device-1" } as const;
  let fakeObserveScreen: FakeObserveScreen;
  let fakeGesture: FakeGestureExecutor;
  let fakeAwaitIdle: FakeAwaitIdle;
  let fakeWindow: FakeWindow;
  let fakeAccessibilityDetector: FakeAccessibilityDetector;
  let getInstanceSpy: ReturnType<typeof spyOn> | null = null;

  const createObserveResult = (viewHierarchy: any): ObserveResult => ({
    timestamp: Date.now(),
    screenSize: { width: 1000, height: 2000 },
    systemInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    viewHierarchy
  });

  const createHierarchy = (nodes: any[]) => ({
    hierarchy: {
      node: nodes
    }
  });

  const createNode = (bounds: string, attributes: Record<string, string>) => ({
    $: {
      bounds,
      ...attributes
    }
  });

  const createContainerNode = (bounds: string, resourceId: string, children: any[] = []) => ({
    $: {
      bounds,
      "resource-id": resourceId,
      "scrollable": "true"
    },
    node: children
  });

  const createSwipeOn = () => {
    const swipeOn = new SwipeOn(device, null, null, null, {
      executeGesture: fakeGesture,
      observeScreen: fakeObserveScreen,
      accessibilityDetector: fakeAccessibilityDetector
    });
    (swipeOn as any).awaitIdle = fakeAwaitIdle;
    (swipeOn as any).window = fakeWindow;
    return swipeOn;
  };

  beforeEach(() => {
    fakeAccessibilityDetector = new FakeAccessibilityDetector();
    fakeAccessibilityDetector.setTalkBackEnabled(false);
    getInstanceSpy = spyOn(AccessibilityServiceClient, "getInstance").mockReturnValue({} as AccessibilityServiceClient);
    fakeObserveScreen = new FakeObserveScreen();
    fakeGesture = new FakeGestureExecutor();
    fakeAwaitIdle = new FakeAwaitIdle();
    fakeWindow = new FakeWindow();
    fakeWindow.setCachedActiveWindow(null);
  });

  afterEach(() => {
    getInstanceSpy?.mockRestore();
  });

  test("avoids clickable overlays outside the container subtree", async () => {
    const containerNode = createContainerNode("[0,0][1000,2000]", "map-container");
    const overlayTop = createNode("[0,0][1000,200]", {
      "resource-id": "search-bar",
      "clickable": "true"
    });
    const overlayCenter = createNode("[400,0][600,2000]", {
      "resource-id": "overlay-strip",
      "clickable": "true"
    });

    const hierarchy = createHierarchy([containerNode, overlayTop, overlayCenter]);
    fakeObserveScreen.setObserveResult(createObserveResult(hierarchy));

    const swipeOn = createSwipeOn();
    const result = await swipeOn.execute({
      direction: "down",
      container: { elementId: "map-container" }
    });

    expect(result.success).toBe(true);
    const [call] = fakeGesture.getSwipeCalls();
    expect(call).toBeDefined();
    expect(call.x1).toBe(call.x2);
    expect(call.x1 < 400 || call.x1 > 600).toBe(true);
    expect(call.y1).toBeGreaterThan(0);
  });

  test("considers clickable elements inside the container subtree", async () => {
    const childOverlay = createNode("[0,0][1000,200]", {
      "resource-id": "child-overlay",
      "clickable": "true"
    });
    const containerNode = createContainerNode("[0,0][1000,2000]", "list-container", [childOverlay]);

    const hierarchy = createHierarchy([containerNode]);
    fakeObserveScreen.setObserveResult(createObserveResult(hierarchy));

    const swipeOn = createSwipeOn();
    const result = await swipeOn.execute({
      direction: "down",
      container: { elementId: "list-container" }
    });

    expect(result.success).toBe(true);
    const [call] = fakeGesture.getSwipeCalls();
    expect(call).toBeDefined();
    expect(call.y1).toBeGreaterThanOrEqual(200);
  });

  test("prefers topmost smaller overlay when it overlaps a larger one", async () => {
    const containerNode = createContainerNode("[0,0][1000,2000]", "map-container");
    const overlayLarge = createNode("[0,0][1000,400]", {
      "resource-id": "large-overlay",
      "clickable": "true"
    });
    const overlaySmall = createNode("[0,0][1000,200]", {
      "resource-id": "small-overlay",
      "clickable": "true"
    });

    const hierarchy = createHierarchy([containerNode, overlayLarge, overlaySmall]);
    fakeObserveScreen.setObserveResult(createObserveResult(hierarchy));

    const swipeOn = createSwipeOn();
    const result = await swipeOn.execute({
      direction: "down",
      container: { elementId: "map-container" }
    });

    expect(result.success).toBe(true);
    const [call] = fakeGesture.getSwipeCalls();
    expect(call).toBeDefined();
    expect(call.y1).toBeGreaterThanOrEqual(200);
  });
});
