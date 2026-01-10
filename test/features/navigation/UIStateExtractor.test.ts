import { expect, describe, test } from "bun:test";
import { UIStateExtractor } from "../../../src/features/navigation/UIStateExtractor";
import { ViewHierarchyResult } from "../../../src/models";

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
