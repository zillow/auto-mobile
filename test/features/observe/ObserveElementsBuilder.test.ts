import { describe, expect, test } from "bun:test";
import { ObserveElementsBuilder, ElementUtilsLike } from "../../../src/features/observe/ObserveElementsBuilder";
import { Element, ViewHierarchyResult } from "../../../src/models";

const createElement = (bounds: Element["bounds"]): Element => ({
  bounds
});

describe("ObserveElementsBuilder", () => {
  test("builds clickable, scrollable, and text elements with filtering", () => {
    const clickable = createElement({ left: 0, top: 0, right: 10, bottom: 10 });
    const scrollable = createElement({ left: 5, top: 5, right: 15, bottom: 15 });
    const textElement = createElement({ left: 10, top: 10, right: 20, bottom: 20 });
    const blankTextElement = createElement({ left: 20, top: 20, right: 30, bottom: 30 });

    const fakeElementUtils: ElementUtilsLike = {
      findClickableElements: () => [clickable],
      findScrollableElements: () => [scrollable],
      flattenViewHierarchy: () => [
        { element: textElement, text: "Hello" },
        { element: blankTextElement, text: "   " },
        { element: clickable }
      ]
    };

    const builder = new ObserveElementsBuilder(fakeElementUtils);
    const elements = builder.build({ hierarchy: { node: {} } } as ViewHierarchyResult);

    expect(elements.clickable).toEqual([clickable]);
    expect(elements.scrollable).toEqual([scrollable]);
    expect(elements.text).toEqual([textElement]);
  });
});
