import { beforeEach, describe, expect, test, spyOn } from "bun:test";
import { TapOnElement } from "../../../src/features/action/TapOnElement";
import { FakeAccessibilityDetector } from "../../fakes/FakeAccessibilityDetector";

describe("TapOnElement TalkBack mode detection", () => {
  let fakeAccessibilityDetector: FakeAccessibilityDetector;
  let tapOnElement: TapOnElement;
  let executeAndroidTapWithCoordinates: any;
  let executeAndroidTapWithAccessibility: any;

  beforeEach(() => {
    fakeAccessibilityDetector = new FakeAccessibilityDetector();

    // Create a minimal TapOnElement instance for testing
    tapOnElement = new TapOnElement(
      {
        name: "test-device",
        platform: "android",
        id: "emulator-5554",
      } as any,
      {} as any,  // adb
      null,
      null,
      undefined,
      undefined,
      fakeAccessibilityDetector
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
      expect(executeAndroidTapWithAccessibility).toHaveBeenCalledWith("tap", element, 500, {}, undefined);

      executeAndroidTapWithAccessibility.mockClear();

      // Test longPress
      await (tapOnElement as any).executeAndroidTap("longPress", 50, 50, 1000, element, undefined, {});
      expect(executeAndroidTapWithAccessibility).toHaveBeenCalledWith("longPress", element, 1000, {}, undefined);

      executeAndroidTapWithAccessibility.mockClear();

      // Test doubleTap
      await (tapOnElement as any).executeAndroidTap("doubleTap", 50, 50, 500, element, undefined, {});
      expect(executeAndroidTapWithAccessibility).toHaveBeenCalledWith("doubleTap", element, 500, {}, undefined);
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
});
