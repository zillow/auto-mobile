import { beforeEach, describe, expect, test, spyOn } from "bun:test";
import { TalkBackTapStrategy } from "../../../src/features/talkback/TalkBackTapStrategy";
import { FakeTalkBackNavigationDriver } from "../../fakes/FakeTalkBackNavigationDriver";
import { FakeTimer } from "../../fakes/FakeTimer";
import { FocusNavigationExecutor } from "../../../src/features/talkback/FocusNavigationExecutor";
import { FocusPathCalculator } from "../../../src/features/talkback/FocusPathCalculator";
import { FocusElementMatcher } from "../../../src/features/talkback/FocusElementMatcher";
import type { Element } from "../../../src/models/Element";

describe("TalkBackTapStrategy", () => {
  let strategy: TalkBackTapStrategy;
  let driver: FakeTalkBackNavigationDriver;
  let fakeTimer: FakeTimer;
  let mockExecutor: FocusNavigationExecutor;
  let mockPathCalculator: FocusPathCalculator;
  let matcher: FocusElementMatcher;

  beforeEach(() => {
    fakeTimer = new FakeTimer();
    fakeTimer.enableAutoAdvance();
    matcher = new FocusElementMatcher();
    mockPathCalculator = new FocusPathCalculator(matcher);
    mockExecutor = new FocusNavigationExecutor({
      matcher,
      pathCalculator: mockPathCalculator,
      timer: fakeTimer
    });

    strategy = new TalkBackTapStrategy({
      matcher,
      pathCalculator: mockPathCalculator,
      executor: mockExecutor,
      timer: fakeTimer
    });

    driver = new FakeTalkBackNavigationDriver();
  });

  describe("executeTap", () => {
    test("returns error when element has no identifying information", async () => {
      const element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 100 }
        // no text, no resource-id, no content-desc
      } as Element;

      const result = await strategy.executeTap("device-1", element, "tap", driver);

      expect(result.success).toBe(false);
      expect(result.method).toBe("focus-navigation");
      expect(result.error).toBeDefined();
    });

    test("navigates using text match when element has no resource-id", async () => {
      const element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 100 },
        text: "Button"
      } as Element;

      driver.setElements([element], 0);

      const navigateToElement = spyOn(mockExecutor, "navigateToElement")
        .mockResolvedValue(true);

      const result = await strategy.executeTap("device-1", element, "tap", driver);

      expect(result.success).toBe(true);
      expect(result.method).toBe("focus-navigation");
      expect(navigateToElement).toHaveBeenCalledTimes(1);
      expect(driver.getTapCount()).toBe(2); // Double-tap to activate
    });

    test("navigates using content-desc match when element has no resource-id", async () => {
      const element = {
        "bounds": { left: 0, top: 0, right: 100, bottom: 100 },
        "content-desc": "Close dialog"
      } as Element;

      driver.setElements([element], 0);

      const navigateToElement = spyOn(mockExecutor, "navigateToElement")
        .mockResolvedValue(true);

      const result = await strategy.executeTap("device-1", element, "tap", driver);

      expect(result.success).toBe(true);
      expect(result.method).toBe("focus-navigation");
      expect(navigateToElement).toHaveBeenCalledTimes(1);
    });

    test("uses focus navigation for tap action", async () => {
      const element = {
        "resource-id": "test:id/button",
        "bounds": { left: 0, top: 0, right: 100, bottom: 100 }
      } as Element;

      // Set up driver with element in traversal order
      driver.setElements([element], 0);

      const navigateToElement = spyOn(mockExecutor, "navigateToElement")
        .mockResolvedValue(true);

      const result = await strategy.executeTap("device-1", element, "tap", driver);

      expect(result.success).toBe(true);
      expect(result.method).toBe("focus-navigation");
      expect(navigateToElement).toHaveBeenCalledTimes(1);
      expect(driver.getTapCount()).toBe(2); // Double-tap to activate
    });

    test("uses focus navigation for doubleTap action", async () => {
      const element = {
        "resource-id": "test:id/button",
        "bounds": { left: 0, top: 0, right: 100, bottom: 100 }
      } as Element;

      driver.setElements([element], 0);

      const navigateToElement = spyOn(mockExecutor, "navigateToElement")
        .mockResolvedValue(true);

      const result = await strategy.executeTap("device-1", element, "doubleTap", driver);

      expect(result.success).toBe(true);
      expect(result.method).toBe("focus-navigation");
      expect(navigateToElement).toHaveBeenCalledTimes(1);
      expect(driver.getTapCount()).toBe(2); // Double-tap to activate
    });

    test("returns error when focus navigation fails", async () => {
      const element = {
        "resource-id": "test:id/button",
        "bounds": { left: 0, top: 0, right: 100, bottom: 100 }
      } as Element;

      driver.setElements([element], 0);

      const navigateToElement = spyOn(mockExecutor, "navigateToElement")
        .mockRejectedValue(new Error("Navigation failed"));

      const result = await strategy.executeTap("device-1", element, "tap", driver);

      expect(result.success).toBe(false);
      expect(result.method).toBe("focus-navigation");
      expect(result.error).toContain("Navigation failed");
      expect(navigateToElement).toHaveBeenCalledTimes(1);
    });

    test("uses ACTION_CLICK fallback if double-tap activation fails", async () => {
      const element = {
        "resource-id": "test:id/button",
        "bounds": { left: 0, top: 0, right: 100, bottom: 100 }
      } as Element;

      driver.setElements([element], 0);

      spyOn(mockExecutor, "navigateToElement").mockResolvedValue(true);
      driver.queueTapResult({ success: false, totalTimeMs: 1, error: "tap failed" });
      driver.setActionResult({ success: true, action: "click", totalTimeMs: 1 });

      const result = await strategy.executeTap("device-1", element, "tap", driver);

      expect(result.success).toBe(true);
      expect(result.method).toBe("accessibility-action");
      expect(driver.getTapCount()).toBe(1); // Only first tap attempted
      expect(driver.getActionCount()).toBe(1); // ACTION_CLICK fallback
      expect(driver.actionHistory[0]).toEqual({ action: "click", resourceId: "test:id/button" });
    });

    test("returns failure when text-only element activation double-tap fails (no ACTION_CLICK fallback)", async () => {
      const element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 100 },
        text: "Button"
      } as Element;

      driver.setElements([element], 0);

      spyOn(mockExecutor, "navigateToElement").mockResolvedValue(true);
      driver.setTapResult({ success: false, totalTimeMs: 1, error: "tap failed" });

      const result = await strategy.executeTap("device-1", element, "tap", driver);

      expect(result.success).toBe(false);
      expect(result.method).toBe("focus-navigation");
      expect(driver.getActionCount()).toBe(0); // No ACTION_CLICK attempted without resource-id
    });

    test("returns failure when text-only element second tap fails (no ACTION_CLICK fallback)", async () => {
      const element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 100 },
        text: "Button"
      } as Element;

      driver.setElements([element], 0);

      spyOn(mockExecutor, "navigateToElement").mockResolvedValue(true);
      driver.queueTapResult({ success: true, totalTimeMs: 1 }); // first tap succeeds
      driver.setTapResult({ success: false, totalTimeMs: 1, error: "second tap failed" });

      const result = await strategy.executeTap("device-1", element, "tap", driver);

      expect(result.success).toBe(false);
      expect(result.method).toBe("focus-navigation");
      expect(driver.getActionCount()).toBe(0); // No ACTION_CLICK attempted without resource-id
    });

    test("returns error if both double-tap and ACTION_CLICK fail", async () => {
      const element = {
        "resource-id": "test:id/button",
        "bounds": { left: 0, top: 0, right: 100, bottom: 100 }
      } as Element;

      driver.setElements([element], 0);

      spyOn(mockExecutor, "navigateToElement").mockResolvedValue(true);
      driver.queueTapResult({ success: false, totalTimeMs: 1, error: "tap failed" });
      driver.setActionResult({ success: false, action: "click", totalTimeMs: 1, error: "click failed" });

      const result = await strategy.executeTap("device-1", element, "tap", driver);

      expect(result.success).toBe(false);
      expect(result.method).toBe("focus-navigation");
      expect(result.error).toContain("both failed");
    });

    test("returns error when navigation path cannot be calculated", async () => {
      const element = {
        "resource-id": "test:id/nonexistent",
        "bounds": { left: 0, top: 0, right: 100, bottom: 100 }
      } as Element;

      // Element not in traversal order
      driver.setElements([
        { "resource-id": "test:id/other", "bounds": { left: 0, top: 0, right: 50, bottom: 50 } } as Element
      ], 0);

      const result = await strategy.executeTap("device-1", element, "tap", driver);

      expect(result.success).toBe(false);
      expect(result.method).toBe("focus-navigation");
      expect(result.error).toContain("calculate navigation path");
    });

    test("returns error when traversal order request fails", async () => {
      const element = {
        "resource-id": "test:id/button",
        "bounds": { left: 0, top: 0, right: 100, bottom: 100 }
      } as Element;

      driver.queueTraversalResult({ error: "Service unavailable", totalTimeMs: 1 });

      const result = await strategy.executeTap("device-1", element, "tap", driver);

      expect(result.success).toBe(false);
      expect(result.method).toBe("focus-navigation");
      expect(result.error).toContain("traversal order");
    });
  });

  describe("executeLongPress", () => {
    test("uses ACTION_LONG_CLICK when element has resource-id", async () => {
      const element = {
        "resource-id": "test:id/button",
        "bounds": { left: 0, top: 0, right: 100, bottom: 100 }
      } as Element;

      driver.setActionResult({ success: true, action: "long_click", totalTimeMs: 1 });

      const result = await strategy.executeLongPress(50, 50, 1000, element, driver);

      expect(result.success).toBe(true);
      expect(result.method).toBe("accessibility-action");
      expect(driver.actionHistory).toHaveLength(1);
      expect(driver.actionHistory[0]).toEqual({ action: "long_click", resourceId: "test:id/button" });
      expect(driver.getTapCount()).toBe(0); // No coordinate taps
    });

    test("falls back to coordinate gesture when ACTION_LONG_CLICK fails", async () => {
      const element = {
        "resource-id": "test:id/button",
        "bounds": { left: 0, top: 0, right: 100, bottom: 100 }
      } as Element;

      driver.setActionResult({ success: false, action: "long_click", totalTimeMs: 1, error: "service unavailable" });

      const result = await strategy.executeLongPress(50, 50, 1000, element, driver);

      expect(result.success).toBe(true);
      expect(result.method).toBe("coordinate-fallback");
      expect(driver.getTapCount()).toBe(1);
      expect(driver.tapHistory[0]).toEqual({ x: 50, y: 50, durationMs: 1000 }); // Full duration for longPress
    });

    test("uses coordinate gesture directly when element has no resource-id", async () => {
      const element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 100 },
        text: "Button"
      } as Element;

      const result = await strategy.executeLongPress(50, 50, 1000, element, driver);

      expect(result.success).toBe(true);
      expect(result.method).toBe("coordinate-fallback");
      expect(driver.getActionCount()).toBe(0); // No ACTION_LONG_CLICK attempted
      expect(driver.getTapCount()).toBe(1);
      expect(driver.tapHistory[0]).toEqual({ x: 50, y: 50, durationMs: 1000 });
    });

    test("returns error when coordinate fallback also fails", async () => {
      const element = {
        "resource-id": "test:id/button",
        "bounds": { left: 0, top: 0, right: 100, bottom: 100 }
      } as Element;

      driver.setActionResult({ success: false, action: "long_click", totalTimeMs: 1, error: "failed" });
      driver.setTapResult({ success: false, totalTimeMs: 1, error: "gesture failed" });

      const result = await strategy.executeLongPress(50, 50, 1000, element, driver);

      expect(result.success).toBe(false);
      expect(result.method).toBe("coordinate-fallback");
    });
  });

  describe("executeCoordinateFallback", () => {
    test("performs single tap for tap action", async () => {
      const result = await strategy.executeCoordinateFallback(50, 50, "tap", 500, driver);

      expect(result.success).toBe(true);
      expect(result.method).toBe("coordinate-fallback");
      expect(driver.getTapCount()).toBe(1);
      expect(driver.tapHistory[0]).toEqual({ x: 50, y: 50, durationMs: 50 }); // Short duration for tap
    });

    test("performs double tap for doubleTap action", async () => {
      const result = await strategy.executeCoordinateFallback(50, 50, "doubleTap", 500, driver);

      expect(result.success).toBe(true);
      expect(result.method).toBe("coordinate-fallback");
      expect(driver.getTapCount()).toBe(2);
      expect(driver.tapHistory[0]).toEqual({ x: 50, y: 50, durationMs: 50 });
      expect(driver.tapHistory[1]).toEqual({ x: 50, y: 50, durationMs: 50 });
    });

    test("uses full duration for longPress action", async () => {
      const result = await strategy.executeCoordinateFallback(50, 50, "longPress", 1000, driver);

      expect(result.success).toBe(true);
      expect(result.method).toBe("coordinate-fallback");
      expect(driver.getTapCount()).toBe(1);
      expect(driver.tapHistory[0]).toEqual({ x: 50, y: 50, durationMs: 1000 }); // Full duration
    });

    test("returns error when first tap of doubleTap fails", async () => {
      driver.queueTapResult({ success: false, totalTimeMs: 1, error: "tap failed" });

      const result = await strategy.executeCoordinateFallback(50, 50, "doubleTap", 500, driver);

      expect(result.success).toBe(false);
      expect(result.method).toBe("coordinate-fallback");
      expect(result.error).toContain("First tap failed");
      expect(driver.getTapCount()).toBe(1);
    });

    test("returns error when second tap of doubleTap fails", async () => {
      driver.queueTapResult({ success: true, totalTimeMs: 1 });
      driver.queueTapResult({ success: false, totalTimeMs: 1, error: "second tap failed" });

      const result = await strategy.executeCoordinateFallback(50, 50, "doubleTap", 500, driver);

      expect(result.success).toBe(false);
      expect(result.method).toBe("coordinate-fallback");
      expect(result.error).toContain("Second tap failed");
      expect(driver.getTapCount()).toBe(2);
    });

    test("returns error when single tap fails", async () => {
      driver.setTapResult({ success: false, totalTimeMs: 1, error: "tap failed" });

      const result = await strategy.executeCoordinateFallback(50, 50, "tap", 500, driver);

      expect(result.success).toBe(false);
      expect(result.method).toBe("coordinate-fallback");
      expect(result.error).toContain("tap failed");
    });
  });
});
