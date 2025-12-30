import { assert } from "chai";
import { UIStateExtractor } from "../../../src/features/navigation/UIStateExtractor";
import { ViewHierarchyResult } from "../../../src/models";

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
          selected: "true",
          bounds: "[0,0][100,100]"
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
          selected: "true",
          bounds: "[0,0][100,100]"
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
          bounds: "[0,0][1080,2400]"
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
          bounds: "[0,0][1080,2400]",
          node: {
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
          bounds: "[0,0][1080,2400]",
          node: {
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
});

// Helper function to create ViewHierarchyResult
function createHierarchy(hierarchy: Record<string, any>): ViewHierarchyResult {
  return {
    hierarchy,
    packageName: "com.test.app"
  };
}
