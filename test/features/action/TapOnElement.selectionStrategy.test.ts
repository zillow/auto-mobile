import { describe, expect, test } from "bun:test";
import { TapOnElement } from "../../../src/features/action/TapOnElement";
import { FakeAdbClient } from "../../fakes/FakeAdbClient";
import { FakeElementSelector } from "../../fakes/FakeElementSelector";
import { FakeTimer } from "../../fakes/FakeTimer";

describe("TapOnElement selectionStrategy", () => {
  test("passes selectionStrategy to the element selector", () => {
    const fakeSelector = new FakeElementSelector({
      bounds: { left: 0, top: 0, right: 10, bottom: 10 }
    } as any);
    const tapOnElement = new TapOnElement(
      {
        name: "test-device",
        platform: "android",
        id: "emulator-5554",
      } as any,
      new FakeAdbClient() as any,
      undefined,       // visionConfig
      undefined,       // selectionStateTracker
      undefined,       // accessibilityDetector
      new FakeTimer(),
      fakeSelector
    );

    const result = (tapOnElement as any).findElementInHierarchy(
      {
        text: "Match",
        action: "tap",
        selectionStrategy: "random"
      },
      { hierarchy: { node: {} } }
    );

    expect(result.selection.element).not.toBeNull();
    expect(fakeSelector.lastText).toBe("Match");
    expect(fakeSelector.lastStrategy).toBe("random");
  });
});
