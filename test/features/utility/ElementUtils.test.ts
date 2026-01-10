import { expect, describe, test, beforeEach } from "bun:test";
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
  const createObserveResult = (viewHierarchy?: any): ObserveResult => ({
    timestamp: Date.now(),
    screenSize: { width: 1080, height: 1920 },
    systemInsets: { top: 48, bottom: 120, left: 0, right: 0 },
    viewHierarchy: viewHierarchy || { hierarchy: { node: {} } }
  });

  describe("flattenViewHierarchy", () => {
    test("should flatten a simple view hierarchy", () => {
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

      const mockObserveResult = createObserveResult(viewHierarchy);
      const result = elementUtils.flattenViewHierarchy(mockObserveResult.viewHierarchy);

      expect(result.length).toBe(3);
      expect(result[0].index).toBe(0);
      expect(result[0].text).toBe("Root");
      expect(result[1].index).toBe(1);
      expect(result[1].text).toBe("Button 1");
      expect(result[2].index).toBe(2);
      expect(result[2].text).toBe("Text View");
    });

    test("should handle empty view hierarchy", () => {
      const result = elementUtils.flattenViewHierarchy(null as any);
      expect(result).toEqual([]);
    });

    test("should handle view hierarchy without parseable elements", () => {
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

      const mockObserveResult = createObserveResult(viewHierarchy);
      const result = elementUtils.flattenViewHierarchy(mockObserveResult.viewHierarchy);
      expect(result).toEqual([]);
    });

    test("should prefer text over content-desc", () => {
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

      const mockObserveResult = createObserveResult(viewHierarchy);
      const result = elementUtils.flattenViewHierarchy(mockObserveResult.viewHierarchy);

      expect(result.length).toBe(1);
      expect(result[0].text).toBe("Button Text");
    });

    test("should use content-desc when text is not available", () => {
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

      const mockObserveResult = createObserveResult(viewHierarchy);
      const result = elementUtils.flattenViewHierarchy(mockObserveResult.viewHierarchy);

      expect(result.length).toBe(1);
      expect(result[0].text).toBe("Image Description");
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

    test("should find element by valid index", () => {
      const mockObserveResult = createObserveResult(mockViewHierarchy);
      const result = elementUtils.findElementByIndex(mockObserveResult.viewHierarchy, 1);

      expect(result).not.toBeNull();
      expect(result?.element.bounds).toEqual({ left: 10, top: 10, right: 50, bottom: 50 });
      expect(result?.text).toBe("Button 1");
    });

    test("should return null for invalid index", () => {
      const mockObserveResult = createObserveResult(mockViewHierarchy);
      const result = elementUtils.findElementByIndex(mockObserveResult.viewHierarchy, 10);
      expect(result).toBeNull();
    });

    test("should return null for negative index", () => {
      const mockObserveResult = createObserveResult(mockViewHierarchy);
      const result = elementUtils.findElementByIndex(mockObserveResult.viewHierarchy, -1);
      expect(result).toBeNull();
    });

    test("should return null for empty view hierarchy", () => {
      const result = elementUtils.findElementByIndex(null as any, 0);
      expect(result).toBeNull();
    });

    test("should handle element without text", () => {
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

      const mockObserveResult = createObserveResult(viewHierarchy);
      const result = elementUtils.findElementByIndex(mockObserveResult.viewHierarchy, 0);

      expect(result).not.toBeNull();
      expect(result?.text).toBeUndefined();
    });
  });

  describe("validateElementText", () => {
    test("should return true when no expected text is provided", () => {
      const foundElement = {
        element: mockElement,
        text: "Some text"
      };

      const result = elementUtils.validateElementText(foundElement);
      expect(result).toBe(true);
    });

    test("should return true when texts match", () => {
      const foundElement = {
        element: mockElement,
        text: "Button Text"
      };

      const result = elementUtils.validateElementText(foundElement, "Button Text");
      expect(result).toBe(true);
    });

    test("should return true for fuzzy text match", () => {
      const foundElement = {
        element: mockElement,
        text: "Submit Button"
      };

      const result = elementUtils.validateElementText(foundElement, "Button");
      expect(result).toBe(true);
    });

    test("should return false when expected text provided but element has no text", () => {
      const foundElement = {
        element: mockElement,
        text: undefined
      };

      const result = elementUtils.validateElementText(foundElement, "Expected Text");
      expect(result).toBe(false);
    });

    test("should return false when texts do not match", () => {
      const foundElement = {
        element: mockElement,
        text: "Button Text"
      };

      const result = elementUtils.validateElementText(foundElement, "Different Text");
      expect(result).toBe(false);
    });

    test("should handle case insensitive matching", () => {
      const foundElement = {
        element: mockElement,
        text: "SUBMIT BUTTON"
      };

      const result = elementUtils.validateElementText(foundElement, "submit");
      expect(result).toBe(true);
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

    test("should find element by text within specified container", () => {
      const mockObserveResult = createObserveResult(mockViewHierarchyWithContainer);
      const result = elementUtils.findElementByText(
        mockObserveResult.viewHierarchy,
        "Item 1",
        { elementId: "com.example:id/main_container" },
        true,
        false
      );

      expect(result).not.toBeNull();
      expect(result?.text).toBe("Item 1");
      expect(result?.bounds).toEqual({ left: 50, top: 850, right: 1030, bottom: 950 });
    });

    test("should not find element when it's outside the specified container", () => {
      const mockObserveResult = createObserveResult(mockViewHierarchyWithContainer);
      const result = elementUtils.findElementByText(
        mockObserveResult.viewHierarchy,
        "Header Text",
        { elementId: "com.example:id/main_container" },
        true,
        false
      );

      expect(result).toBeNull();
    });

    test("should return null when container is not found", () => {
      const mockObserveResult = createObserveResult(mockViewHierarchyWithContainer);
      const result = elementUtils.findElementByText(
        mockObserveResult.viewHierarchy,
        "Item 1",
        { elementId: "com.example:id/non_existent_container" },
        true,
        false
      );

      expect(result).toBeNull();
    });

    test("should find element regardless of element type", () => {
      const mockObserveResult = createObserveResult(mockViewHierarchyWithContainer);
      const result = elementUtils.findElementByText(
        mockObserveResult.viewHierarchy,
        "Item 2",
        { elementId: "com.example:id/main_container" },
        true,
        false
      );

      expect(result).not.toBeNull();
      expect(result?.text).toBe("Item 2");
      expect(result?.class || "").toContain("EditText");
    });

    test("should find all matching elements including different types", () => {
      const mockObserveResult = createObserveResult(mockViewHierarchyWithContainer);
      const result = elementUtils.findElementByText(
        mockObserveResult.viewHierarchy,
        "Item",
        { elementId: "com.example:id/main_container" },
        true, // fuzzy match enabled
        false
      );

      expect(result).not.toBeNull();
      expect(result?.text || "").toContain("Item");
    });

    test("should handle exact text matching", () => {
      const mockObserveResult = createObserveResult(mockViewHierarchyWithContainer);
      const result = elementUtils.findElementByText(
        mockObserveResult.viewHierarchy,
        "Item",
        { elementId: "com.example:id/main_container" },
        false, // fuzzy match disabled
        false
      );

      expect(result).toBeNull(); // Should not find partial matches
    });

    test("should handle case-sensitive matching", () => {
      const mockObserveResult = createObserveResult(mockViewHierarchyWithContainer);
      const result = elementUtils.findElementByText(
        mockObserveResult.viewHierarchy,
        "item 1", // lowercase
        { elementId: "com.example:id/main_container" },
        true,
        true // case sensitive
      );

      expect(result).toBeNull(); // Should not find due to case mismatch
    });

    test("should handle case-insensitive matching", () => {
      const mockObserveResult = createObserveResult(mockViewHierarchyWithContainer);
      const result = elementUtils.findElementByText(
        mockObserveResult.viewHierarchy,
        "item 1", // lowercase
        { elementId: "com.example:id/main_container" },
        true,
        false // case-insensitive
      );

      expect(result).not.toBeNull();
      expect(result?.text).toBe("Item 1");
    });

    test("should prefer smaller elements when multiple matches exist", () => {
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

      const mockObserveResult = createObserveResult(hierarchyWithMultipleMatches);
      const result = elementUtils.findElementByText(
        mockObserveResult.viewHierarchy,
        "Click me",
        { elementId: "com.example:id/container" },
        true,
        false
      );

      expect(result).not.toBeNull();
      // Should return the smaller element
      expect(result?.bounds).toEqual({ left: 400, top: 200, right: 680, bottom: 300 });
    });

    test("should handle content-desc attribute", () => {
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

      const mockObserveResult = createObserveResult(hierarchyWithContentDesc);
      const result = elementUtils.findElementByText(
        mockObserveResult.viewHierarchy,
        "Profile Picture",
        { elementId: "com.example:id/container" },
        true,
        false
      );

      expect(result).not.toBeNull();
      expect(result?.bounds).toEqual({ left: 100, top: 100, right: 300, bottom: 200 });
    });

    test("should handle missing required parameters", () => {
      // Missing viewHierarchy
      let result = elementUtils.findElementByText(
        null as any,
        "text",
        { elementId: "com.example:id/container" },
        true,
        false
      );
      expect(result).toBeNull();

      // Missing text
      const mockObserveResult = createObserveResult(mockViewHierarchyWithContainer);
      result = elementUtils.findElementByText(
        mockObserveResult.viewHierarchy,
        "",
        { elementId: "com.example:id/container" },
        true,
        false
      );
      expect(result).toBeNull();
    });

    test("should handle nested containers", () => {
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

      const mockObserveResult = createObserveResult(nestedHierarchy);

      // Should find in inner container
      let result = elementUtils.findElementByText(
        mockObserveResult.viewHierarchy,
        "Nested Text",
        { elementId: "com.example:id/inner_container" },
        true,
        false
      );
      expect(result).not.toBeNull();

      // Should also find when searching in outer container
      result = elementUtils.findElementByText(
        mockObserveResult.viewHierarchy,
        "Nested Text",
        { elementId: "com.example:id/outer_container" },
        true,
        false
      );
      expect(result).not.toBeNull();
    });

    test("should fall back to the topmost window when main hierarchy has no match", () => {
      const hierarchyWithWindows = {
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
                  class: "android.widget.TextView",
                  text: "Main"
                }
              }
            ]
          }
        },
        windows: [
          {
            windowId: 1,
            windowType: "popup",
            windowLayer: 5,
            isActive: true,
            isFocused: true,
            hierarchy: {
              $: {
                bounds: "[0,0][50,50]",
                class: "android.widget.TextView",
                text: "Cancel"
              }
            }
          },
          {
            windowId: 2,
            windowType: "input_method",
            windowLayer: 10,
            isActive: true,
            isFocused: true,
            hierarchy: {
              $: {
                bounds: "[0,0][80,80]",
                class: "android.widget.TextView",
                text: "Cancel"
              }
            }
          }
        ]
      };

      const mockObserveResult = createObserveResult(hierarchyWithWindows);
      const result = elementUtils.findElementByText(
        mockObserveResult.viewHierarchy,
        "Cancel",
        null,
        true,
        false
      );

      expect(result).not.toBeNull();
      expect(result?.bounds).toEqual({ left: 0, top: 0, right: 80, bottom: 80 });
    });

    test("should prefer main hierarchy matches over window matches", () => {
      const hierarchyWithMainAndWindowMatch = {
        hierarchy: {
          node: {
            $: {
              bounds: "[0,0][300,300]",
              class: "android.widget.FrameLayout"
            },
            node: [
              {
                $: {
                  bounds: "[20,20][200,200]",
                  class: "android.widget.TextView",
                  text: "Cancel"
                }
              }
            ]
          }
        },
        windows: [
          {
            windowId: 3,
            windowType: "input_method",
            windowLayer: 15,
            isActive: true,
            isFocused: true,
            hierarchy: {
              $: {
                bounds: "[0,0][50,50]",
                class: "android.widget.TextView",
                text: "Cancel"
              }
            }
          }
        ]
      };

      const mockObserveResult = createObserveResult(hierarchyWithMainAndWindowMatch);
      const result = elementUtils.findElementByText(
        mockObserveResult.viewHierarchy,
        "Cancel",
        null,
        true,
        false
      );

      expect(result).not.toBeNull();
      expect(result?.bounds).toEqual({ left: 20, top: 20, right: 200, bottom: 200 });
    });
  });

  describe("findElementByResourceId", () => {
    test("should fall back to the topmost window when main hierarchy has no match", () => {
      const hierarchyWithWindows = {
        hierarchy: {
          node: {
            $: {
              bounds: "[0,0][100,100]",
              class: "android.widget.FrameLayout"
            }
          }
        },
        windows: [
          {
            windowId: 10,
            windowType: "popup",
            windowLayer: 3,
            isActive: true,
            isFocused: true,
            hierarchy: {
              $: {
                bounds: "[0,0][40,40]",
                class: "android.widget.Button",
                "resource-id": "com.example:id/cancel_button"
              }
            }
          },
          {
            windowId: 11,
            windowType: "input_method",
            windowLayer: 8,
            isActive: true,
            isFocused: true,
            hierarchy: {
              $: {
                bounds: "[0,0][90,90]",
                class: "android.widget.Button",
                "resource-id": "com.example:id/cancel_button"
              }
            }
          }
        ]
      };

      const mockObserveResult = createObserveResult(hierarchyWithWindows);
      const result = elementUtils.findElementByResourceId(
        mockObserveResult.viewHierarchy,
        "com.example:id/cancel_button"
      );

      expect(result).not.toBeNull();
      expect(result?.bounds).toEqual({ left: 0, top: 0, right: 90, bottom: 90 });
    });

    test("should prefer main hierarchy matches over window matches", () => {
      const hierarchyWithMainAndWindowMatch = {
        hierarchy: {
          node: {
            $: {
              bounds: "[0,0][300,300]",
              class: "android.widget.FrameLayout"
            },
            node: [
              {
                $: {
                  bounds: "[30,30][220,220]",
                  class: "android.widget.Button",
                  "resource-id": "com.example:id/cancel_button"
                }
              }
            ]
          }
        },
        windows: [
          {
            windowId: 12,
            windowType: "popup",
            windowLayer: 12,
            isActive: true,
            isFocused: true,
            hierarchy: {
              $: {
                bounds: "[0,0][60,60]",
                class: "android.widget.Button",
                "resource-id": "com.example:id/cancel_button"
              }
            }
          }
        ]
      };

      const mockObserveResult = createObserveResult(hierarchyWithMainAndWindowMatch);
      const result = elementUtils.findElementByResourceId(
        mockObserveResult.viewHierarchy,
        "com.example:id/cancel_button"
      );

      expect(result).not.toBeNull();
      expect(result?.bounds).toEqual({ left: 30, top: 30, right: 220, bottom: 220 });
    });
  });
});
