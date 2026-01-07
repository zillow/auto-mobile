import { describe, expect, test } from "bun:test";
import { SelectionStateTracker } from "../../../src/features/navigation/SelectionStateTracker";
import { FakeSelectionStateDetector } from "../../fakes/FakeSelectionStateDetector";
import { FakeScreenshotCapturer } from "../../fakes/FakeScreenshotCapturer";
import { Element, ObserveResult, ViewHierarchyResult } from "../../../src/models";

const createHierarchy = (node: Record<string, any>): ViewHierarchyResult => ({
  hierarchy: {
    node
  }
} as ViewHierarchyResult);

const createObservation = (viewHierarchy: ViewHierarchyResult): ObserveResult => ({
  updatedAt: Date.now(),
  screenSize: { width: 100, height: 100 },
  systemInsets: { top: 0, right: 0, bottom: 0, left: 0 },
  viewHierarchy
});

describe("SelectionStateTracker", () => {
  test("skips capture when accessibility selected state is present", async () => {
    const detector = new FakeSelectionStateDetector();
    const capturer = new FakeScreenshotCapturer();
    const tracker = new SelectionStateTracker({
      detector,
      screenshotCapturer: capturer
    });

    const observation = createObservation(
      createHierarchy({
        text: "Home",
        selected: "true",
        bounds: "[0,0][10,10]"
      })
    );

    const element: Element = {
      bounds: { left: 0, top: 0, right: 10, bottom: 10 },
      text: "Home",
      clickable: true
    };

    const state = await tracker.prepare({
      action: "tap",
      observation,
      element
    });

    expect(state).toBeNull();
    expect(capturer.getCallCount()).toBe(0);
    expect(detector.getContexts()).toHaveLength(0);
  });

  test("captures before/after and uses detector when accessibility is missing", async () => {
    const detector = new FakeSelectionStateDetector();
    const capturer = new FakeScreenshotCapturer();
    const tracker = new SelectionStateTracker({
      detector,
      screenshotCapturer: capturer
    });

    capturer.setPaths(["before.png", "after.png"]);
    detector.setResult([
      {
        text: "Tab1",
        selectedState: { method: "visual", confidence: 0.6 }
      }
    ]);

    const observation = createObservation(
      createHierarchy({
        text: "Tab1",
        selected: "false",
        bounds: "[0,0][10,10]"
      })
    );

    const element: Element = {
      bounds: { left: 0, top: 0, right: 10, bottom: 10 },
      text: "Tab1",
      clickable: true
    };

    const state = await tracker.prepare({
      action: "tap",
      observation,
      element
    });

    expect(state?.beforeScreenshotPath).toBe("before.png");

    const selected = await tracker.finalize({
      action: "tap",
      selectionState: state,
      currentObservation: observation,
      previousObservation: observation,
      element
    });

    expect(selected).toHaveLength(1);
    expect(selected[0].text).toBe("Tab1");

    const contexts = detector.getContexts();
    expect(contexts).toHaveLength(1);
    expect(contexts[0].beforeScreenshotPath).toBe("before.png");
    expect(contexts[0].afterScreenshotPath).toBe("after.png");
  });

  test("skips capture when element is not selectable", async () => {
    const detector = new FakeSelectionStateDetector();
    const capturer = new FakeScreenshotCapturer();
    const tracker = new SelectionStateTracker({
      detector,
      screenshotCapturer: capturer
    });

    const observation = createObservation(
      createHierarchy({
        text: "Label",
        bounds: "[0,0][10,10]"
      })
    );

    const element: Element = {
      bounds: { left: 0, top: 0, right: 10, bottom: 10 },
      text: "Label"
    };

    const state = await tracker.prepare({
      action: "tap",
      observation,
      element
    });

    expect(state).toBeNull();
    expect(capturer.getCallCount()).toBe(0);
  });
});
