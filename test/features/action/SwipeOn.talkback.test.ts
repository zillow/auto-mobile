import { beforeEach, describe, expect, test, spyOn } from "bun:test";
import { SwipeOn } from "../../../src/features/action/SwipeOn";
import { FakeAccessibilityDetector } from "../../fakes/FakeAccessibilityDetector";
import { SwipeDirection } from "../../../src/models";
import { NoOpPerformanceTracker } from "../../../src/utils/PerformanceTracker";

describe("SwipeOn TalkBack mode detection", () => {
  let fakeAccessibilityDetector: FakeAccessibilityDetector;
  let swipeOn: SwipeOn;
  let executeAndroidSwipeWithAccessibility: any;
  let executeGestureSwipe: any;

  beforeEach(() => {
    fakeAccessibilityDetector = new FakeAccessibilityDetector();

    // Create a minimal SwipeOn instance for testing
    swipeOn = new SwipeOn(
      {
        name: "test-device",
        platform: "android",
        id: "emulator-5554",
      } as any,
      {} as any,  // adb
      {
        accessibilityDetector: fakeAccessibilityDetector,
        // Mock executeGesture to avoid actual swipe execution
        executeGesture: {
          swipe: async () => ({
            success: true,
            x1: 0,
            y1: 0,
            x2: 0,
            y2: 0,
            duration: 300
          })
        } as any
      }
    );

    // Spy on the private methods to verify dispatch logic
    executeAndroidSwipeWithAccessibility = spyOn(
      swipeOn as any,
      "executeAndroidSwipeWithAccessibility"
    ).mockResolvedValue({
      success: true,
      x1: 100,
      y1: 500,
      x2: 100,
      y2: 200,
      duration: 300
    });

    executeGestureSwipe = spyOn(
      (swipeOn as any).executeGesture,
      "swipe"
    ).mockResolvedValue({
      success: true,
      x1: 100,
      y1: 500,
      x2: 100,
      y2: 200,
      duration: 300
    });
  });

  describe("when TalkBack is disabled", () => {
    beforeEach(() => {
      fakeAccessibilityDetector.setTalkBackEnabled(false);
    });

    test("dispatches to standard swipe method", async () => {
      await (swipeOn as any).executeSwipeGesture(
        100,
        500,
        100,
        200,
        "up" as SwipeDirection,
        null,
        { duration: 300 },
        new NoOpPerformanceTracker()
      );

      expect(executeGestureSwipe).toHaveBeenCalledTimes(1);
      expect(executeAndroidSwipeWithAccessibility).not.toHaveBeenCalled();
    });

    test("uses standard swipe for all directions", async () => {
      const directions: SwipeDirection[] = ["up", "down", "left", "right"];

      for (const direction of directions) {
        executeGestureSwipe.mockClear();
        executeAndroidSwipeWithAccessibility.mockClear();

        await (swipeOn as any).executeSwipeGesture(
          100,
          500,
          100,
          200,
          direction,
          null,
          { duration: 300 },
          new NoOpPerformanceTracker()
        );

        expect(executeGestureSwipe).toHaveBeenCalledTimes(1);
        expect(executeAndroidSwipeWithAccessibility).not.toHaveBeenCalled();
      }
    });
  });

  describe("when TalkBack is enabled", () => {
    beforeEach(() => {
      fakeAccessibilityDetector.setTalkBackEnabled(true);
    });

    test("dispatches to accessibility-aware swipe method", async () => {
      await (swipeOn as any).executeSwipeGesture(
        100,
        500,
        100,
        200,
        "up" as SwipeDirection,
        null,
        { duration: 300 },
        new NoOpPerformanceTracker()
      );

      expect(executeAndroidSwipeWithAccessibility).toHaveBeenCalledTimes(1);
      expect(executeGestureSwipe).not.toHaveBeenCalled();
    });

    test("passes container element to accessibility method", async () => {
      const containerElement = {
        "bounds": { left: 0, top: 100, right: 400, bottom: 800 },
        "resource-id": "test:id/scrollView",
        "scrollable": true
      } as any;

      await (swipeOn as any).executeSwipeGesture(
        100,
        500,
        100,
        200,
        "up" as SwipeDirection,
        containerElement,
        { duration: 300 },
        new NoOpPerformanceTracker()
      );

      expect(executeAndroidSwipeWithAccessibility).toHaveBeenCalledWith(
        100,
        500,
        100,
        200,
        "up",
        containerElement,
        { duration: 300 },
        expect.any(NoOpPerformanceTracker)
      );
    });

    test("uses accessibility method for all swipe directions", async () => {
      const directions: SwipeDirection[] = ["up", "down", "left", "right"];

      for (const direction of directions) {
        executeGestureSwipe.mockClear();
        executeAndroidSwipeWithAccessibility.mockClear();

        await (swipeOn as any).executeSwipeGesture(
          100,
          500,
          100,
          200,
          direction,
          null,
          { duration: 300 },
          new NoOpPerformanceTracker()
        );

        expect(executeAndroidSwipeWithAccessibility).toHaveBeenCalledTimes(1);
        expect(executeGestureSwipe).not.toHaveBeenCalled();
      }
    });

    test("boomerang announces swipeable element instead of swiping", async () => {
      const mockAccessibilityService = {
        requestAction: async () => ({ success: true })
      };
      (swipeOn as any).accessibilityService = mockAccessibilityService;
      const requestActionSpy = spyOn(mockAccessibilityService, "requestAction")
        .mockResolvedValue({ success: true });

      const containerElement = {
        "resource-id": "test:id/scrollView"
      } as any;

      await (swipeOn as any).executeSwipeGesture(
        100,
        500,
        100,
        200,
        "up" as SwipeDirection,
        containerElement,
        { duration: 300 },
        new NoOpPerformanceTracker(),
        { apexPauseMs: 100, returnSpeed: 1 }
      );

      expect(requestActionSpy).toHaveBeenCalledWith(
        "focus",
        "test:id/scrollView",
        5000,
        expect.any(NoOpPerformanceTracker)
      );
      expect(executeAndroidSwipeWithAccessibility).not.toHaveBeenCalled();
      expect(executeGestureSwipe).not.toHaveBeenCalled();
    });
  });

  describe("TalkBack state cache invalidation", () => {
    test("re-checks TalkBack state on subsequent swipes", async () => {
      // First swipe with TalkBack disabled
      fakeAccessibilityDetector.setTalkBackEnabled(false);
      await (swipeOn as any).executeSwipeGesture(
        100, 500, 100, 200,
        "up" as SwipeDirection,
        null,
        { duration: 300 },
        new NoOpPerformanceTracker()
      );
      expect(executeGestureSwipe).toHaveBeenCalledTimes(1);

      executeGestureSwipe.mockClear();
      executeAndroidSwipeWithAccessibility.mockClear();

      // Enable TalkBack and invalidate cache
      fakeAccessibilityDetector.setTalkBackEnabled(true);
      fakeAccessibilityDetector.invalidateCache();

      // Second swipe should use accessibility method
      await (swipeOn as any).executeSwipeGesture(
        100, 500, 100, 200,
        "up" as SwipeDirection,
        null,
        { duration: 300 },
        new NoOpPerformanceTracker()
      );

      expect(executeAndroidSwipeWithAccessibility).toHaveBeenCalledTimes(1);
      expect(executeGestureSwipe).not.toHaveBeenCalled();
    });
  });

  describe("platform detection", () => {
    test("uses standard swipe for iOS regardless of TalkBack state", async () => {
      const iosSwipeOn = new SwipeOn(
        {
          name: "test-device",
          platform: "ios",
          id: "test-ios-device",
        } as any,
        null,
        {
          accessibilityDetector: fakeAccessibilityDetector,
          executeGesture: {
            swipe: async () => ({
              success: true,
              x1: 0,
              y1: 0,
              x2: 0,
              y2: 0,
              duration: 300
            })
          } as any
        }
      );

      const iosExecuteGestureSwipe = spyOn(
        (iosSwipeOn as any).executeGesture,
        "swipe"
      ).mockResolvedValue({
        success: true,
        x1: 100,
        y1: 500,
        x2: 100,
        y2: 200,
        duration: 300
      });

      // Even with TalkBack "enabled", iOS should use standard swipe
      fakeAccessibilityDetector.setTalkBackEnabled(true);

      await (iosSwipeOn as any).executeSwipeGesture(
        100, 500, 100, 200,
        "up" as SwipeDirection,
        null,
        { duration: 300 },
        new NoOpPerformanceTracker()
      );

      expect(iosExecuteGestureSwipe).toHaveBeenCalledTimes(1);
    });
  });

  describe("executeAndroidSwipeWithAccessibility method", () => {
    let mockAccessibilityService: any;

    beforeEach(() => {
      // Reset mocks
      executeAndroidSwipeWithAccessibility.mockRestore();

      // Mock accessibilityService
      mockAccessibilityService = {
        requestAction: async () => ({ success: true }),
        requestTwoFingerSwipe: async () => ({
          success: true,
          totalTimeMs: 100,
          gestureTimeMs: 50
        })
      };

      (swipeOn as any).accessibilityService = mockAccessibilityService;
    });

    test("tries ACTION_SCROLL when container has resource-id", async () => {
      const requestActionSpy = spyOn(mockAccessibilityService, "requestAction")
        .mockResolvedValue({ success: true });

      const containerElement = {
        "bounds": { left: 0, top: 100, right: 400, bottom: 800 },
        "resource-id": "test:id/scrollView",
        "scrollable": true
      } as any;

      await (swipeOn as any).executeAndroidSwipeWithAccessibility(
        100, 500, 100, 200,
        "down" as SwipeDirection,
        containerElement,
        { duration: 300 }
      );

      // Should call clear_focus and then scroll_forward
      expect(requestActionSpy).toHaveBeenCalledWith("clear_focus", "test:id/scrollView");
      expect(requestActionSpy).toHaveBeenCalledWith("scroll_forward", "test:id/scrollView");
    });

    test("maps up direction to scroll_backward", async () => {
      const requestActionSpy = spyOn(mockAccessibilityService, "requestAction")
        .mockResolvedValue({ success: true });

      const containerElement = {
        "resource-id": "test:id/scrollView"
      } as any;

      await (swipeOn as any).executeAndroidSwipeWithAccessibility(
        100, 500, 100, 700,
        "up" as SwipeDirection,
        containerElement,
        { duration: 300 }
      );

      expect(requestActionSpy).toHaveBeenCalledWith("scroll_backward", "test:id/scrollView");
    });

    test("falls back to two-finger swipe when ACTION_SCROLL fails", async () => {
      spyOn(mockAccessibilityService, "requestAction")
        .mockResolvedValue({ success: false, error: "Scroll not supported" });

      const twoFingerSwipeSpy = spyOn(mockAccessibilityService, "requestTwoFingerSwipe")
        .mockResolvedValue({
          success: true,
          totalTimeMs: 100,
          gestureTimeMs: 50
        });

      const containerElement = {
        "resource-id": "test:id/scrollView"
      } as any;

      await (swipeOn as any).executeAndroidSwipeWithAccessibility(
        100, 500, 100, 200,
        "up" as SwipeDirection,
        containerElement,
        { duration: 300 }
      );

      expect(twoFingerSwipeSpy).toHaveBeenCalledWith(
        100, 500, 100, 200,
        300,
        100, // Fixed offset
        5000,
        expect.any(NoOpPerformanceTracker)
      );
    });

    test("uses two-finger swipe when container has no resource-id", async () => {
      const requestActionSpy = spyOn(mockAccessibilityService, "requestAction");
      const twoFingerSwipeSpy = spyOn(mockAccessibilityService, "requestTwoFingerSwipe")
        .mockResolvedValue({
          success: true,
          totalTimeMs: 100,
          gestureTimeMs: 50
        });

      const containerElement = {
        "bounds": { left: 0, top: 100, right: 400, bottom: 800 },
        "scrollable": true
        // No resource-id
      } as any;

      await (swipeOn as any).executeAndroidSwipeWithAccessibility(
        100, 500, 100, 200,
        "up" as SwipeDirection,
        containerElement,
        { duration: 300 }
      );

      // Should not try ACTION_SCROLL
      expect(requestActionSpy).not.toHaveBeenCalled();
      // Should use two-finger swipe
      expect(twoFingerSwipeSpy).toHaveBeenCalled();
    });

    test("uses two-finger swipe when no container provided", async () => {
      const requestActionSpy = spyOn(mockAccessibilityService, "requestAction");
      const twoFingerSwipeSpy = spyOn(mockAccessibilityService, "requestTwoFingerSwipe")
        .mockResolvedValue({
          success: true,
          totalTimeMs: 100,
          gestureTimeMs: 50
        });

      await (swipeOn as any).executeAndroidSwipeWithAccessibility(
        100, 500, 100, 200,
        "up" as SwipeDirection,
        null, // No container
        { duration: 300 }
      );

      expect(requestActionSpy).not.toHaveBeenCalled();
      expect(twoFingerSwipeSpy).toHaveBeenCalled();
    });
  });
});
