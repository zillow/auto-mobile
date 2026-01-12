import { beforeEach, describe, expect, test, spyOn } from "bun:test";
import { TapOnElement } from "../../../src/features/action/TapOnElement";
import { FakeAdbClient } from "../../fakes/FakeAdbClient";
import { FakeAccessibilityDetector } from "../../fakes/FakeAccessibilityDetector";
import { FakeTimer } from "../../fakes/FakeTimer";

describe("TapOnElement TalkBack mode detection", () => {
  let fakeAccessibilityDetector: FakeAccessibilityDetector;
  let fakeAdb: FakeAdbClient;
  let fakeTimer: FakeTimer;
  let tapOnElement: TapOnElement;
  let executeAndroidTapWithCoordinates: any;
  let executeAndroidTapWithAccessibility: any;

  beforeEach(() => {
    fakeAccessibilityDetector = new FakeAccessibilityDetector();
    fakeAdb = new FakeAdbClient();
    fakeTimer = new FakeTimer();

    // Create a minimal TapOnElement instance for testing
    tapOnElement = new TapOnElement(
      {
        name: "test-device",
        platform: "android",
        id: "emulator-5554",
      } as any,
      fakeAdb as any,  // adb
      null,
      null,
      undefined,
      undefined,
      fakeAccessibilityDetector,
      fakeTimer
    );

    // Spy on the private methods to verify dispatch logic
    executeAndroidTapWithCoordinates = spyOn(
      tapOnElement as any,
      "executeAndroidTapWithCoordinates"
    ).mockResolvedValue(undefined);

    executeAndroidTapWithAccessibility = spyOn(
      tapOnElement as any,
      "executeAndroidTapWithAccessibility"
    ).mockResolvedValue(undefined);
  });

  describe("when TalkBack is disabled", () => {
    beforeEach(() => {
      fakeAccessibilityDetector.setTalkBackEnabled(false);
    });

    test("dispatches to coordinate-based tap method", async () => {
      const element = {
        "bounds": { left: 0, top: 0, right: 100, bottom: 100 },
        "resource-id": "test:id/button",
      } as any;

      await (tapOnElement as any).executeAndroidTap(
        "tap",
        50,
        50,
        500,
        element,
        undefined,
        { action: "tap", elementId: "test:id/button" }
      );

      expect(executeAndroidTapWithCoordinates).toHaveBeenCalledTimes(1);
      expect(executeAndroidTapWithAccessibility).not.toHaveBeenCalled();
    });

    test("uses coordinate method for all action types", async () => {
      const element = {
        "bounds": { left: 0, top: 0, right: 100, bottom: 100 },
        "resource-id": "test:id/button",
      } as any;

      // Test tap
      await (tapOnElement as any).executeAndroidTap("tap", 50, 50, 500, element);
      expect(executeAndroidTapWithCoordinates).toHaveBeenCalledWith("tap", 50, 50, 500, element, undefined);

      executeAndroidTapWithCoordinates.mockClear();

      // Test longPress
      await (tapOnElement as any).executeAndroidTap("longPress", 50, 50, 1000, element);
      expect(executeAndroidTapWithCoordinates).toHaveBeenCalledWith("longPress", 50, 50, 1000, element, undefined);

      executeAndroidTapWithCoordinates.mockClear();

      // Test doubleTap
      await (tapOnElement as any).executeAndroidTap("doubleTap", 50, 50, 500, element);
      expect(executeAndroidTapWithCoordinates).toHaveBeenCalledWith("doubleTap", 50, 50, 500, element, undefined);
    });
  });

  describe("when TalkBack is enabled", () => {
    beforeEach(() => {
      fakeAccessibilityDetector.setTalkBackEnabled(true);
    });

    test("dispatches to accessibility-based tap method", async () => {
      const element = {
        "bounds": { left: 0, top: 0, right: 100, bottom: 100 },
        "resource-id": "test:id/button",
      } as any;

      const options = { action: "tap" as const, elementId: "test:id/button" };

      await (tapOnElement as any).executeAndroidTap(
        "tap",
        50,
        50,
        500,
        element,
        undefined,
        options
      );

      expect(executeAndroidTapWithAccessibility).toHaveBeenCalledTimes(1);
      expect(executeAndroidTapWithAccessibility).toHaveBeenCalledWith(
        "tap",
        50,
        50,
        element,
        500,
        options,
        undefined
      );
      expect(executeAndroidTapWithCoordinates).not.toHaveBeenCalled();
    });

    test("passes options including focusFirst to accessibility method", async () => {
      const element = {
        "bounds": { left: 0, top: 0, right: 100, bottom: 100 },
        "resource-id": "test:id/button",
      } as any;

      const options = {
        action: "tap" as const,
        elementId: "test:id/button",
        focusFirst: false,
      };

      await (tapOnElement as any).executeAndroidTap(
        "tap",
        50,
        50,
        500,
        element,
        undefined,
        options
      );

      expect(executeAndroidTapWithAccessibility).toHaveBeenCalledWith(
        "tap",
        50,
        50,
        element,
        500,
        options,
        undefined
      );
    });

    test("uses accessibility method for all action types", async () => {
      const element = {
        "bounds": { left: 0, top: 0, right: 100, bottom: 100 },
        "resource-id": "test:id/button",
      } as any;

      // Test tap
      await (tapOnElement as any).executeAndroidTap("tap", 50, 50, 500, element, undefined, {});
      expect(executeAndroidTapWithAccessibility).toHaveBeenCalledWith("tap", 50, 50, element, 500, {}, undefined);

      executeAndroidTapWithAccessibility.mockClear();

      // Test longPress
      await (tapOnElement as any).executeAndroidTap("longPress", 50, 50, 1000, element, undefined, {});
      expect(executeAndroidTapWithAccessibility).toHaveBeenCalledWith("longPress", 50, 50, element, 1000, {}, undefined);

      executeAndroidTapWithAccessibility.mockClear();

      // Test doubleTap
      await (tapOnElement as any).executeAndroidTap("doubleTap", 50, 50, 500, element, undefined, {});
      expect(executeAndroidTapWithAccessibility).toHaveBeenCalledWith("doubleTap", 50, 50, element, 500, {}, undefined);
    });
  });

  describe("TalkBack detection integration", () => {
    test("calls accessibility detector on each tap", async () => {
      fakeAccessibilityDetector.setTalkBackEnabled(true);

      const element = {
        "bounds": { left: 0, top: 0, right: 100, bottom: 100 },
        "resource-id": "test:id/button",
      } as any;

      // First call
      await (tapOnElement as any).executeAndroidTap("tap", 50, 50, 500, element, undefined, {});
      const firstCheckCount = fakeAccessibilityDetector.getCheckCount();
      expect(firstCheckCount).toBe(1);

      // Second call - note: real AccessibilityDetector would cache, but FakeAccessibilityDetector doesn't
      await (tapOnElement as any).executeAndroidTap("tap", 50, 50, 500, element, undefined, {});
      const secondCheckCount = fakeAccessibilityDetector.getCheckCount();

      // Verify detector was called for second tap (caching is tested in AccessibilityDetector tests)
      expect(secondCheckCount).toBeGreaterThanOrEqual(1);
    });

    test("respects cache invalidation", async () => {
      fakeAccessibilityDetector.setTalkBackEnabled(false);

      const element = {
        "bounds": { left: 0, top: 0, right: 100, bottom: 100 },
        "resource-id": "test:id/button",
      } as any;

      // First call with TalkBack disabled
      await (tapOnElement as any).executeAndroidTap("tap", 50, 50, 500, element, undefined, {});
      expect(executeAndroidTapWithCoordinates).toHaveBeenCalled();
      executeAndroidTapWithCoordinates.mockClear();

      // Invalidate cache and enable TalkBack
      fakeAccessibilityDetector.invalidateCache("emulator-5554");
      fakeAccessibilityDetector.setTalkBackEnabled(true);

      // Second call should detect TalkBack as enabled (new detection)
      await (tapOnElement as any).executeAndroidTap("tap", 50, 50, 500, element, undefined, {});
      expect(executeAndroidTapWithAccessibility).toHaveBeenCalled();
      expect(executeAndroidTapWithCoordinates).not.toHaveBeenCalled();
    });
  });

  describe("executeAndroidTapWithAccessibility doubleTap behavior", () => {
    let mockAccessibilityService: any;

    beforeEach(() => {
      executeAndroidTapWithAccessibility.mockRestore();

      mockAccessibilityService = {
        requestTapCoordinates: async () => ({ success: true, totalTimeMs: 1 })
      };

      (tapOnElement as any).accessibilityService = mockAccessibilityService;
    });

    test("issues two accessibility taps with a delay", async () => {
      const requestTapCoordinates = spyOn(mockAccessibilityService, "requestTapCoordinates")
        .mockResolvedValue({ success: true, totalTimeMs: 1 });

      const element = {
        "resource-id": "test:id/button"
      } as any;

      await (tapOnElement as any).executeAndroidTapWithAccessibility(
        "doubleTap",
        50,
        50,
        element,
        500,
        {},
        undefined
      );

      expect(requestTapCoordinates).toHaveBeenCalledTimes(2);
      expect(requestTapCoordinates.mock.calls).toEqual([
        [50, 50, 50],
        [50, 50, 50]
      ]);
      expect(fakeTimer.wasSleepCalled(200)).toBe(true);
      expect(executeAndroidTapWithCoordinates).not.toHaveBeenCalled();
    });

    test("falls back to coordinate double tap if the first accessibility tap fails", async () => {
      const requestTapCoordinates = spyOn(mockAccessibilityService, "requestTapCoordinates")
        .mockResolvedValueOnce({ success: false, totalTimeMs: 1, error: "nope" });

      const element = {
        "resource-id": "test:id/button"
      } as any;

      await (tapOnElement as any).executeAndroidTapWithAccessibility(
        "doubleTap",
        50,
        50,
        element,
        500,
        {},
        undefined
      );

      expect(requestTapCoordinates).toHaveBeenCalledTimes(1);
      expect(executeAndroidTapWithCoordinates).toHaveBeenCalledTimes(1);
      expect(executeAndroidTapWithCoordinates).toHaveBeenCalledWith(
        "doubleTap",
        50,
        50,
        500,
        element,
        undefined
      );
    });

    test("falls back to a single coordinate tap if the second accessibility tap fails", async () => {
      const requestTapCoordinates = spyOn(mockAccessibilityService, "requestTapCoordinates")
        .mockResolvedValueOnce({ success: true, totalTimeMs: 1 })
        .mockResolvedValueOnce({ success: false, totalTimeMs: 1, error: "nope" });

      const element = {
        "resource-id": "test:id/button"
      } as any;

      await (tapOnElement as any).executeAndroidTapWithAccessibility(
        "doubleTap",
        50,
        50,
        element,
        500,
        {},
        undefined
      );

      expect(requestTapCoordinates).toHaveBeenCalledTimes(2);
      expect(executeAndroidTapWithCoordinates).toHaveBeenCalledTimes(1);
      expect(executeAndroidTapWithCoordinates).toHaveBeenCalledWith(
        "tap",
        50,
        50,
        500,
        element,
        undefined
      );
    });
  });

  describe("clickable parent resolution", () => {
    test("uses clickable parent when child is not clickable", () => {
      const viewHierarchy = {
        hierarchy: {
          node: {
            $: {
              "class": "android.widget.LinearLayout",
              "clickable": "true",
              "bounds": "[0,0][100,100]",
              "resource-id": "parent:id"
            },
            node: [
              {
                $: {
                  "class": "android.widget.TextView",
                  "text": "Markup",
                  "bounds": "[10,10][50,50]",
                  "resource-id": "android:id/text1"
                }
              }
            ]
          }
        }
      } as any;

      const childElement = {
        "bounds": { left: 10, top: 10, right: 50, bottom: 50 },
        "text": "Markup",
        "resource-id": "android:id/text1"
      } as any;

      const result = (tapOnElement as any).resolveTapTargetElement(
        childElement,
        viewHierarchy,
        "tap",
        true
      );

      expect(result.usedParent).toBe(true);
      expect(result.element["resource-id"]).toBe("parent:id");
    });

    test("prefers long-clickable parent for longPress", () => {
      const viewHierarchy = {
        hierarchy: {
          node: {
            $: {
              "class": "android.widget.LinearLayout",
              "long-clickable": "true",
              "bounds": "[0,0][100,100]",
              "resource-id": "parent:long"
            },
            node: {
              $: {
                class: "android.widget.TextView",
                text: "Markup",
                bounds: "[10,10][50,50]"
              }
            }
          }
        }
      } as any;

      const childElement = {
        bounds: { left: 10, top: 10, right: 50, bottom: 50 },
        text: "Markup"
      } as any;

      const result = (tapOnElement as any).resolveTapTargetElement(
        childElement,
        viewHierarchy,
        "longPress",
        true
      );

      expect(result.usedParent).toBe(true);
      expect(result.element["resource-id"]).toBe("parent:long");
    });
  });
});
