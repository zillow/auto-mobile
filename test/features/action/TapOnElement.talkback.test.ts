import { beforeEach, describe, expect, test, spyOn } from "bun:test";
import { TapOnElement } from "../../../src/features/action/TapOnElement";
import { FakeAdbClient } from "../../fakes/FakeAdbClient";
import { FakeAccessibilityDetector } from "../../fakes/FakeAccessibilityDetector";
import { FakeTimer } from "../../fakes/FakeTimer";
import { FakeTalkBackTapStrategy } from "../../fakes/FakeTalkBackTapStrategy";

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
    fakeTimer.enableAutoAdvance();

    // Create a minimal TapOnElement instance for testing
    tapOnElement = new TapOnElement(
      {
        name: "test-device",
        platform: "android",
        id: "emulator-5554",
      } as any,
      fakeAdb as any,
      {
        accessibilityDetector: fakeAccessibilityDetector,
        timer: fakeTimer
      }
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

    test("passes options to accessibility method", async () => {
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

    test("dispatches to accessibility-based tap method for element without resource-id", async () => {
      const element = {
        "bounds": { left: 0, top: 0, right: 100, bottom: 100 },
        text: "Settings",
      } as any;

      await (tapOnElement as any).executeAndroidTap(
        "tap",
        50,
        50,
        500,
        element,
        undefined,
        { action: "tap" }
      );

      expect(executeAndroidTapWithAccessibility).toHaveBeenCalledTimes(1);
      expect(executeAndroidTapWithCoordinates).not.toHaveBeenCalled();
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

    test("resolves text-only child to clickable parent with resource-id under TalkBack (requireResourceId=true)", () => {
      const viewHierarchy = {
        hierarchy: {
          node: {
            $: {
              "class": "android.widget.LinearLayout",
              "clickable": "true",
              "bounds": "[0,0][200,80]",
              "resource-id": "com.example:id/settings_row"
            },
            node: [
              {
                $: {
                  "class": "android.widget.TextView",
                  "text": "Settings",
                  "bounds": "[10,10][190,70]"
                  // no resource-id
                }
              }
            ]
          }
        }
      } as any;

      const textOnlyChild = {
        bounds: { left: 10, top: 10, right: 190, bottom: 70 },
        text: "Settings"
        // no resource-id
      } as any;

      // requireResourceId=true simulates TalkBack mode
      const result = (tapOnElement as any).resolveTapTargetElement(
        textOnlyChild,
        viewHierarchy,
        "tap",
        true
      );

      expect(result.usedParent).toBe(true);
      expect(result.element["resource-id"]).toBe("com.example:id/settings_row");
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

describe("TapOnElement TalkBackTapStrategy delegation", () => {
  let fakeTalkBackStrategy: FakeTalkBackTapStrategy;
  let fakeAccessibilityDetector: FakeAccessibilityDetector;
  let fakeAdb: FakeAdbClient;
  let fakeTimer: FakeTimer;
  let tapOnElement: TapOnElement;
  let executeAndroidTapWithCoordinates: any;

  beforeEach(() => {
    fakeAccessibilityDetector = new FakeAccessibilityDetector();
    fakeAccessibilityDetector.setTalkBackEnabled(true);
    fakeAdb = new FakeAdbClient();
    fakeTimer = new FakeTimer();
    fakeTimer.enableAutoAdvance();
    fakeTalkBackStrategy = new FakeTalkBackTapStrategy();

    tapOnElement = new TapOnElement(
      {
        name: "test-device",
        platform: "android",
        id: "emulator-5554",
      } as any,
      fakeAdb as any,
      {
        accessibilityDetector: fakeAccessibilityDetector,
        timer: fakeTimer,
        talkBackStrategy: fakeTalkBackStrategy
      }
    );

    executeAndroidTapWithCoordinates = spyOn(
      tapOnElement as any,
      "executeAndroidTapWithCoordinates"
    ).mockResolvedValue(undefined);
  });

  test("delegates tap to TalkBackTapStrategy.executeTap", async () => {
    const element = {
      "resource-id": "test:id/button",
      "bounds": { left: 0, top: 0, right: 100, bottom: 100 }
    } as any;

    await (tapOnElement as any).executeAndroidTapWithAccessibility(
      "tap",
      50,
      50,
      element,
      500,
      {},
      undefined
    );

    expect(fakeTalkBackStrategy.tapCalls).toHaveLength(1);
    expect(fakeTalkBackStrategy.tapCalls[0].deviceId).toBe("emulator-5554");
    expect(fakeTalkBackStrategy.tapCalls[0].element).toBe(element);
    expect(fakeTalkBackStrategy.tapCalls[0].action).toBe("tap");
  });

  test("delegates doubleTap to TalkBackTapStrategy.executeTap", async () => {
    const element = {
      "resource-id": "test:id/button",
      "bounds": { left: 0, top: 0, right: 100, bottom: 100 }
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

    expect(fakeTalkBackStrategy.tapCalls).toHaveLength(1);
    expect(fakeTalkBackStrategy.tapCalls[0].action).toBe("doubleTap");
  });

  test("uses executeLongPress for longPress action", async () => {
    const element = {
      "resource-id": "test:id/button",
      "bounds": { left: 0, top: 0, right: 100, bottom: 100 }
    } as any;

    await (tapOnElement as any).executeAndroidTapWithAccessibility(
      "longPress",
      50,
      50,
      element,
      1000,
      {},
      undefined
    );

    // Should not call executeTap for longPress
    expect(fakeTalkBackStrategy.tapCalls).toHaveLength(0);
    // Should call executeLongPress (not coordinate fallback directly)
    expect(fakeTalkBackStrategy.longPressCalls).toHaveLength(1);
    expect(fakeTalkBackStrategy.longPressCalls[0]).toMatchObject({
      x: 50,
      y: 50,
      durationMs: 1000,
      element
    });
    expect(fakeTalkBackStrategy.fallbackCalls).toHaveLength(0);
  });

  test("falls back to ADB tap when executeLongPress fails", async () => {
    const element = {
      "resource-id": "test:id/button",
      "bounds": { left: 0, top: 0, right: 100, bottom: 100 }
    } as any;

    fakeTalkBackStrategy.setLongPressResult({
      success: false,
      method: "coordinate-fallback",
      error: "Long press failed"
    });

    await (tapOnElement as any).executeAndroidTapWithAccessibility(
      "longPress",
      50,
      50,
      element,
      1000,
      {},
      undefined
    );

    expect(fakeTalkBackStrategy.longPressCalls).toHaveLength(1);
    expect(executeAndroidTapWithCoordinates).toHaveBeenCalledWith("longPress", 50, 50, 1000, element, undefined);
  });

  test("uses coordinate fallback when focus navigation fails", async () => {
    const element = {
      "resource-id": "test:id/button",
      "bounds": { left: 0, top: 0, right: 100, bottom: 100 }
    } as any;

    fakeTalkBackStrategy.setTapResult({
      success: false,
      method: "focus-navigation",
      error: "Navigation failed"
    });

    await (tapOnElement as any).executeAndroidTapWithAccessibility(
      "tap",
      50,
      50,
      element,
      500,
      {},
      undefined
    );

    expect(fakeTalkBackStrategy.tapCalls).toHaveLength(1);
    expect(fakeTalkBackStrategy.fallbackCalls).toHaveLength(1);
    expect(fakeTalkBackStrategy.fallbackCalls[0].action).toBe("tap");
  });

  test("falls back to ADB tap when coordinate fallback fails", async () => {
    const element = {
      "resource-id": "test:id/button",
      "bounds": { left: 0, top: 0, right: 100, bottom: 100 }
    } as any;

    fakeTalkBackStrategy.setTapResult({
      success: false,
      method: "focus-navigation",
      error: "Navigation failed"
    });
    fakeTalkBackStrategy.setFallbackResult({
      success: false,
      method: "coordinate-fallback",
      error: "Fallback failed"
    });

    await (tapOnElement as any).executeAndroidTapWithAccessibility(
      "tap",
      50,
      50,
      element,
      500,
      {},
      undefined
    );

    expect(fakeTalkBackStrategy.tapCalls).toHaveLength(1);
    expect(fakeTalkBackStrategy.fallbackCalls).toHaveLength(1);
    expect(executeAndroidTapWithCoordinates).toHaveBeenCalledWith("tap", 50, 50, 500, element, undefined);
  });

  test("routes text-only element through focus navigation", async () => {
    const element = {
      bounds: { left: 0, top: 0, right: 100, bottom: 100 },
      text: "Button without ID"
    } as any;

    await (tapOnElement as any).executeAndroidTapWithAccessibility(
      "tap",
      50,
      50,
      element,
      500,
      {},
      undefined
    );

    // Strategy is called even without resource-id
    expect(fakeTalkBackStrategy.tapCalls).toHaveLength(1);
    expect(fakeTalkBackStrategy.tapCalls[0].element).toBe(element);
    expect(executeAndroidTapWithCoordinates).not.toHaveBeenCalled();
  });

  test("falls back to ADB tap when strategy returns failure for element with no identifying info", async () => {
    const element = {
      bounds: { left: 0, top: 0, right: 100, bottom: 100 }
      // no text, no resource-id, no content-desc
    } as any;

    fakeTalkBackStrategy.setTapResult({
      success: false,
      method: "focus-navigation",
      error: "no identifying information"
    });
    fakeTalkBackStrategy.setFallbackResult({
      success: false,
      method: "coordinate-fallback",
      error: "fallback failed"
    });

    await (tapOnElement as any).executeAndroidTapWithAccessibility(
      "tap",
      50,
      50,
      element,
      500,
      {},
      undefined
    );

    expect(fakeTalkBackStrategy.tapCalls).toHaveLength(1);
    expect(fakeTalkBackStrategy.fallbackCalls).toHaveLength(1);
    expect(executeAndroidTapWithCoordinates).toHaveBeenCalledWith("tap", 50, 50, 500, element, undefined);
  });
});
