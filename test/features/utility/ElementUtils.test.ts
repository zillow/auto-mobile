import { assert } from "chai";
import { ElementUtils } from "../../../src/features/utility/ElementUtils";
import { Element } from "../../../src/models/Element";

describe("ElementUtils", () => {
  let elementUtils: ElementUtils;

  const mockElement: Element = {
    bounds: { left: 10, top: 20, right: 100, bottom: 80 },
    class: "android.widget.Button",
    clickable: true,
    text: "Test Button"
  };

  beforeEach(() => {
    elementUtils = new ElementUtils();
  });

  describe("flattenViewHierarchy", () => {
    it("should flatten a simple view hierarchy", () => {
      const viewHierarchy = {
        hierarchy: {
          node: {
            $: {
              bounds: "[0,0][100,100]",
              class: "android.widget.FrameLayout",
              text: "Root"
            },
            node: [
              {
                $: {
                  bounds: "[10,10][50,50]",
                  class: "android.widget.Button",
                  text: "Button 1"
                }
              },
              {
                $: {
                  "bounds": "[60,60][90,90]",
                  "class": "android.widget.TextView",
                  "content-desc": "Text View"
                }
              }
            ]
          }
        }
      };

      const result = elementUtils.flattenViewHierarchy(viewHierarchy);

      assert.lengthOf(result, 3);
      assert.equal(result[0].index, 0);
      assert.equal(result[0].text, "Root");
      assert.equal(result[1].index, 1);
      assert.equal(result[1].text, "Button 1");
      assert.equal(result[2].index, 2);
      assert.equal(result[2].text, "Text View");
    });

    it("should handle empty view hierarchy", () => {
      const result = elementUtils.flattenViewHierarchy(null);
      assert.deepEqual(result, []);
    });

    it("should handle view hierarchy without parseable elements", () => {
      const viewHierarchy = {
        hierarchy: {
          node: {
            $: {
              // Missing bounds
              class: "android.widget.FrameLayout"
            }
          }
        }
      };

      const result = elementUtils.flattenViewHierarchy(viewHierarchy);
      assert.deepEqual(result, []);
    });

    it("should prefer text over content-desc", () => {
      const viewHierarchy = {
        hierarchy: {
          node: {
            $: {
              "bounds": "[0,0][100,100]",
              "class": "android.widget.Button",
              "text": "Button Text",
              "content-desc": "Button Description"
            }
          }
        }
      };

      const result = elementUtils.flattenViewHierarchy(viewHierarchy);

      assert.lengthOf(result, 1);
      assert.equal(result[0].text, "Button Text");
    });

    it("should use content-desc when text is not available", () => {
      const viewHierarchy = {
        hierarchy: {
          node: {
            $: {
              "bounds": "[0,0][100,100]",
              "class": "android.widget.ImageView",
              "content-desc": "Image Description"
            }
          }
        }
      };

      const result = elementUtils.flattenViewHierarchy(viewHierarchy);

      assert.lengthOf(result, 1);
      assert.equal(result[0].text, "Image Description");
    });
  });

  describe("findElementByIndex", () => {
    const mockViewHierarchy = {
      hierarchy: {
        node: {
          $: {
            bounds: "[0,0][100,100]",
            class: "android.widget.FrameLayout"
          },
          node: [
            {
              $: {
                bounds: "[10,10][50,50]",
                class: "android.widget.Button",
                text: "Button 1"
              }
            },
            {
              $: {
                bounds: "[60,60][90,90]",
                class: "android.widget.TextView",
                text: "Text View"
              }
            }
          ]
        }
      }
    };

    it("should find element by valid index", () => {
      const result = elementUtils.findElementByIndex(mockViewHierarchy, 1);

      assert.isNotNull(result);
      assert.deepEqual(result?.element.bounds, { left: 10, top: 10, right: 50, bottom: 50 });
      assert.equal(result?.text, "Button 1");
    });

    it("should return null for invalid index", () => {
      const result = elementUtils.findElementByIndex(mockViewHierarchy, 10);
      assert.isNull(result);
    });

    it("should return null for negative index", () => {
      const result = elementUtils.findElementByIndex(mockViewHierarchy, -1);
      assert.isNull(result);
    });

    it("should return null for empty view hierarchy", () => {
      const result = elementUtils.findElementByIndex(null, 0);
      assert.isNull(result);
    });

    it("should handle element without text", () => {
      const viewHierarchy = {
        hierarchy: {
          node: {
            $: {
              bounds: "[0,0][100,100]",
              class: "android.widget.View"
            }
          }
        }
      };

      const result = elementUtils.findElementByIndex(viewHierarchy, 0);

      assert.isNotNull(result);
      assert.isUndefined(result?.text);
    });
  });

  describe("validateElementText", () => {
    it("should return true when no expected text is provided", () => {
      const foundElement = {
        element: mockElement,
        text: "Some text"
      };

      const result = elementUtils.validateElementText(foundElement);
      assert.isTrue(result);
    });

    it("should return true when texts match", () => {
      const foundElement = {
        element: mockElement,
        text: "Button Text"
      };

      const result = elementUtils.validateElementText(foundElement, "Button Text");
      assert.isTrue(result);
    });

    it("should return true for fuzzy text match", () => {
      const foundElement = {
        element: mockElement,
        text: "Submit Button"
      };

      const result = elementUtils.validateElementText(foundElement, "Button");
      assert.isTrue(result);
    });

    it("should return false when expected text provided but element has no text", () => {
      const foundElement = {
        element: mockElement,
        text: undefined
      };

      const result = elementUtils.validateElementText(foundElement, "Expected Text");
      assert.isFalse(result);
    });

    it("should return false when texts do not match", () => {
      const foundElement = {
        element: mockElement,
        text: "Button Text"
      };

      const result = elementUtils.validateElementText(foundElement, "Different Text");
      assert.isFalse(result);
    });

    it("should handle case insensitive matching", () => {
      const foundElement = {
        element: mockElement,
        text: "SUBMIT BUTTON"
      };

      const result = elementUtils.validateElementText(foundElement, "submit");
      assert.isTrue(result);
    });
  });
});
