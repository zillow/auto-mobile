import { assert } from "chai";
import { UIStateExtractor } from "../../../src/features/navigation/UIStateExtractor";
import { ViewHierarchyResult, WindowHierarchy } from "../../../src/models";

describe("UIStateExtractor", () => {
  describe("extract", () => {
    it("should return undefined for undefined hierarchy", () => {
      const result = UIStateExtractor.extract(undefined);
      assert.isUndefined(result);
    });

    it("should return undefined for hierarchy without hierarchy property", () => {
      const result = UIStateExtractor.extract({} as ViewHierarchyResult);
      assert.isUndefined(result);
    });

    it("should return undefined when no selected elements or destination found", () => {
      const hierarchy = createHierarchy({
        bounds: "[0,0][1080,2400]",
        node: {
          text: "Some Text",
          bounds: "[0,0][100,100]"
        }
      });
      const result = UIStateExtractor.extract(hierarchy);
      assert.isUndefined(result);
    });

    it("should extract selected element with text", () => {
      const hierarchy = createHierarchy({
        bounds: "[0,0][1080,2400]",
        node: {
          text: "Home",
          selected: "true",
          bounds: "[0,0][100,100]"
        }
      });

      const result = UIStateExtractor.extract(hierarchy);

      assert.isDefined(result);
      assert.lengthOf(result!.selectedElements, 1);
      assert.equal(result!.selectedElements[0].text, "Home");
    });

    it("should extract selected element with resource-id", () => {
      const hierarchy = createHierarchy({
        bounds: "[0,0][1080,2400]",
        node: {
          "resource-id": "com.app:id/nav_home",
          "selected": "true",
          "bounds": "[0,0][100,100]"
        }
      });

      const result = UIStateExtractor.extract(hierarchy);

      assert.isDefined(result);
      assert.lengthOf(result!.selectedElements, 1);
      assert.equal(result!.selectedElements[0].resourceId, "com.app:id/nav_home");
    });

    it("should extract selected element with content-desc", () => {
      const hierarchy = createHierarchy({
        bounds: "[0,0][1080,2400]",
        node: {
          "content-desc": "Home Tab",
          "selected": "true",
          "bounds": "[0,0][100,100]"
        }
      });

      const result = UIStateExtractor.extract(hierarchy);

      assert.isDefined(result);
      assert.lengthOf(result!.selectedElements, 1);
      assert.equal(result!.selectedElements[0].contentDesc, "Home Tab");
    });

    it("should extract multiple selected elements", () => {
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

      assert.isDefined(result);
      assert.lengthOf(result!.selectedElements, 2);
      assert.equal(result!.selectedElements[0].text, "Tab1");
      assert.equal(result!.selectedElements[1].text, "Tab2");
    });

    it("should extract nested selected elements", () => {
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

      assert.isDefined(result);
      assert.lengthOf(result!.selectedElements, 1);
      assert.equal(result!.selectedElements[0].text, "NestedTab");
    });

    it("should extract destinationId from resource-id", () => {
      const hierarchy = createHierarchy({
        bounds: "[0,0][1080,2400]",
        node: {
          "resource-id": "navigation.HomeDestination",
          "bounds": "[0,0][1080,2400]"
        }
      });

      const result = UIStateExtractor.extract(hierarchy);

      assert.isDefined(result);
      assert.equal(result!.destinationId, "HomeDestination");
    });

    it("should extract text from child nodes for Compose layouts", () => {
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

      assert.isDefined(result);
      assert.lengthOf(result!.selectedElements, 1);
      assert.equal(result!.selectedElements[0].text, "ChildText");
    });

    it("should ignore elements with selected=false", () => {
      const hierarchy = createHierarchy({
        bounds: "[0,0][1080,2400]",
        node: {
          text: "NotSelected",
          selected: "false",
          bounds: "[0,0][100,100]"
        }
      });

      const result = UIStateExtractor.extract(hierarchy);

      assert.isUndefined(result);
    });

    it("should not include elements without identifier", () => {
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
      assert.isUndefined(result);
    });

    it("should extract both selected elements and destinationId", () => {
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

      assert.isDefined(result);
      assert.equal(result!.destinationId, "SettingsDestination");
      assert.lengthOf(result!.selectedElements, 1);
      assert.equal(result!.selectedElements[0].text, "General");
    });

    it("should handle array of child nodes", () => {
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

      assert.isDefined(result);
      assert.lengthOf(result!.selectedElements, 1);
      assert.equal(result!.selectedElements[0].text, "Second");
    });

    it("should handle real-world tab navigation hierarchy", () => {
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

      assert.isDefined(result);
      assert.equal(result!.destinationId, "HomeDestination");
      assert.lengthOf(result!.selectedElements, 1);
      assert.equal(result!.selectedElements[0].text, "Media");
    });
  });

  describe("modal extraction", () => {
    it("should extract dialog modal from windows array", () => {
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

      assert.isDefined(result);
      assert.isDefined(result!.modalStack);
      assert.lengthOf(result!.modalStack!, 1);
      assert.equal(result!.modalStack![0].type, "dialog");
      assert.equal(result!.modalStack![0].windowId, 123);
      assert.equal(result!.modalStack![0].layer, 1);
    });

    it("should extract bottom sheet modal from windows array", () => {
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

      assert.isDefined(result);
      assert.isDefined(result!.modalStack);
      assert.lengthOf(result!.modalStack!, 1);
      assert.equal(result!.modalStack![0].type, "bottomsheet");
      assert.equal(result!.modalStack![0].windowId, 456);
      assert.equal(result!.modalStack![0].identifier, "com.app:id/settings_bottom_sheet");
    });

    it("should extract popup modal from windows array", () => {
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

      assert.isDefined(result);
      assert.isDefined(result!.modalStack);
      assert.lengthOf(result!.modalStack!, 1);
      assert.equal(result!.modalStack![0].type, "popup");
      assert.equal(result!.modalStack![0].identifier, "More options");
    });

    it("should extract multiple modals and sort by layer", () => {
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

      assert.isDefined(result);
      assert.isDefined(result!.modalStack);
      assert.lengthOf(result!.modalStack!, 2);
      // Should be sorted by layer (bottom to top)
      assert.equal(result!.modalStack![0].layer, 1);
      assert.equal(result!.modalStack![0].type, "bottomsheet");
      assert.equal(result!.modalStack![1].layer, 3);
      assert.equal(result!.modalStack![1].type, "dialog");
    });

    it("should extract menu modal from windows array", () => {
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

      assert.isDefined(result);
      assert.isDefined(result!.modalStack);
      assert.lengthOf(result!.modalStack!, 1);
      assert.equal(result!.modalStack![0].type, "menu");
    });

    it("should not extract non-modal windows", () => {
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
      assert.isUndefined(result);
    });

    it("should prefer resource-id over text for modal identifier", () => {
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

      assert.isDefined(result);
      assert.isDefined(result!.modalStack);
      assert.equal(result!.modalStack![0].identifier, "com.app:id/confirmation_dialog");
    });

    it("should skip android system IDs for modal identifier", () => {
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

      assert.isDefined(result);
      assert.isDefined(result!.modalStack);
      // Should use text instead of android:id
      assert.equal(result!.modalStack![0].identifier, "Dialog Title");
    });

    it("should extract modals along with selected elements", () => {
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

      assert.isDefined(result);
      assert.lengthOf(result!.selectedElements, 1);
      assert.equal(result!.selectedElements[0].text, "Home");
      assert.isDefined(result!.modalStack);
      assert.lengthOf(result!.modalStack!, 1);
      assert.equal(result!.modalStack![0].type, "bottomsheet");
    });
  });

  describe("createScrollPosition", () => {
    it("should return undefined when lookFor is not specified", () => {
      const options = {
        direction: "down" as const,
        platform: "android" as const
      };
      const result = UIStateExtractor.createScrollPosition(options);
      assert.isUndefined(result);
    });

    it("should create scroll position with target element", () => {
      const options = {
        direction: "down" as const,
        platform: "android" as const,
        lookFor: {
          text: "Advanced Settings"
        }
      };
      const result = UIStateExtractor.createScrollPosition(options);

      assert.isDefined(result);
      assert.equal(result!.direction, "down");
      assert.equal(result!.targetElement.text, "Advanced Settings");
      assert.isUndefined(result!.container);
      assert.isUndefined(result!.speed);
    });

    it("should create scroll position with container", () => {
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

      assert.isDefined(result);
      assert.equal(result!.direction, "up");
      assert.equal(result!.targetElement.text, "Notification Settings");
      assert.equal(result!.targetElement.resourceId, "com.app:id/notification_item");
      assert.isDefined(result!.container);
      assert.equal(result!.container!.resourceId, "com.app:id/settings_list");
      assert.isUndefined(result!.speed);
    });

    it("should create scroll position with speed", () => {
      const options = {
        direction: "down" as const,
        platform: "android" as const,
        lookFor: {
          text: "Developer Options"
        },
        speed: "slow" as const
      };
      const result = UIStateExtractor.createScrollPosition(options);

      assert.isDefined(result);
      assert.equal(result!.direction, "down");
      assert.equal(result!.targetElement.text, "Developer Options");
      assert.equal(result!.speed, "slow");
    });

    it("should create scroll position with all fields", () => {
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

      assert.isDefined(result);
      assert.equal(result!.direction, "left");
      assert.equal(result!.targetElement.text, "Tab 3");
      assert.equal(result!.targetElement.resourceId, "com.app:id/tab_3");
      assert.equal(result!.container!.text, "Tab Container");
      assert.equal(result!.container!.resourceId, "com.app:id/tab_container");
      assert.equal(result!.speed, "fast");
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
