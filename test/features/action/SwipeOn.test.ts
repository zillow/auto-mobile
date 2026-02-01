import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { SwipeOn } from "../../../src/features/action/SwipeOn";
import { ObserveResult } from "../../../src/models";
import { AccessibilityServiceClient } from "../../../src/features/observe/AccessibilityServiceClient";
import { FakeAwaitIdle } from "../../fakes/FakeAwaitIdle";
import { FakeAccessibilityDetector } from "../../fakes/FakeAccessibilityDetector";
import { FakeObserveScreen } from "../../fakes/FakeObserveScreen";
import { FakeGestureExecutor } from "../../fakes/FakeGestureExecutor";
import { FakeWindow } from "../../fakes/FakeWindow";
import { FakeTimer } from "../../fakes/FakeTimer";

describe("SwipeOn autoTarget", () => {
  const device = { name: "test-device", platform: "android", deviceId: "device-1" } as const;
  let fakeObserveScreen: FakeObserveScreen;
  let fakeGesture: FakeGestureExecutor;
  let fakeAwaitIdle: FakeAwaitIdle;
  let fakeWindow: FakeWindow;
  let fakeTimer: FakeTimer;
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
    const swipeOn = new SwipeOn(device, {} as any, {
      executeGesture: fakeGesture,
      observeScreen: fakeObserveScreen,
      accessibilityDetector: fakeAccessibilityDetector
    });
    (swipeOn as any).awaitIdle = fakeAwaitIdle;
    (swipeOn as any).window = fakeWindow;
    (swipeOn as any).timer = fakeTimer;
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
    fakeTimer = new FakeTimer();
    fakeTimer.enableAutoAdvance();
    fakeWindow.configureCachedActiveWindow(null);
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
  let fakeTimer: FakeTimer;
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
    const swipeOn = new SwipeOn(device, {} as any, {
      executeGesture: fakeGesture,
      observeScreen: fakeObserveScreen,
      accessibilityDetector: fakeAccessibilityDetector
    });
    (swipeOn as any).awaitIdle = fakeAwaitIdle;
    (swipeOn as any).window = fakeWindow;
    (swipeOn as any).timer = fakeTimer;
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
    fakeTimer = new FakeTimer();
    fakeTimer.enableAutoAdvance();
    fakeWindow.configureCachedActiveWindow(null);
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

  test("ignores clickable elements inside the container subtree", async () => {
    const childOverlay = createNode("[0,0][1000,800]", {
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
    expect(result.warning).toBeUndefined();
    const [call] = fakeGesture.getSwipeCalls();
    expect(call).toBeDefined();
    expect(call.x1).toBe(500);
    expect(call.y1).toBe(200);
  });

  test("keeps the larger overlay when overlap is partial", async () => {
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
    expect(call.y1).toBeGreaterThan(400);
  });

  test("avoids all overlapping clickable elements when multiple exist", async () => {
    const containerNode = createContainerNode("[0,0][1000,2000]", "map-container");
    const overlayLarge = createNode("[0,0][1000,1000]", {
      "resource-id": "large-overlay",
      "clickable": "true"
    });
    const overlaySmall = createNode("[0,0][1000,900]", {
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
    // Should start after the largest overlay (1000px) plus padding
    expect(call.y1).toBeGreaterThan(1000);
  });

  test("handles complex scenarios like Google Maps with multiple overlays", async () => {
    // Simulate Google Maps layout with multiple overlays
    const containerNode = createContainerNode("[0,0][1080,2400]", "com.google.android.apps.maps:id/fullscreens_group");

    // Search bar at top
    const searchBar = createNode("[0,0][1080,226]", {
      "resource-id": "com.google.android.apps.maps:id/search_omnibox_container",
      "clickable": "true"
    });

    // Category chips below search bar
    const categoryChips = createNode("[31,226][1080,352]", {
      "resource-id": "com.google.android.apps.maps:id/recycler_view",
      "clickable": "true"
    });

    // Bottom controls
    const locationButton = createNode("[881,1886][1080,2072]", {
      "resource-id": "com.google.android.apps.maps:id/mylocation_button",
      "clickable": "true"
    });

    const streetViewThumb = createNode("[36,1907][272,2049]", {
      "resource-id": "com.google.android.apps.maps:id/street_view_thumbnail",
      "clickable": "true"
    });

    const layersButton = createNode("[928,378][1080,520]", {
      "resource-id": "com.google.android.apps.maps:id/layers_fab",
      "clickable": "true"
    });

    const hierarchy = createHierarchy([
      containerNode,
      searchBar,
      categoryChips,
      locationButton,
      streetViewThumb,
      layersButton
    ]);
    fakeObserveScreen.setObserveResult(createObserveResult(hierarchy));

    const swipeOn = createSwipeOn();
    const result = await swipeOn.execute({
      direction: "down",
      container: { elementId: "com.google.android.apps.maps:id/fullscreens_group" }
    });

    expect(result.success).toBe(true);
    const [call] = fakeGesture.getSwipeCalls();
    expect(call).toBeDefined();

    // Should start below the category chips (352px) plus padding
    expect(call.y1).toBeGreaterThan(352);

    // The swipe should be vertical (same x coordinate)
    expect(call.x1).toBe(call.x2);

    // X coordinate should avoid overlays:
    // - Not in streetViewThumb range [36-272]
    // - Not in locationButton range [881-1080]
    // - Not in layersButton range [928-1080]
    // So it should be in the safe middle zone [272-881]
    expect(call.x1).toBeGreaterThan(272);
    expect(call.x1).toBeLessThan(881);

    // Swipe should have reasonable distance (at least 500px for "down" direction)
    const swipeDistance = Math.abs(call.y2 - call.y1);
    expect(swipeDistance).toBeGreaterThan(500);
  });

  test("uses default bounds when no overlays are present", async () => {
    const containerNode = createContainerNode("[0,0][1000,2000]", "container-no-overlays");

    const hierarchy = createHierarchy([containerNode]);
    fakeObserveScreen.setObserveResult(createObserveResult(hierarchy));

    const swipeOn = createSwipeOn();
    const result = await swipeOn.execute({
      direction: "down",
      container: { elementId: "container-no-overlays" }
    });

    expect(result.success).toBe(true);
    expect(result.warning).toBeUndefined();
    const [call] = fakeGesture.getSwipeCalls();
    expect(call).toBeDefined();
    // Should use center x coordinate (500) since no overlays
    expect(call.x1).toBe(500);
  });

  test("handles horizontal swipes with overlays on top and bottom", async () => {
    const containerNode = createContainerNode("[0,0][1000,2000]", "horizontal-container");
    const topOverlay = createNode("[0,0][1000,300]", {
      "resource-id": "top-bar",
      "clickable": "true"
    });
    const bottomOverlay = createNode("[0,1700][1000,2000]", {
      "resource-id": "bottom-bar",
      "clickable": "true"
    });

    const hierarchy = createHierarchy([containerNode, topOverlay, bottomOverlay]);
    fakeObserveScreen.setObserveResult(createObserveResult(hierarchy));

    const swipeOn = createSwipeOn();
    const result = await swipeOn.execute({
      direction: "left",
      container: { elementId: "horizontal-container" }
    });

    expect(result.success).toBe(true);
    const [call] = fakeGesture.getSwipeCalls();
    expect(call).toBeDefined();
    // Y should be in safe zone between overlays
    expect(call.y1).toBeGreaterThan(300);
    expect(call.y1).toBeLessThan(1700);
    expect(call.y1).toBe(call.y2); // Same Y for horizontal swipe
  });

  test("ignores non-clickable elements", async () => {
    const containerNode = createContainerNode("[0,0][1000,2000]", "container-with-non-clickable");
    const nonClickableOverlay = createNode("[0,0][1000,500]", {
      "resource-id": "non-clickable-element",
      "clickable": "false"
    });

    const hierarchy = createHierarchy([containerNode, nonClickableOverlay]);
    fakeObserveScreen.setObserveResult(createObserveResult(hierarchy));

    const swipeOn = createSwipeOn();
    const result = await swipeOn.execute({
      direction: "down",
      container: { elementId: "container-with-non-clickable" }
    });

    expect(result.success).toBe(true);
    expect(result.warning).toBeUndefined();
    const [call] = fakeGesture.getSwipeCalls();
    expect(call).toBeDefined();
    // Should not avoid non-clickable overlay, so y1 can be anywhere
    // Including the area covered by the non-clickable element
    expect(call.y1).toBeLessThan(500);
  });

  test("avoids focusable elements even if not clickable", async () => {
    const containerNode = createContainerNode("[0,0][1000,2000]", "container-with-focusable");
    const focusableOverlay = createNode("[0,0][1000,300]", {
      "resource-id": "focusable-element",
      "focusable": "true"
    });

    const hierarchy = createHierarchy([containerNode, focusableOverlay]);
    fakeObserveScreen.setObserveResult(createObserveResult(hierarchy));

    const swipeOn = createSwipeOn();
    const result = await swipeOn.execute({
      direction: "down",
      container: { elementId: "container-with-focusable" }
    });

    expect(result.success).toBe(true);
    const [call] = fakeGesture.getSwipeCalls();
    expect(call).toBeDefined();
    // Should avoid focusable overlay
    expect(call.y1).toBeGreaterThan(300);
  });

  test("ignores overlays completely outside container bounds", async () => {
    const containerNode = createContainerNode("[100,100][900,1900]", "inner-container");
    // Overlay outside container bounds
    const outsideOverlay = createNode("[0,0][50,2000]", {
      "resource-id": "outside-overlay",
      "clickable": "true"
    });

    const hierarchy = createHierarchy([containerNode, outsideOverlay]);
    fakeObserveScreen.setObserveResult(createObserveResult(hierarchy));

    const swipeOn = createSwipeOn();
    const result = await swipeOn.execute({
      direction: "down",
      container: { elementId: "inner-container" }
    });

    expect(result.success).toBe(true);
    expect(result.warning).toBeUndefined();
    const [call] = fakeGesture.getSwipeCalls();
    expect(call).toBeDefined();
    // Should use container center (500) since overlay doesn't overlap
    expect(call.x1).toBe(500);
  });

  test("warns when overlays leave minimal safe space", async () => {
    const containerNode = createContainerNode("[0,0][1000,2000]", "mostly-blocked-container");
    // Create overlays that cover most of the vertical space
    const overlay1 = createNode("[0,0][1000,1950]", {
      "resource-id": "massive-overlay",
      "clickable": "true"
    });

    const hierarchy = createHierarchy([containerNode, overlay1]);
    fakeObserveScreen.setObserveResult(createObserveResult(hierarchy));

    const swipeOn = createSwipeOn();
    const result = await swipeOn.execute({
      direction: "down",
      container: { elementId: "mostly-blocked-container" }
    });

    expect(result.success).toBe(true);
    // Should have warning about reduced swipe area
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain("Swipe area reduced");
    const [call] = fakeGesture.getSwipeCalls();
    expect(call).toBeDefined();
    // Y should be in the small remaining gap
    expect(call.y1).toBeGreaterThan(1950);
  });

  test("handles overlays with partial intersection", async () => {
    const containerNode = createContainerNode("[0,0][1000,2000]", "container");
    // Overlay that only partially overlaps container
    const partialOverlay = createNode("[500,0][1500,400]", {
      "resource-id": "partial-overlay",
      "clickable": "true"
    });

    const hierarchy = createHierarchy([containerNode, partialOverlay]);
    fakeObserveScreen.setObserveResult(createObserveResult(hierarchy));

    const swipeOn = createSwipeOn();
    const result = await swipeOn.execute({
      direction: "down",
      container: { elementId: "container" }
    });

    expect(result.success).toBe(true);
    const [call] = fakeGesture.getSwipeCalls();
    expect(call).toBeDefined();
    // Should avoid the overlapping part [500-1000, 0-400]
    // X should be < 500 or Y should start > 400
    expect(call.x1 < 500 || call.y1 > 400).toBe(true);
  });
});

describe("SwipeOn boomerang", () => {
  const device = { name: "test-device", platform: "android", deviceId: "device-1" } as const;
  let fakeObserveScreen: FakeObserveScreen;
  let fakeGesture: FakeGestureExecutor;
  let fakeAwaitIdle: FakeAwaitIdle;
  let fakeWindow: FakeWindow;
  let fakeTimer: FakeTimer;
  let fakeAccessibilityDetector: FakeAccessibilityDetector;
  let getInstanceSpy: ReturnType<typeof spyOn> | null = null;

  const createObserveResult = (): ObserveResult => ({
    timestamp: Date.now(),
    screenSize: { width: 1000, height: 2000 },
    systemInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    viewHierarchy: null
  });

  const createSwipeOn = () => {
    const swipeOn = new SwipeOn(device, {} as any, {
      executeGesture: fakeGesture,
      observeScreen: fakeObserveScreen,
      accessibilityDetector: fakeAccessibilityDetector
    });
    (swipeOn as any).awaitIdle = fakeAwaitIdle;
    (swipeOn as any).window = fakeWindow;
    (swipeOn as any).timer = fakeTimer;
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
    fakeTimer = new FakeTimer();
    fakeTimer.enableAutoAdvance();
    fakeWindow.configureCachedActiveWindow(null);
  });

  afterEach(() => {
    getInstanceSpy?.mockRestore();
  });

  test("performs a round-trip swipe with return speed", async () => {
    fakeObserveScreen.setObserveResult(createObserveResult());

    const swipeOn = createSwipeOn();
    const result = await swipeOn.execute({
      direction: "up",
      autoTarget: false,
      duration: 400,
      boomerang: true,
      apexPause: 0,
      returnSpeed: 2
    });

    expect(result.success).toBe(true);
    expect(result.duration).toBe(600);

    const calls = fakeGesture.getSwipeCalls();
    expect(calls).toHaveLength(2);
    expect(calls[0].options?.duration).toBe(400);
    expect(calls[1].options?.duration).toBe(200);
    expect(calls[1].x1).toBe(calls[0].x2);
    expect(calls[1].y1).toBe(calls[0].y2);
    expect(calls[1].x2).toBe(calls[0].x1);
    expect(calls[1].y2).toBe(calls[0].y1);
  });
});

describe("SwipeOn lookFor validation", () => {
  const device = { name: "test-device", platform: "android", deviceId: "device-1" } as const;
  let fakeObserveScreen: FakeObserveScreen;
  let fakeGesture: FakeGestureExecutor;
  let fakeAwaitIdle: FakeAwaitIdle;
  let fakeWindow: FakeWindow;
  let fakeTimer: FakeTimer;
  let fakeAccessibilityDetector: FakeAccessibilityDetector;
  let getInstanceSpy: ReturnType<typeof spyOn> | null = null;

  const createSwipeOn = () => {
    const swipeOn = new SwipeOn(device, {} as any, {
      executeGesture: fakeGesture,
      observeScreen: fakeObserveScreen,
      accessibilityDetector: fakeAccessibilityDetector
    });
    (swipeOn as any).awaitIdle = fakeAwaitIdle;
    (swipeOn as any).window = fakeWindow;
    (swipeOn as any).timer = fakeTimer;
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
    fakeTimer = new FakeTimer();
    fakeTimer.enableAutoAdvance();
    fakeWindow.configureCachedActiveWindow(null);
  });

  afterEach(() => {
    getInstanceSpy?.mockRestore();
  });

  test("rejects lookFor without text or elementId", async () => {
    const swipeOn = createSwipeOn();
    const result = await swipeOn.execute({
      direction: "up",
      lookFor: {}
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("lookFor must specify exactly one of elementId or text");
  });

  test("rejects lookFor with both text and elementId", async () => {
    const swipeOn = createSwipeOn();
    const result = await swipeOn.execute({
      direction: "up",
      lookFor: {
        text: "Settings",
        elementId: "com.app:id/settings"
      }
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("lookFor must specify exactly one of elementId or text");
  });
});
