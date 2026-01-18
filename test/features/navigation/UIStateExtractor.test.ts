import { describe, expect, test } from "bun:test";
import { UIStateExtractor } from "../../../src/features/navigation/UIStateExtractor";
import { ObserveResult } from "../../../src/models";
import { ViewHierarchyResult } from "../../../src/models/ViewHierarchyResult";

describe("UIStateExtractor (iOS hierarchy)", () => {
  test("extracts selected elements from $ attributes", () => {
    const viewHierarchy: ViewHierarchyResult = {
      hierarchy: {
        node: {
          $: { class: "UITabBar" },
          node: [
            {
              $: {
                "text": "Home",
                "selected": "true",
                "resource-id": "tab.home",
                "content-desc": "Home tab"
              }
            },
            {
              $: {
                "text": "Settings",
                "selected": "false",
                "resource-id": "tab.settings"
              }
            }
          ]
        }
      }
    };

    const state = UIStateExtractor.extract(viewHierarchy);

    expect(state).toBeDefined();
    expect(state?.selectedElements).toHaveLength(1);
    expect(state?.selectedElements[0]).toMatchObject({
      text: "Home",
      resourceId: "tab.home",
      contentDesc: "Home tab"
    });
  });

  test("captures modal stack for iOS alerts", () => {
    const viewHierarchy: ViewHierarchyResult = {
      hierarchy: {
        node: {
          $: {
            "class": "UIAlertController",
            "resource-id": "alert.main",
            "text": "Alert"
          }
        }
      }
    };

    const state = UIStateExtractor.extract(viewHierarchy);

    expect(state?.modalStack).toHaveLength(1);
    expect(state?.modalStack?.[0]).toMatchObject({
      type: "dialog",
      identifier: "alert.main",
      layer: 0
    });
  });

  test("preserves modal stack in extractFromObservation", () => {
    const viewHierarchy: ViewHierarchyResult = {
      hierarchy: {
        node: {
          $: {
            "class": "UIActionSheet",
            "resource-id": "sheet.main"
          }
        }
      }
    };

    const observation: ObserveResult = {
      updatedAt: 0,
      screenSize: { width: 0, height: 0 },
      systemInsets: { top: 0, bottom: 0, left: 0, right: 0 },
      viewHierarchy
    };

    const state = UIStateExtractor.extractFromObservation(observation);

    expect(state?.modalStack).toHaveLength(1);
    expect(state?.modalStack?.[0]).toMatchObject({
      type: "bottomsheet",
      identifier: "sheet.main",
      layer: 0
    });
  });
});
