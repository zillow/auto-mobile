import { describe, expect, test } from "bun:test";
import { TapOnElement } from "../../../src/features/action/TapOnElement";
import { FakeAdbClient } from "../../fakes/FakeAdbClient";
import { FakeElementSelector } from "../../fakes/FakeElementSelector";
import { FakeTimer } from "../../fakes/FakeTimer";

const createTapOnElement = (selector: FakeElementSelector) => {
  return new TapOnElement(
    {
      name: "test-device",
      platform: "android",
      id: "emulator-5554",
    } as any,
    new FakeAdbClient() as any,
    {
      timer: new FakeTimer(),
      elementSelector: selector,
    }
  );
};

const makeElement = () => ({
  bounds: { left: 0, top: 0, right: 100, bottom: 50 },
  text: "Item",
  clickable: "true",
} as any);

describe("TapOnElement extended selectors", () => {
  describe("validation", () => {
    test("rejects when no selector provided", () => {
      const selector = new FakeElementSelector(makeElement());
      const tapOn = createTapOnElement(selector);
      const error = (tapOn as any).validateOptions({ action: "tap" });
      expect(error).toContain("requires exactly one");
    });

    test("rejects when multiple selectors provided", () => {
      const selector = new FakeElementSelector(makeElement());
      const tapOn = createTapOnElement(selector);
      const error = (tapOn as any).validateOptions({
        action: "tap",
        text: "Login",
        clickable: true,
      });
      expect(error).toContain("requires exactly one");
    });

    test("accepts clickable as sole selector", () => {
      const selector = new FakeElementSelector(makeElement());
      const tapOn = createTapOnElement(selector);
      const error = (tapOn as any).validateOptions({
        action: "tap",
        clickable: true,
      });
      expect(error).toBeNull();
    });

    test("accepts siblingOfText as sole selector", () => {
      const selector = new FakeElementSelector(makeElement());
      const tapOn = createTapOnElement(selector);
      const error = (tapOn as any).validateOptions({
        action: "tap",
        siblingOfText: "Label",
      });
      expect(error).toBeNull();
    });
  });

  describe("findElementInHierarchy", () => {
    test("delegates siblingOfText to selectClickableSiblingOfText", () => {
      const selector = new FakeElementSelector(makeElement());
      const tapOn = createTapOnElement(selector);

      const result = (tapOn as any).findElementInHierarchy(
        { siblingOfText: "Email", action: "tap" },
        { hierarchy: { node: {} } }
      );

      expect(result.selection.element).not.toBeNull();
      expect(selector.lastText).toBe("Email");
    });

    test("delegates tapClickableParent to selectClickableParentByText", () => {
      const selector = new FakeElementSelector(makeElement());
      const tapOn = createTapOnElement(selector);

      const result = (tapOn as any).findElementInHierarchy(
        { text: "John Smith", tapClickableParent: true, action: "tap" },
        { hierarchy: { node: {} } }
      );

      expect(result.selection.element).not.toBeNull();
      expect(selector.lastText).toBe("John Smith");
    });

    test("delegates clickable to selectClickable", () => {
      const selector = new FakeElementSelector(makeElement());
      const tapOn = createTapOnElement(selector);

      const result = (tapOn as any).findElementInHierarchy(
        { clickable: true, action: "tap" },
        { hierarchy: { node: {} } }
      );

      expect(result.selection.element).not.toBeNull();
    });

    test("clickable respects selectionStrategy", () => {
      const selector = new FakeElementSelector(makeElement());
      const tapOn = createTapOnElement(selector);

      (tapOn as any).findElementInHierarchy(
        { clickable: true, action: "tap", selectionStrategy: "random" },
        { hierarchy: { node: {} } }
      );

      expect(selector.lastStrategy).toBe("random");
    });
  });
});
