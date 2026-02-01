import { describe, expect, test } from "bun:test";
import type {
  Element,
  ElementSelectionResult,
  TapOnElementResult
} from "../../../src/models";
import { TapOnElement } from "../../../src/features/action/TapOnElement";
import { FakeAdbClient } from "../../fakes/FakeAdbClient";
import { FakeTimer } from "../../fakes/FakeTimer";
import { ResultFaker } from "../../fakes/ResultFaker";

const createTapOnElement = (): TapOnElement => {
  return new TapOnElement(
    {
      name: "test-device",
      platform: "android",
      id: "emulator-5554",
    } as any,
    new FakeAdbClient() as any,
    {
      timer: new FakeTimer()
    }
  );
};

describe("TapOnElement selectedElement metadata", () => {
  test("populates selection metadata and computes bounds centers", () => {
    const tapOnElement = createTapOnElement();
    const element: Element = {
      "text": "Sarah's Channel",
      "resource-id": "com.example:id/channel_item",
      "class": "android.widget.TextView",
      "bounds": { left: 50, top: 200, right: 350, bottom: 280 }
    };
    const selection: ElementSelectionResult = {
      element,
      indexInMatches: 3,
      totalMatches: 10,
      strategy: "random"
    };

    const selectedElement = (tapOnElement as any).buildSelectedElementMetadata(selection);

    expect(selectedElement).toEqual({
      text: "Sarah's Channel",
      resourceId: "com.example:id/channel_item",
      bounds: {
        left: 50,
        top: 200,
        right: 350,
        bottom: 280,
        centerX: 200,
        centerY: 240
      },
      indexInMatches: 3,
      totalMatches: 10,
      selectionStrategy: "random"
    });
  });

  test("handles text, button, and list item element types", () => {
    const tapOnElement = createTapOnElement();
    const cases: Array<{ label: string; element: Element }> = [
      {
        label: "text",
        element: {
          "text": "Channel",
          "resource-id": "com.example:id/channel_text",
          "class": "android.widget.TextView",
          "bounds": { left: 0, top: 0, right: 100, bottom: 40 }
        }
      },
      {
        label: "button",
        element: {
          "text": "Submit",
          "resource-id": "com.example:id/submit_button",
          "class": "android.widget.Button",
          "bounds": { left: 10, top: 50, right: 210, bottom: 130 }
        }
      },
      {
        label: "list item",
        element: {
          "text": "Item 7",
          "resource-id": "com.example:id/list_item",
          "class": "android.widget.LinearLayout",
          "bounds": { left: 12, top: 140, right: 312, bottom: 220 }
        }
      }
    ];

    for (const entry of cases) {
      const selection: ElementSelectionResult = {
        element: entry.element,
        indexInMatches: 0,
        totalMatches: 1,
        strategy: "first"
      };

      const selectedElement = (tapOnElement as any).buildSelectedElementMetadata(selection);

      expect(selectedElement.text).toBe(entry.element.text);
      expect(selectedElement.resourceId).toBe(entry.element["resource-id"]);
      expect(selectedElement.selectionStrategy).toBe("first");
      expect(selectedElement.totalMatches).toBe(1);
      expect(selectedElement.indexInMatches).toBe(0);
      expect(selectedElement.bounds.centerX).toBe(
        Math.floor((entry.element.bounds.left + entry.element.bounds.right) / 2)
      );
      expect(selectedElement.bounds.centerY).toBe(
        Math.floor((entry.element.bounds.top + entry.element.bounds.bottom) / 2)
      );
    }
  });

  test("tapOn response matches TapOnElementResult interface", () => {
    const element = ResultFaker.element({
      "text": "Profile",
      "resource-id": "com.example:id/profile_tab",
      "bounds": { left: 0, top: 0, right: 80, bottom: 40 }
    });
    const selectedElement = ResultFaker.tapOnSelectedElement(element, {
      indexInMatches: 1,
      totalMatches: 4,
      selectionStrategy: "random"
    });

    const response: TapOnElementResult = {
      success: true,
      action: "tap",
      element,
      selectedElement
    };

    expect(response.selectedElement?.selectionStrategy).toBe("random");
    expect(response.selectedElement?.bounds.centerX).toBe(40);
    expect(response.selectedElement?.bounds.centerY).toBe(20);
  });
});
