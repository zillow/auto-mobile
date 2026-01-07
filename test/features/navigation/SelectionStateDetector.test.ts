import { describe, expect, test } from "bun:test";
import { SelectionStateDetector } from "../../../src/features/navigation/SelectionStateDetector";
import { FakeScreenshotUtils } from "../../fakes/FakeScreenshotUtils";
import { FakeImageUtils } from "../../fakes/FakeImageUtils";
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

describe("SelectionStateDetector", () => {
  test("prefers accessibility-selected elements when available", async () => {
    const screenshotUtils = new FakeScreenshotUtils();
    const imageUtils = new FakeImageUtils();
    const detector = new SelectionStateDetector({ screenshotUtils, imageUtils });

    const observation = createObservation(
      createHierarchy({
        text: "Home",
        selected: "true",
        bounds: "[0,0][50,50]"
      })
    );

    const selected = await detector.detectSelectedElements({
      currentObservation: observation
    });

    expect(selected).toHaveLength(1);
    expect(selected[0].text).toBe("Home");
    expect(selected[0].selectedState?.method).toBe("accessibility");
    expect(screenshotUtils.wasMethodCalled("getCachedScreenshot")).toBe(false);
  });

  test("uses visual fallback when accessibility-selected elements are missing", async () => {
    const screenshotUtils = new FakeScreenshotUtils();
    const imageUtils = new FakeImageUtils();
    const detector = new SelectionStateDetector({ screenshotUtils, imageUtils });

    screenshotUtils.setCachedScreenshot("before.png", Buffer.from("before"), "hash-before");
    screenshotUtils.setCachedScreenshot("after.png", Buffer.from("after"), "hash-after");
    screenshotUtils.setImageDimensions(100, 100);
    screenshotUtils.setCompareImagesResult({
      similarity: 90,
      pixelDifference: 10,
      totalPixels: 100
    });

    const observation = createObservation(
      createHierarchy({
        text: "NotSelected",
        selected: "false",
        bounds: "[0,0][50,50]"
      })
    );

    const element: Element = {
      bounds: { left: 0, top: 0, right: 50, bottom: 50 },
      text: "Tab1",
      "resource-id": "tab1"
    };

    const selected = await detector.detectSelectedElements({
      currentObservation: observation,
      previousObservation: observation,
      tappedElement: element,
      beforeScreenshotPath: "before.png",
      afterScreenshotPath: "after.png"
    });

    expect(selected).toHaveLength(1);
    expect(selected[0].text).toBe("Tab1");
    expect(selected[0].selectedState?.method).toBe("visual");
    expect(selected[0].selectedState?.confidence).toBeGreaterThan(0);
    expect(imageUtils.wasMethodCalled("crop")).toBe(true);
  });
});
