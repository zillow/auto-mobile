import { assert } from "chai";
import { ElementUtils } from "../../../src/features/utility/ElementUtils";
import { Element } from "../../../src/models";
import { ObserveResult } from "../../../src/models";

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

  // Helper function to create mock ObserveResult
  const createMockObserveResult = (viewHierarchy?: any): ObserveResult => ({
    timestamp: Date.now(),
    screenSize: { width: 1080, height: 1920 },
    systemInsets: { top: 48, bottom: 120, left: 0, right: 0 },
    viewHierarchy: viewHierarchy || { hierarchy: { node: {} } }
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

      const mockObserveResult = createMockObserveResult(viewHierarchy);
      const result = elementUtils.flattenViewHierarchy(mockObserveResult.viewHierarchy);

      assert.lengthOf(result, 3);
      assert.equal(result[0].index, 0);
      assert.equal(result[0].text, "Root");
      assert.equal(result[1].index, 1);
      assert.equal(result[1].text, "Button 1");
      assert.equal(result[2].index, 2);
      assert.equal(result[2].text, "Text View");
    });

    it("should handle empty view hierarchy", () => {
      const result = elementUtils.flattenViewHierarchy(null as any);
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

      const mockObserveResult = createMockObserveResult(viewHierarchy);
      const result = elementUtils.flattenViewHierarchy(mockObserveResult.viewHierarchy);
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

      const mockObserveResult = createMockObserveResult(viewHierarchy);
      const result = elementUtils.flattenViewHierarchy(mockObserveResult.viewHierarchy);

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

      const mockObserveResult = createMockObserveResult(viewHierarchy);
      const result = elementUtils.flattenViewHierarchy(mockObserveResult.viewHierarchy);

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
      const mockObserveResult = createMockObserveResult(mockViewHierarchy);
      const result = elementUtils.findElementByIndex(mockObserveResult.viewHierarchy, 1);

      assert.isNotNull(result);
      assert.deepEqual(result?.element.bounds, { left: 10, top: 10, right: 50, bottom: 50 });
      assert.equal(result?.text, "Button 1");
    });

    it("should return null for invalid index", () => {
      const mockObserveResult = createMockObserveResult(mockViewHierarchy);
      const result = elementUtils.findElementByIndex(mockObserveResult.viewHierarchy, 10);
      assert.isNull(result);
    });

    it("should return null for negative index", () => {
      const mockObserveResult = createMockObserveResult(mockViewHierarchy);
      const result = elementUtils.findElementByIndex(mockObserveResult.viewHierarchy, -1);
      assert.isNull(result);
    });

    it("should return null for empty view hierarchy", () => {
      const result = elementUtils.findElementByIndex(null as any, 0);
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

      const mockObserveResult = createMockObserveResult(viewHierarchy);
      const result = elementUtils.findElementByIndex(mockObserveResult.viewHierarchy, 0);

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

  describe("findElementByText", () => {
    const mockViewHierarchyWithContainer = {
      hierarchy: {
        node: {
          $: {
            "bounds": "[0,0][1080,2400]",
            "class": "android.widget.FrameLayout",
            "resource-id": "android:id/content"
          },
          node: [
            {
              $: {
                "bounds": "[0,0][1080,800]",
                "class": "android.widget.LinearLayout",
                "resource-id": "com.example:id/header_container"
              },
              node: [
                {
                  $: {
                    "bounds": "[100,100][500,200]",
                    "class": "android.widget.TextView",
                    "text": "Header Text"
                  }
                }
              ]
            },
            {
              $: {
                "bounds": "[0,800][1080,2000]",
                "class": "android.widget.ScrollView",
                "resource-id": "com.example:id/main_container"
              },
              node: [
                {
                  $: {
                    "bounds": "[50,850][1030,950]",
                    "class": "android.widget.TextView",
                    "text": "Item 1"
                  }
                },
                {
                  $: {
                    "bounds": "[50,950][1030,1050]",
                    "class": "android.widget.EditText",
                    "text": "Item 2"
                  }
                },
                {
                  $: {
                    "bounds": "[50,1050][1030,1150]",
                    "class": "android.widget.TextView",
                    "text": "Item 3"
                  }
                }
              ]
            }
          ]
        }
      }
    };

    it("should find element by text within specified container", () => {
      const mockObserveResult = createMockObserveResult(mockViewHierarchyWithContainer);
      const result = elementUtils.findElementByText(
        mockObserveResult.viewHierarchy,
        "Item 1",
        "main_container",
        true,
        false
      );

      assert.isNotNull(result);
      assert.equal(result?.text, "Item 1");
      assert.deepEqual(result?.bounds, { left: 50, top: 850, right: 1030, bottom: 950 });
    });

    it("should not find element when it's outside the specified container", () => {
      const mockObserveResult = createMockObserveResult(mockViewHierarchyWithContainer);
      const result = elementUtils.findElementByText(
        mockObserveResult.viewHierarchy,
        "Header Text",
        "main_container",
        true,
        false
      );

      assert.isNull(result);
    });

    it("should return null when container is not found", () => {
      const mockObserveResult = createMockObserveResult(mockViewHierarchyWithContainer);
      const result = elementUtils.findElementByText(
        mockObserveResult.viewHierarchy,
        "Item 1",
        "non_existent_container",
        true,
        false
      );

      assert.isNull(result);
    });

    it("should find element regardless of element type", () => {
      const mockObserveResult = createMockObserveResult(mockViewHierarchyWithContainer);
      const result = elementUtils.findElementByText(
        mockObserveResult.viewHierarchy,
        "Item 2",
        "main_container",
        true,
        false
      );

      assert.isNotNull(result);
      assert.equal(result?.text, "Item 2");
      assert.include(result?.class || "", "EditText");
    });

    it("should find all matching elements including different types", () => {
      const mockObserveResult = createMockObserveResult(mockViewHierarchyWithContainer);
      const result = elementUtils.findElementByText(
        mockObserveResult.viewHierarchy,
        "Item",
        "main_container",
        true, // fuzzy match enabled
        false
      );

      assert.isNotNull(result);
      assert.include(result?.text || "", "Item");
    });

    it("should handle exact text matching", () => {
      const mockObserveResult = createMockObserveResult(mockViewHierarchyWithContainer);
      const result = elementUtils.findElementByText(
        mockObserveResult.viewHierarchy,
        "Item",
        "main_container",
        false, // fuzzy match disabled
        false
      );

      assert.isNull(result); // Should not find partial matches
    });

    it("should handle case-sensitive matching", () => {
      const mockObserveResult = createMockObserveResult(mockViewHierarchyWithContainer);
      const result = elementUtils.findElementByText(
        mockObserveResult.viewHierarchy,
        "item 1", // lowercase
        "main_container",
        true,
        true // case sensitive
      );

      assert.isNull(result); // Should not find due to case mismatch
    });

    it("should handle case-insensitive matching", () => {
      const mockObserveResult = createMockObserveResult(mockViewHierarchyWithContainer);
      const result = elementUtils.findElementByText(
        mockObserveResult.viewHierarchy,
        "item 1", // lowercase
        "main_container",
        true,
        false // case-insensitive
      );

      assert.isNotNull(result);
      assert.equal(result?.text, "Item 1");
    });

    it("should prefer smaller elements when multiple matches exist", () => {
      const hierarchyWithMultipleMatches = {
        hierarchy: {
          node: {
            $: {
              "bounds": "[0,0][1080,2400]",
              "class": "android.widget.FrameLayout",
              "resource-id": "com.example:id/container"
            },
            node: [
              {
                $: {
                  "bounds": "[0,0][1080,500]", // Larger element
                  "class": "android.widget.TextView",
                  "text": "Click me"
                }
              },
              {
                $: {
                  "bounds": "[400,200][680,300]", // Smaller element
                  "class": "android.widget.TextView",
                  "text": "Click me"
                }
              }
            ]
          }
        }
      };

      const mockObserveResult = createMockObserveResult(hierarchyWithMultipleMatches);
      const result = elementUtils.findElementByText(
        mockObserveResult.viewHierarchy,
        "Click me",
        "container",
        true,
        false
      );

      assert.isNotNull(result);
      // Should return the smaller element
      assert.deepEqual(result?.bounds, { left: 400, top: 200, right: 680, bottom: 300 });
    });

    it("should handle content-desc attribute", () => {
      const hierarchyWithContentDesc = {
        hierarchy: {
          node: {
            $: {
              "bounds": "[0,0][1080,2400]",
              "class": "android.widget.FrameLayout",
              "resource-id": "com.example:id/container"
            },
            node: [
              {
                $: {
                  "bounds": "[100,100][300,200]",
                  "class": "android.widget.ImageView",
                  "content-desc": "Profile Picture"
                }
              }
            ]
          }
        }
      };

      const mockObserveResult = createMockObserveResult(hierarchyWithContentDesc);
      const result = elementUtils.findElementByText(
        mockObserveResult.viewHierarchy,
        "Profile Picture",
        "container",
        true,
        false
      );

      assert.isNotNull(result);
      assert.deepEqual(result?.bounds, { left: 100, top: 100, right: 300, bottom: 200 });
    });

    it("should handle missing required parameters", () => {
      // Missing viewHierarchy
      let result = elementUtils.findElementByText(
        null as any,
        "text",
        "container",
        true,
        false
      );
      assert.isNull(result);

      // Missing text
      const mockObserveResult = createMockObserveResult(mockViewHierarchyWithContainer);
      result = elementUtils.findElementByText(
        mockObserveResult.viewHierarchy,
        "",
        "container",
        true,
        false
      );
      assert.isNull(result);
    });

    it("should handle nested containers", () => {
      const nestedHierarchy = {
        hierarchy: {
          node: {
            $: {
              "bounds": "[0,0][1080,2400]",
              "class": "android.widget.FrameLayout",
              "resource-id": "com.example:id/root"
            },
            node: [
              {
                $: {
                  "bounds": "[0,0][1080,1200]",
                  "class": "android.widget.LinearLayout",
                  "resource-id": "com.example:id/outer_container"
                },
                node: [
                  {
                    $: {
                      "bounds": "[100,100][980,1000]",
                      "class": "android.widget.FrameLayout",
                      "resource-id": "com.example:id/inner_container"
                    },
                    node: [
                      {
                        $: {
                          "bounds": "[200,200][800,300]",
                          "class": "android.widget.TextView",
                          "text": "Nested Text"
                        }
                      }
                    ]
                  }
                ]
              }
            ]
          }
        }
      };

      const mockObserveResult = createMockObserveResult(nestedHierarchy);

      // Should find in inner container
      let result = elementUtils.findElementByText(
        mockObserveResult.viewHierarchy,
        "Nested Text",
        "inner_container",
        true,
        false
      );
      assert.isNotNull(result);

      // Should also find when searching in outer container
      result = elementUtils.findElementByText(
        mockObserveResult.viewHierarchy,
        "Nested Text",
        "outer_container",
        true,
        false
      );
      assert.isNotNull(result);
    });
  });
});
