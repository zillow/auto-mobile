import { expect, describe, test } from "bun:test";
import { UIStateExtractor } from "../../../src/features/navigation/UIStateExtractor";
import { ViewHierarchyResult, WindowHierarchy } from "../../../src/models";

describe("UIStateExtractor", () => {
  describe("extract", () => {
    test("should return undefined for undefined hierarchy", () => {
      const result = UIStateExtractor.extract(undefined);
      expect(result).toBeUndefined();
    });

    test("should return undefined for hierarchy without hierarchy property", () => {
      const result = UIStateExtractor.extract({} as ViewHierarchyResult);
      expect(result).toBeUndefined();
    });

    test("should return undefined when no selected elements or destination found", () => {
      const hierarchy = createHierarchy({
        bounds: "[0,0][1080,2400]",
        node: {
          text: "Some Text",
          bounds: "[0,0][100,100]"
        }
      });
      const result = UIStateExtractor.extract(hierarchy);
      expect(result).toBeUndefined();
    });

    test("should extract selected element with text", () => {
      const hierarchy = createHierarchy({
        bounds: "[0,0][1080,2400]",
        node: {
          text: "Home",
          selected: "true",
          bounds: "[0,0][100,100]"
        }
      });

      const result = UIStateExtractor.extract(hierarchy);

      expect(result).toBeDefined();
      expect(result!.selectedElements).toHaveLength(1);
      expect(result!.selectedElements[0].text).toBe("Home");
    });

    test("should extract selected element with resource-id", () => {
      const hierarchy = createHierarchy({
        bounds: "[0,0][1080,2400]",
        node: {
          "resource-id": "com.app:id/nav_home",
          "selected": "true",
          "bounds": "[0,0][100,100]"
        }
      });

      const result = UIStateExtractor.extract(hierarchy);

      expect(result).toBeDefined();
      expect(result!.selectedElements).toHaveLength(1);
      expect(result!.selectedElements[0].resourceId).toBe("com.app:id/nav_home");
    });

    test("should extract selected element with content-desc", () => {
      const hierarchy = createHierarchy({
        bounds: "[0,0][1080,2400]",
        node: {
          "content-desc": "Home Tab",
          "selected": "true",
          "bounds": "[0,0][100,100]"
        }
      });

      const result = UIStateExtractor.extract(hierarchy);

      expect(result).toBeDefined();
      expect(result!.selectedElements).toHaveLength(1);
      expect(result!.selectedElements[0].contentDesc).toBe("Home Tab");
    });

    test("should extract multiple selected elements", () => {
      const hierarchy = createHierarchy({
        bounds: "[0,0][1080,2400]",
        node: [
          {
            text: "Tab1",
            selected: "true",
            bounds: "[0,0][100,100]"
          },
          {
            text: "Tab2",
            selected: "true",
            bounds: "[100,0][200,100]"
          }
        ]
      });

      const result = UIStateExtractor.extract(hierarchy);

      expect(result).toBeDefined();
      expect(result!.selectedElements).toHaveLength(2);
      expect(result!.selectedElements[0].text).toBe("Tab1");
      expect(result!.selectedElements[1].text).toBe("Tab2");
    });

    test("should extract nested selected elements", () => {
      const hierarchy = createHierarchy({
        bounds: "[0,0][1080,2400]",
        node: {
          bounds: "[0,0][1080,2400]",
          node: {
            bounds: "[0,0][500,100]",
            node: {
              text: "NestedTab",
              selected: "true",
              bounds: "[0,0][100,100]"
            }
          }
        }
      });

      const result = UIStateExtractor.extract(hierarchy);

      expect(result).toBeDefined();
      expect(result!.selectedElements).toHaveLength(1);
      expect(result!.selectedElements[0].text).toBe("NestedTab");
    });

    test("should extract destinationId from resource-id", () => {
      const hierarchy = createHierarchy({
        bounds: "[0,0][1080,2400]",
        node: {
          "resource-id": "navigation.HomeDestination",
          "bounds": "[0,0][1080,2400]"
        }
      });

      const result = UIStateExtractor.extract(hierarchy);

      expect(result).toBeDefined();
      expect(result!.destinationId).toBe("HomeDestination");
    });

    test("should extract text from child nodes for Compose layouts", () => {
      const hierarchy = createHierarchy({
        bounds: "[0,0][1080,2400]",
        node: {
          selected: "true",
          bounds: "[0,0][200,100]",
          node: {
            bounds: "[10,10][100,50]",
            node: {
              text: "ChildText",
              bounds: "[10,10][100,50]"
            }
          }
        }
      });

      const result = UIStateExtractor.extract(hierarchy);

      expect(result).toBeDefined();
      expect(result!.selectedElements).toHaveLength(1);
      expect(result!.selectedElements[0].text).toBe("ChildText");
    });

    test("should ignore elements with selected=false", () => {
      const hierarchy = createHierarchy({
        bounds: "[0,0][1080,2400]",
        node: {
          text: "NotSelected",
          selected: "false",
          bounds: "[0,0][100,100]"
        }
      });

      const result = UIStateExtractor.extract(hierarchy);

      expect(result).toBeUndefined();
    });

    test("should not include elements without identifier", () => {
      const hierarchy = createHierarchy({
        bounds: "[0,0][1080,2400]",
        node: {
          selected: "true",
          bounds: "[0,0][100,100]"
          // No text, resource-id, or content-desc
        }
      });

      const result = UIStateExtractor.extract(hierarchy);

      // Should be undefined because the selected element has no identifier
      expect(result).toBeUndefined();
    });

    test("should extract both selected elements and destinationId", () => {
      const hierarchy = createHierarchy({
        bounds: "[0,0][1080,2400]",
        node: {
          "resource-id": "navigation.SettingsDestination",
          "bounds": "[0,0][1080,2400]",
          "node": {
            text: "General",
            selected: "true",
            bounds: "[0,0][200,100]"
          }
        }
      });

      const result = UIStateExtractor.extract(hierarchy);

      expect(result).toBeDefined();
      expect(result!.destinationId).toBe("SettingsDestination");
      expect(result!.selectedElements).toHaveLength(1);
      expect(result!.selectedElements[0].text).toBe("General");
    });

    test("should handle array of child nodes", () => {
      const hierarchy = createHierarchy({
        bounds: "[0,0][1080,2400]",
        node: [
          {
            text: "First",
            bounds: "[0,0][100,100]"
          },
          {
            text: "Second",
            selected: "true",
            bounds: "[100,0][200,100]"
          },
          {
            text: "Third",
            bounds: "[200,0][300,100]"
          }
        ]
      });

      const result = UIStateExtractor.extract(hierarchy);

      expect(result).toBeDefined();
      expect(result!.selectedElements).toHaveLength(1);
      expect(result!.selectedElements[0].text).toBe("Second");
    });

    test("should handle real-world tab navigation hierarchy", () => {
      const hierarchy = createHierarchy({
        bounds: "[0,0][1080,2400]",
        node: {
          "resource-id": "navigation.HomeDestination",
          "bounds": "[0,0][1080,2400]",
          "node": {
            bounds: "[0,294][1080,420]",
            node: [
              {
                focusable: "true",
                selected: "true",
                bounds: "[0,294][216,420]",
                node: {
                  text: "Media",
                  bounds: "[78,330][139,383]"
                }
              },
              {
                clickable: "true",
                focusable: "true",
                bounds: "[216,294][432,420]",
                node: {
                  text: "Tap",
                  bounds: "[274,330][374,383]"
                }
              }
            ]
          }
        }
      });

      const result = UIStateExtractor.extract(hierarchy);

      expect(result).toBeDefined();
      expect(result!.destinationId).toBe("HomeDestination");
      expect(result!.selectedElements).toHaveLength(1);
      expect(result!.selectedElements[0].text).toBe("Media");
    });
  });

  describe("modal extraction", () => {
    test("should extract dialog modal from windows array", () => {
      const hierarchy = createHierarchyWithWindows(
        {
          bounds: "[0,0][1080,2400]",
          node: {
            text: "Screen Content",
            bounds: "[0,0][1080,2400]"
          }
        },
        [
          {
            windowId: 123,
            windowType: "TYPE_APPLICATION_DIALOG",
            windowLayer: 1,
            isActive: true,
            isFocused: true,
            hierarchy: {
              text: "Delete Account?",
              bounds: "[100,800][980,1600]"
            }
          }
        ]
      );

      const result = UIStateExtractor.extract(hierarchy);

      expect(result).toBeDefined();
      expect(result!.modalStack).toBeDefined();
      expect(result!.modalStack!).toHaveLength(1);
      expect(result!.modalStack![0].type).toBe("dialog");
      expect(result!.modalStack![0].windowId).toBe(123);
      expect(result!.modalStack![0].layer).toBe(1);
    });

    test("should extract bottom sheet modal from windows array", () => {
      const hierarchy = createHierarchyWithWindows(
        {
          bounds: "[0,0][1080,2400]",
          node: {
            text: "Screen Content",
            bounds: "[0,0][1080,2400]"
          }
        },
        [
          {
            windowId: 456,
            windowType: "TYPE_APPLICATION_PANEL",
            windowLayer: 2,
            isActive: true,
            isFocused: true,
            hierarchy: {
              "class": "BottomSheetBehavior",
              "resource-id": "com.app:id/settings_bottom_sheet",
              "bounds": "[0,1200][1080,2400]"
            }
          }
        ]
      );

      const result = UIStateExtractor.extract(hierarchy);

      expect(result).toBeDefined();
      expect(result!.modalStack).toBeDefined();
      expect(result!.modalStack!).toHaveLength(1);
      expect(result!.modalStack![0].type).toBe("bottomsheet");
      expect(result!.modalStack![0].windowId).toBe(456);
      expect(result!.modalStack![0].identifier).toBe("com.app:id/settings_bottom_sheet");
    });

    test("should extract popup modal from windows array", () => {
      const hierarchy = createHierarchyWithWindows(
        {
          bounds: "[0,0][1080,2400]"
        },
        [
          {
            windowId: 789,
            windowType: "TYPE_APPLICATION_POPUP",
            windowLayer: 1,
            isActive: true,
            isFocused: false,
            hierarchy: {
              text: "More options",
              bounds: "[800,100][1080,400]"
            }
          }
        ]
      );

      const result = UIStateExtractor.extract(hierarchy);

      expect(result).toBeDefined();
      expect(result!.modalStack).toBeDefined();
      expect(result!.modalStack!).toHaveLength(1);
      expect(result!.modalStack![0].type).toBe("popup");
      expect(result!.modalStack![0].identifier).toBe("More options");
    });

    test("should extract multiple modals and sort by layer", () => {
      const hierarchy = createHierarchyWithWindows(
        {
          bounds: "[0,0][1080,2400]"
        },
        [
          {
            windowId: 3,
            windowType: "TYPE_APPLICATION_DIALOG",
            windowLayer: 3,
            isActive: true,
            isFocused: true,
            hierarchy: {
              text: "Confirm?",
              bounds: "[100,800][980,1600]"
            }
          },
          {
            windowId: 2,
            windowType: "TYPE_APPLICATION_PANEL",
            windowLayer: 1,
            isActive: true,
            isFocused: false,
            hierarchy: {
              class: "BottomSheetBehavior",
              bounds: "[0,1200][1080,2400]"
            }
          }
        ]
      );

      const result = UIStateExtractor.extract(hierarchy);

      expect(result).toBeDefined();
      expect(result!.modalStack).toBeDefined();
      expect(result!.modalStack!).toHaveLength(2);
      // Should be sorted by layer (bottom to top)
      expect(result!.modalStack![0].layer).toBe(1);
      expect(result!.modalStack![0].type).toBe("bottomsheet");
      expect(result!.modalStack![1].layer).toBe(3);
      expect(result!.modalStack![1].type).toBe("dialog");
    });

    test("should extract menu modal from windows array", () => {
      const hierarchy = createHierarchyWithWindows(
        {
          bounds: "[0,0][1080,2400]"
        },
        [
          {
            windowId: 999,
            windowType: "TYPE_APPLICATION_MENU",
            windowLayer: 2,
            isActive: true,
            isFocused: true,
            hierarchy: {
              text: "Copy",
              bounds: "[200,300][400,500]"
            }
          }
        ]
      );

      const result = UIStateExtractor.extract(hierarchy);

      expect(result).toBeDefined();
      expect(result!.modalStack).toBeDefined();
      expect(result!.modalStack!).toHaveLength(1);
      expect(result!.modalStack![0].type).toBe("menu");
    });

    test("should not extract non-modal windows", () => {
      const hierarchy = createHierarchyWithWindows(
        {
          bounds: "[0,0][1080,2400]"
        },
        [
          {
            windowId: 1,
            windowType: "TYPE_BASE_APPLICATION",
            windowLayer: 0,
            isActive: true,
            isFocused: true,
            hierarchy: {
              text: "Main Content",
              bounds: "[0,0][1080,2400]"
            }
          }
        ]
      );

      const result = UIStateExtractor.extract(hierarchy);

      // Should be undefined because no selected elements or destination, and no modals
      expect(result).toBeUndefined();
    });

    test("should prefer resource-id over text for modal identifier", () => {
      const hierarchy = createHierarchyWithWindows(
        {
          bounds: "[0,0][1080,2400]"
        },
        [
          {
            windowId: 111,
            windowType: "TYPE_APPLICATION_DIALOG",
            windowLayer: 1,
            isActive: true,
            isFocused: true,
            hierarchy: {
              "resource-id": "com.app:id/confirmation_dialog",
              "text": "Are you sure?",
              "bounds": "[100,800][980,1600]"
            }
          }
        ]
      );

      const result = UIStateExtractor.extract(hierarchy);

      expect(result).toBeDefined();
      expect(result!.modalStack).toBeDefined();
      expect(result!.modalStack![0].identifier).toBe("com.app:id/confirmation_dialog");
    });

    test("should skip android system IDs for modal identifier", () => {
      const hierarchy = createHierarchyWithWindows(
        {
          bounds: "[0,0][1080,2400]"
        },
        [
          {
            windowId: 222,
            windowType: "TYPE_APPLICATION_DIALOG",
            windowLayer: 1,
            isActive: true,
            isFocused: true,
            hierarchy: {
              "resource-id": "android:id/content",
              "text": "Dialog Title",
              "bounds": "[100,800][980,1600]"
            }
          }
        ]
      );

      const result = UIStateExtractor.extract(hierarchy);

      expect(result).toBeDefined();
      expect(result!.modalStack).toBeDefined();
      // Should use text instead of android:id
      expect(result!.modalStack![0].identifier).toBe("Dialog Title");
    });

    test("should extract modals along with selected elements", () => {
      const hierarchy = createHierarchyWithWindows(
        {
          bounds: "[0,0][1080,2400]",
          node: {
            text: "Home",
            selected: "true",
            bounds: "[0,0][100,100]"
          }
        },
        [
          {
            windowId: 333,
            windowType: "TYPE_APPLICATION_PANEL",
            windowLayer: 1,
            isActive: true,
            isFocused: true,
            hierarchy: {
              class: "BottomSheetBehavior",
              bounds: "[0,1200][1080,2400]"
            }
          }
        ]
      );

      const result = UIStateExtractor.extract(hierarchy);

      expect(result).toBeDefined();
      expect(result!.selectedElements).toHaveLength(1);
      expect(result!.selectedElements[0].text).toBe("Home");
      expect(result!.modalStack).toBeDefined();
      expect(result!.modalStack!).toHaveLength(1);
      expect(result!.modalStack![0].type).toBe("bottomsheet");
    });
  });

  describe("createScrollPosition", () => {
    test("should return undefined when lookFor is not specified", () => {
      const options = {
        direction: "down" as const,
        platform: "android" as const
      };
      const result = UIStateExtractor.createScrollPosition(options);
      expect(result).toBeUndefined();
    });

    test("should create scroll position with target element", () => {
      const options = {
        direction: "down" as const,
        platform: "android" as const,
        lookFor: {
          text: "Advanced Settings"
        }
      };
      const result = UIStateExtractor.createScrollPosition(options);

      expect(result).toBeDefined();
      expect(result!.direction).toBe("down");
      expect(result!.targetElement.text).toBe("Advanced Settings");
      expect(result!.container).toBeUndefined();
      expect(result!.speed).toBeUndefined();
    });

    test("should create scroll position with container", () => {
      const options = {
        direction: "up" as const,
        platform: "android" as const,
        lookFor: {
          text: "Notification Settings",
          elementId: "com.app:id/notification_item"
        },
        container: {
          elementId: "com.app:id/settings_list"
        }
      };
      const result = UIStateExtractor.createScrollPosition(options);

      expect(result).toBeDefined();
      expect(result!.direction).toBe("up");
      expect(result!.targetElement.text).toBe("Notification Settings");
      expect(result!.targetElement.resourceId).toBe("com.app:id/notification_item");
      expect(result!.container).toBeDefined();
      expect(result!.container!.resourceId).toBe("com.app:id/settings_list");
      expect(result!.speed).toBeUndefined();
    });

    test("should create scroll position with speed", () => {
      const options = {
        direction: "down" as const,
        platform: "android" as const,
        lookFor: {
          text: "Developer Options"
        },
        speed: "slow" as const
      };
      const result = UIStateExtractor.createScrollPosition(options);

      expect(result).toBeDefined();
      expect(result!.direction).toBe("down");
      expect(result!.targetElement.text).toBe("Developer Options");
      expect(result!.speed).toBe("slow");
    });

    test("should create scroll position with all fields", () => {
      const options = {
        direction: "left" as const,
        platform: "android" as const,
        lookFor: {
          text: "Tab 3",
          elementId: "com.app:id/tab_3"
        },
        container: {
          text: "Tab Container",
          elementId: "com.app:id/tab_container"
        },
        speed: "fast" as const
      };
      const result = UIStateExtractor.createScrollPosition(options);

      expect(result).toBeDefined();
      expect(result!.direction).toBe("left");
      expect(result!.targetElement.text).toBe("Tab 3");
      expect(result!.targetElement.resourceId).toBe("com.app:id/tab_3");
      expect(result!.container!.text).toBe("Tab Container");
      expect(result!.container!.resourceId).toBe("com.app:id/tab_container");
      expect(result!.speed).toBe("fast");
    });
  });
});

// Helper function to create ViewHierarchyResult
function createHierarchy(hierarchy: Record<string, any>): ViewHierarchyResult {
  return {
    hierarchy,
    packageName: "com.test.app"
  };
}

// Helper function to create ViewHierarchyResult with windows
function createHierarchyWithWindows(
  hierarchy: Record<string, any>,
  windows: WindowHierarchy[]
): ViewHierarchyResult {
  return {
    hierarchy,
    packageName: "com.test.app",
    windows
  };
}
