import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ViewHierarchy } from "../../../src/features/observe/ViewHierarchy";
import { FakeAdbClientFactory } from "../../fakes/FakeAdbClientFactory";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import { BootedDevice } from "../../../src/models/DeviceInfo";
import { CtrlProxyClient } from "../../../src/features/observe/android";
import fs from "fs-extra";
import { promisify } from "util";

// Create a mock readFile function that returns some fake screenshot data
const mockReadFile = promisify((path: string, callback: (err: any, data?: Buffer) => void) => {
  // Return fake screenshot data for any path
  setImmediate(() => callback(null, Buffer.from("fake screenshot data")));
});

// Override the readFileAsync function for tests that need it
const originalReadFile = fs.readFile;
const setupReadFileMock = () => {
  (fs as any).readFile = mockReadFile;
};
const teardownReadFileMock = () => {
  (fs as any).readFile = originalReadFile;
};

describe("ViewHierarchy", function() {
  describe("Unit Tests for Public Methods", function() {
    let viewHierarchy: ViewHierarchy;
    let fakeAdbFactory: FakeAdbClientFactory;
    let mockCtrlProxyClient: CtrlProxyClient;
    let mockDevice: BootedDevice;

    beforeEach(function() {
      mockDevice = {
        deviceId: "test-device",
        name: "Test Device",
        platform: "android"
      };
      // Create fakes for testing
      fakeAdbFactory = new FakeAdbClientFactory();

      mockCtrlProxyClient = {
        getLatestHierarchy: async () => null,
        convertToViewHierarchyResult: () => ({ hierarchy: {} }),
        convertAccessibilityNode: () => ({}),
        getAccessibilityHierarchy: async () => null
      } as unknown as CtrlProxyClient;

      viewHierarchy = new ViewHierarchy(mockDevice, fakeAdbFactory, mockCtrlProxyClient);
      setupReadFileMock();
    });

    afterEach(function() {
      teardownReadFileMock();
    });

    test("should identify string filter criteria correctly", function() {
      const propsWithText = { text: "Button Text" };
      const propsWithResourceId = { "resource-id": "com.app:id/button" };
      const propsWithContentDesc = { "content-desc": "Button description" };
      const propsEmpty = { clickable: "true" };

      // Now that the method is public, we can call it directly
      expect(viewHierarchy.meetsStringFilterCriteria(propsWithText)).toBe(true);
      expect(viewHierarchy.meetsStringFilterCriteria(propsWithResourceId)).toBe(true);
      expect(viewHierarchy.meetsStringFilterCriteria(propsWithContentDesc)).toBe(true);
      expect(viewHierarchy.meetsStringFilterCriteria(propsEmpty)).toBe(false);
    });

    test("should identify boolean filter criteria correctly", function() {
      const propsClickable = { clickable: "true" };
      const propsScrollable = { scrollable: "true" };
      const propsFocused = { focused: "true" };
      const propsNonBoolean = { text: "Button" };

      expect(viewHierarchy.meetsBooleanFilterCriteria(propsClickable)).toBe(true);
      expect(viewHierarchy.meetsBooleanFilterCriteria(propsScrollable)).toBe(true);
      expect(viewHierarchy.meetsBooleanFilterCriteria(propsFocused)).toBe(true);
      expect(viewHierarchy.meetsBooleanFilterCriteria(propsNonBoolean)).toBe(false);
    });

    test("should check meets filter criteria correctly", function() {
      const propsWithText = { text: "Button Text" };
      const propsClickable = { clickable: "true" };
      const propsEmpty = { enabled: "true" };

      expect(viewHierarchy.meetsFilterCriteria(propsWithText)).toBe(true);
      expect(viewHierarchy.meetsFilterCriteria(propsClickable)).toBe(true);
      expect(viewHierarchy.meetsFilterCriteria(propsEmpty)).toBe(false);
    });

    test("should process node children correctly", function() {
      const node = {
        $: { text: "parent" },
        node: [
          { $: { text: "child1", clickable: "true" } },
          { $: { text: "child2", scrollable: "true" } },
          { $: { enabled: "true" } } // Should be filtered out
        ]
      };

      const filteredChildren = viewHierarchy.processNodeChildren(node, child => {
        return viewHierarchy.meetsFilterCriteria(child.$) ? child : null;
      });

      expect(filteredChildren).toHaveLength(2);
      expect(filteredChildren[0].$).toHaveProperty("text", "child1");
      expect(filteredChildren[1].$).toHaveProperty("text", "child2");
    });

    test("should normalize node structure correctly", function() {
      const singleChild = [{ text: "single" }];
      const multipleChildren = [{ text: "first" }, { text: "second" }];

      const normalizedSingle = viewHierarchy.normalizeNodeStructure(singleChild);
      const normalizedMultiple = viewHierarchy.normalizeNodeStructure(multipleChildren);

      expect(typeof normalizedSingle).toBe("object");
      expect(normalizedSingle).toHaveProperty("text", "single");
      expect(Array.isArray(normalizedMultiple)).toBe(true);
      expect(normalizedMultiple).toHaveLength(2);
    });

    test("should filter single node correctly", function() {
      const nodeWithCriteria = {
        $: { text: "test", clickable: "true", enabled: "true", class: "android.widget.Button" },
        node: {
          $: { "resource-id": "button", "enabled": "false" }
        }
      };

      const filteredNode = viewHierarchy.filterSingleNode(nodeWithCriteria);

      expect(filteredNode).toBeDefined();
      expect(filteredNode).toHaveProperty("text", "test");
      expect(filteredNode).toHaveProperty("clickable", "true");
      expect(filteredNode).not.toHaveProperty("enabled"); // Should be filtered out
      expect(filteredNode).not.toHaveProperty("class"); // Should be filtered out
    });

    test("should filter single root node correctly", function() {
      const rootNode = {
        $: { class: "android.widget.FrameLayout" },
        node: [
          { $: { text: "visible text" } },
          { $: { enabled: "true" } } // Should be filtered out
        ]
      };

      const filteredRoot = viewHierarchy.filterSingleNode(rootNode, true);

      expect(filteredRoot).toBeDefined();
      expect(filteredRoot.node).toBeDefined();
      expect(filteredRoot.node).toHaveProperty("text", "visible text");
    });

    test("should return children when parent doesn't meet criteria but children do", function() {
      const nodeWithoutCriteria = {
        $: { enabled: "true" },
        node: [
          { $: { text: "child1" } },
          { $: { clickable: "true" } }
        ]
      };

      const result = viewHierarchy.filterSingleNode(nodeWithoutCriteria);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
    });
  });


  describe("Error Handling Tests", function() {
    let viewHierarchy: ViewHierarchy;
    let fakeAdb: FakeAdbExecutor;
    let mockCtrlProxyClient: CtrlProxyClient;
    let mockDevice: BootedDevice;

    beforeEach(function() {
      mockDevice = {
        deviceId: "test-device",
        name: "Test Device",
        platform: "android"
      };
      fakeAdb = new FakeAdbExecutor();

      mockCtrlProxyClient = {
        getLatestHierarchy: async () => null,
        convertToViewHierarchyResult: () => ({ hierarchy: {} }),
        convertAccessibilityNode: () => ({}),
        getAccessibilityHierarchy: async () => null
      } as unknown as CtrlProxyClient;

      viewHierarchy = new ViewHierarchy(mockDevice, fakeAdb, mockCtrlProxyClient);
      setupReadFileMock();
    });

    afterEach(function() {
      teardownReadFileMock();
    });

    test("should handle no active window gracefully", async function() {
      const result = await viewHierarchy.getAndroidViewHierarchy();

      expect(result).toBeDefined();
      expect(result.hierarchy).toBeDefined();
    });

    test("should handle accessibility service errors in getViewHierarchy", async function() {
      const mockCtrlProxyClientError = {
        getLatestHierarchy: async () => null,
        convertToViewHierarchyResult: () => ({ hierarchy: {} }),
        convertAccessibilityNode: () => ({}),
        getAccessibilityHierarchy: async () => { throw new Error("Accessibility service error"); }
      } as unknown as CtrlProxyClient;

      const viewHierarchyWithMocks = new ViewHierarchy(mockDevice, fakeAdb, mockCtrlProxyClientError);

      const result = await viewHierarchyWithMocks.getAndroidViewHierarchy();

      expect(result).toBeDefined();
      expect(result.hierarchy).toBeDefined();
      expect(result.hierarchy).toHaveProperty("error");
    });
  });

  describe("FilterViewHierarchy Tests", function() {
    let viewHierarchy: ViewHierarchy;
    let fakeAdb: FakeAdbExecutor;
    let mockCtrlProxyClient: CtrlProxyClient;
    let mockDevice: BootedDevice;

    beforeEach(function() {
      mockDevice = {
        deviceId: "test-device",
        name: "Test Device",
        platform: "android"
      };
      fakeAdb = new FakeAdbExecutor();

      mockCtrlProxyClient = {
        getLatestHierarchy: async () => null,
        convertToViewHierarchyResult: () => ({ hierarchy: {} }),
        convertAccessibilityNode: () => ({}),
        getAccessibilityHierarchy: async () => null
      } as unknown as CtrlProxyClient;

      viewHierarchy = new ViewHierarchy(mockDevice, fakeAdb, mockCtrlProxyClient);
    });

    test("should handle empty hierarchy", function() {
      const emptyHierarchy = null;
      const result = viewHierarchy.filterViewHierarchy(emptyHierarchy);
      expect(result).toBe(emptyHierarchy);
    });

    test("should handle hierarchy without hierarchy property", function() {
      const noHierarchy = { data: "test" };
      const result = viewHierarchy.filterViewHierarchy(noHierarchy);
      expect(result).toBe(noHierarchy);
    });

    test("should filter hierarchy with mixed criteria", function() {
      const testHierarchy = {
        hierarchy: {
          $: { class: "android.widget.FrameLayout" },
          node: [
            { $: { text: "Keep this", class: "android.widget.Button" } },
            { $: { clickable: "true", class: "android.widget.View" } },
            { $: { enabled: "true", class: "android.widget.View" } }, // Should be filtered out
            {
              $: { class: "android.widget.LinearLayout" },
              node: {
                $: { "resource-id": "important_button", "class": "android.widget.Button" }
              }
            }
          ]
        }
      };

      const result = viewHierarchy.filterViewHierarchy(testHierarchy);

      expect(result).toBeDefined();
      expect(result.hierarchy).toBeDefined();
    });
  });

  describe("Edge Cases and Additional Coverage", function() {
    let viewHierarchy: ViewHierarchy;
    let fakeAdb: FakeAdbExecutor;
    let mockCtrlProxyClient: CtrlProxyClient;
    let mockDevice: BootedDevice;

    beforeEach(function() {
      mockDevice = {
        deviceId: "test-device",
        name: "Test Device",
        platform: "android"
      };
      fakeAdb = new FakeAdbExecutor();

      mockCtrlProxyClient = {
        getLatestHierarchy: async () => null,
        convertToViewHierarchyResult: () => ({ hierarchy: {} }),
        convertAccessibilityNode: () => ({}),
        getAccessibilityHierarchy: async () => null
      } as unknown as CtrlProxyClient;

      viewHierarchy = new ViewHierarchy(mockDevice, fakeAdb, mockCtrlProxyClient);
    });

    test("should handle node with empty children array", function() {
      const nodeWithEmptyChildren = {
        $: { text: "parent" },
        node: []
      };

      const filteredChildren = viewHierarchy.processNodeChildren(nodeWithEmptyChildren, child => child);
      expect(filteredChildren).toHaveLength(0);
    });

    test("should handle node with single child (not array)", function() {
      const nodeWithSingleChild = {
        $: { text: "parent" },
        node: { $: { text: "single child", clickable: "true" } }
      };

      const filteredChildren = viewHierarchy.processNodeChildren(nodeWithSingleChild, child => {
        return viewHierarchy.meetsFilterCriteria(child.$) ? child : null;
      });

      expect(filteredChildren).toHaveLength(1);
      expect(filteredChildren[0].$).toHaveProperty("text", "single child");
    });

    test("should handle filterSingleNode with null input", function() {
      const result = viewHierarchy.filterSingleNode(null);
      expect(result).toBeNull();
    });

    test("should handle node with over 64 children (should be limited)", function() {
      const manyChildren = [];
      for (let i = 0; i < 100; i++) {
        manyChildren.push({ $: { text: `child${i}`, clickable: "true" } });
      }

      const nodeWithManyChildren = {
        $: { text: "parent" },
        node: manyChildren
      };

      const filteredChildren = viewHierarchy.processNodeChildren(nodeWithManyChildren, child => child);
      expect(filteredChildren).toHaveLength(64); // Should be limited to 64
    });

    test("should handle string filter criteria with empty values", function() {
      const propsWithEmptyText = { text: "" };
      const propsWithEmptyResourceId = { "resource-id": "" };
      const propsWithNullText = { text: null };

      expect(viewHierarchy.meetsStringFilterCriteria(propsWithEmptyText)).toBe(false);
      expect(viewHierarchy.meetsStringFilterCriteria(propsWithEmptyResourceId)).toBe(false);
      expect(viewHierarchy.meetsStringFilterCriteria(propsWithNullText)).toBe(false);
    });

    test("should handle boolean filter criteria with string values", function() {
      const propsWithStringTrue = { clickable: "true" };
      const propsWithStringFalse = { clickable: "false" };
      const propsWithActualBoolean = { clickable: true };

      expect(viewHierarchy.meetsBooleanFilterCriteria(propsWithStringTrue)).toBe(true);
      expect(viewHierarchy.meetsBooleanFilterCriteria(propsWithStringFalse)).toBe(false);
      expect(viewHierarchy.meetsBooleanFilterCriteria(propsWithActualBoolean)).toBe(false);
    });

    test("should handle normalize structure with empty array", function() {
      const emptyArray: any[] = [];
      const result = viewHierarchy.normalizeNodeStructure(emptyArray);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    test("should handle filter criteria with mixed property formats", function() {
      const mixedProps = {
        "resourceId": "button_id", // camelCase
        "content-desc": "Button description", // hyphenated
        "scrollable": "true"
      };

      expect(viewHierarchy.meetsStringFilterCriteria(mixedProps)).toBe(true);
      expect(viewHierarchy.meetsBooleanFilterCriteria(mixedProps)).toBe(true);
      expect(viewHierarchy.meetsFilterCriteria(mixedProps)).toBe(true);
    });

    test("should clean node properties correctly with various edge cases", function() {
      const nodeWithVariousProps = {
        $: {
          "text": "valid text",
          "resourceId": "valid_id", // camelCase - should be normalized to resource-id
          "contentDesc": "valid desc", // camelCase - should be normalized to content-desc
          "enabled": "true", // should be filtered out
          "clickable": "false", // should be filtered out
          "scrollable": "true", // should be kept
          "class": "android.widget.View", // not in allowed properties
          "content-desc": "", // empty string should be filtered out
          "bounds": "[0,0][100,100]" // should be kept
        }
      };

      const filteredNode = viewHierarchy.filterSingleNode(nodeWithVariousProps);

      expect(filteredNode).toBeDefined();
      expect(filteredNode).toHaveProperty("text", "valid text");
      expect(filteredNode).toHaveProperty("resource-id", "valid_id");
      expect(filteredNode).toHaveProperty("content-desc", "valid desc");
      expect(filteredNode).toHaveProperty("scrollable", "true");
      expect(filteredNode).toHaveProperty("bounds", "[0,0][100,100]");
      expect(filteredNode).not.toHaveProperty("enabled");
      expect(filteredNode).not.toHaveProperty("clickable");
      expect(filteredNode).not.toHaveProperty("class");
    });

    test("should handle node without $ properties correctly", function() {
      const nodeWithoutDollar = {
        "text": "direct text",
        "resourceId": "direct_id",
        "enabled": "true", // should be filtered out
        "scrollable": "true", // should be kept
        "class": "android.widget.View", // not in allowed properties
        "content-desc": "", // empty string should be filtered out
        "node": {
          text: "child text"
        }
      };

      const filteredNode = viewHierarchy.filterSingleNode(nodeWithoutDollar);

      expect(filteredNode).toBeDefined();
      expect(filteredNode).toHaveProperty("text", "direct text");
      expect(filteredNode).toHaveProperty("resourceId", "direct_id");
      expect(filteredNode).toHaveProperty("scrollable", "true");
      expect(filteredNode).not.toHaveProperty("enabled");
      expect(filteredNode).not.toHaveProperty("class");
      expect(filteredNode).not.toHaveProperty("content-desc");
    });
  });
});

describe("findFocusedElement", function() {
  let viewHierarchy: ViewHierarchy;
  let mockDevice: BootedDevice;

  beforeEach(function() {
    mockDevice = {
      deviceId: "test-device",
      name: "Test Device",
      platform: "android"
    };

    viewHierarchy = new ViewHierarchy(mockDevice, new FakeAdbExecutor() as any, null);
  });

  test("should find focused element in simple hierarchy", function() {
    const mockViewHierarchy = {
      hierarchy: {
        node: [
          {
            "text": "Button 1",
            "resource-id": "com.example:id/button1",
            "bounds": "[0,0][100,50]",
            "clickable": "true",
            "focused": "false"
          },
          {
            "text": "Input Field",
            "resource-id": "com.example:id/input",
            "bounds": "[0,60][200,100]",
            "clickable": "true",
            "focused": "true"
          }
        ]
      }
    };

    const focusedElement = viewHierarchy.findFocusedElement(mockViewHierarchy);

    expect(focusedElement).not.toBeNull();
    expect(focusedElement!.text).toBe("Input Field");
    expect(focusedElement!["resource-id"]).toBe("com.example:id/input");
    expect(focusedElement!.focused).toBe(true);
  });

  test("should return null when no element is focused", function() {
    const mockViewHierarchy = {
      hierarchy: {
        node: [
          {
            "text": "Button 1",
            "resource-id": "com.example:id/button1",
            "bounds": "[0,0][100,50]",
            "clickable": "true",
            "focused": "false"
          },
          {
            "text": "Button 2",
            "resource-id": "com.example:id/button2",
            "bounds": "[0,110][100,160]",
            "clickable": "true",
            "focused": "false"
          }
        ]
      }
    };

    const focusedElement = viewHierarchy.findFocusedElement(mockViewHierarchy);

    expect(focusedElement).toBeNull();
  });

  test("should return null for empty or null hierarchy", function() {
    expect(viewHierarchy.findFocusedElement(null)).toBeNull();
    expect(viewHierarchy.findFocusedElement({})).toBeNull();
    expect(viewHierarchy.findFocusedElement({ hierarchy: null })).toBeNull();
  });

  test("should find focused element in deeply nested hierarchy", function() {
    const mockViewHierarchy = {
      hierarchy: {
        node: {
          "text": "Container",
          "resource-id": "com.example:id/container",
          "bounds": "[0,0][300,200]",
          "focused": "false",
          "node": {
            "text": "SubContainer",
            "resource-id": "com.example:id/sub_container",
            "bounds": "[10,10][290,190]",
            "focused": "false",
            "node": [
              {
                "text": "Deep Button",
                "resource-id": "com.example:id/deep_button",
                "bounds": "[20,20][80,50]",
                "clickable": "true",
                "focused": "false"
              },
              {
                "text": "Deep Input",
                "resource-id": "com.example:id/deep_input",
                "bounds": "[20,60][200,90]",
                "clickable": "true",
                "focused": "true"
              }
            ]
          }
        }
      }
    };

    const focusedElement = viewHierarchy.findFocusedElement(mockViewHierarchy);

    expect(focusedElement).not.toBeNull();
    expect(focusedElement!.text).toBe("Deep Input");
    expect(focusedElement!["resource-id"]).toBe("com.example:id/deep_input");
    expect(focusedElement!.focused).toBe(true);
  });

  test("should handle boolean focused property", function() {
    const mockViewHierarchy = {
      hierarchy: {
        node: {
          "text": "Button",
          "resource-id": "com.example:id/button",
          "bounds": "[0,0][100,50]",
          "clickable": "true",
          "focused": true  // Boolean instead of string
        }
      }
    };

    const focusedElement = viewHierarchy.findFocusedElement(mockViewHierarchy);

    expect(focusedElement).not.toBeNull();
    expect(focusedElement!.text).toBe("Button");
    expect(focusedElement!.focused).toBe(true);
  });

  test("should handle element with $ properties structure", function() {
    const mockViewHierarchy = {
      hierarchy: {
        node: {
          "$": {
            "text": "Button with $",
            "resource-id": "com.example:id/button_dollar",
            "bounds": "[0,0][100,50]",
            "clickable": "true",
            "focused": "true"
          }
        }
      }
    };

    const focusedElement = viewHierarchy.findFocusedElement(mockViewHierarchy);

    expect(focusedElement).not.toBeNull();
    expect(focusedElement!.text).toBe("Button with $");
    expect(focusedElement!["resource-id"]).toBe("com.example:id/button_dollar");
    expect(focusedElement!.focused).toBe(true);
  });

  test("should stop at first focused element found", function() {
    const mockViewHierarchy = {
      hierarchy: {
        node: [
          {
            "text": "First Focused",
            "resource-id": "com.example:id/first",
            "bounds": "[0,0][100,50]",
            "clickable": "true",
            "focused": "true"
          },
          {
            "text": "Second Focused",
            "resource-id": "com.example:id/second",
            "bounds": "[0,60][100,110]",
            "clickable": "true",
            "focused": "true"
          }
        ]
      }
    };

    const focusedElement = viewHierarchy.findFocusedElement(mockViewHierarchy);

    expect(focusedElement).not.toBeNull();
    expect(focusedElement!.text).toBe("First Focused");
    expect(focusedElement!["resource-id"]).toBe("com.example:id/first");
  });

  test("should handle elements without valid bounds", function() {
    const mockViewHierarchy = {
      hierarchy: {
        node: {
          "text": "Invalid Bounds Element",
          "resource-id": "com.example:id/invalid",
          "bounds": "invalid-bounds-format",
          "focused": "true"
        }
      }
    };

    const focusedElement = viewHierarchy.findFocusedElement(mockViewHierarchy);

    // Should return null because parseNodeBounds fails for invalid bounds
    expect(focusedElement).toBeNull();
  });
});

describe("Offscreen Node Filtering", function() {
  let viewHierarchy: ViewHierarchy;
  let fakeAdb: FakeAdbExecutor;
  let mockDevice: BootedDevice;

  beforeEach(function() {
    mockDevice = {
      deviceId: "test-device",
      name: "Test Device",
      platform: "android"
    };
    fakeAdb = new FakeAdbExecutor();
    viewHierarchy = new ViewHierarchy(mockDevice, fakeAdb);
  });

  test("should filter out nodes completely below the screen", function() {
    const hierarchy = {
      hierarchy: {
        bounds: "[0,0][1080,2400]",
        node: [
          { text: "Visible", bounds: "[0,100][500,200]" },
          { text: "Below Screen", bounds: "[0,2600][500,2800]" },
          { text: "Way Below", bounds: "[0,3000][500,3200]" }
        ]
      }
    };

    const result = viewHierarchy.filterOffscreenNodes(hierarchy, 1080, 2400);

    // Flatten nodes for checking
    const flatNodes: string[] = [];
    const collectNodes = (node: any) => {
      if (node.text) {flatNodes.push(node.text);}
      if (node.node) {
        const children = Array.isArray(node.node) ? node.node : [node.node];
        children.forEach(collectNodes);
      }
    };
    collectNodes(result.hierarchy);

    expect(flatNodes).toContain("Visible");
    expect(flatNodes).not.toContain("Below Screen");
    expect(flatNodes).not.toContain("Way Below");
  });

  test("should filter out nodes completely above the screen", function() {
    const hierarchy = {
      hierarchy: {
        bounds: "[0,0][1080,2400]",
        node: [
          { text: "Visible", bounds: "[0,100][500,200]" },
          { text: "Above Screen", bounds: "[0,-500][500,-300]" }
        ]
      }
    };

    const result = viewHierarchy.filterOffscreenNodes(hierarchy, 1080, 2400);

    const flatNodes: string[] = [];
    const collectNodes = (node: any) => {
      if (node.text) {flatNodes.push(node.text);}
      if (node.node) {
        const children = Array.isArray(node.node) ? node.node : [node.node];
        children.forEach(collectNodes);
      }
    };
    collectNodes(result.hierarchy);

    expect(flatNodes).toContain("Visible");
    expect(flatNodes).not.toContain("Above Screen");
  });

  test("should keep nodes within margin of screen edge", function() {
    const hierarchy = {
      hierarchy: {
        bounds: "[0,0][1080,2400]",
        node: [
          { text: "JustBelow", bounds: "[0,2450][500,2550]" },  // Within 100px margin
          { text: "FarBelow", bounds: "[0,2600][500,2800]" }    // Beyond margin
        ]
      }
    };

    const result = viewHierarchy.filterOffscreenNodes(hierarchy, 1080, 2400, 100);

    const flatNodes: string[] = [];
    const collectNodes = (node: any) => {
      if (node.text) {flatNodes.push(node.text);}
      if (node.node) {
        const children = Array.isArray(node.node) ? node.node : [node.node];
        children.forEach(collectNodes);
      }
    };
    collectNodes(result.hierarchy);

    expect(flatNodes).toContain("JustBelow");
    expect(flatNodes).not.toContain("FarBelow");
  });

  test("should handle negative coordinates in bounds", function() {
    const hierarchy = {
      hierarchy: {
        bounds: "[0,0][1080,2400]",
        node: [
          { text: "Visible", bounds: "[0,100][500,200]" },
          { text: "PartiallyLeft", bounds: "[-50,100][100,200]" },  // Partially visible
          { text: "CompletelyLeft", bounds: "[-500,-300][-200,100]" }  // Completely offscreen
        ]
      }
    };

    const result = viewHierarchy.filterOffscreenNodes(hierarchy, 1080, 2400);

    const flatNodes: string[] = [];
    const collectNodes = (node: any) => {
      if (node.text) {flatNodes.push(node.text);}
      if (node.node) {
        const children = Array.isArray(node.node) ? node.node : [node.node];
        children.forEach(collectNodes);
      }
    };
    collectNodes(result.hierarchy);

    expect(flatNodes).toContain("Visible");
    expect(flatNodes).toContain("PartiallyLeft");
    expect(flatNodes).not.toContain("CompletelyLeft");
  });

  test("should return original hierarchy if screen dimensions are invalid", function() {
    const hierarchy = {
      hierarchy: {
        bounds: "[0,0][1080,2400]",
        node: { text: "Test", bounds: "[0,100][500,200]" }
      }
    };

    const result = viewHierarchy.filterOffscreenNodes(hierarchy, 0, 0);

    expect(result).toEqual(hierarchy);
  });

  test("should preserve visible children of offscreen parents", function() {
    const hierarchy = {
      hierarchy: {
        bounds: "[0,0][1080,2400]",
        node: {
          text: "OffscreenParent",
          bounds: "[0,3000][1080,4000]",
          node: [
            { text: "VisibleChild", bounds: "[0,100][500,200]" }
          ]
        }
      }
    };

    const result = viewHierarchy.filterOffscreenNodes(hierarchy, 1080, 2400);

    const flatNodes: string[] = [];
    const collectNodes = (node: any) => {
      if (node.text) {flatNodes.push(node.text);}
      if (node.node) {
        const children = Array.isArray(node.node) ? node.node : [node.node];
        children.forEach(collectNodes);
      }
    };
    collectNodes(result.hierarchy);

    // Visible child should be preserved even though parent is offscreen
    expect(flatNodes).toContain("VisibleChild");
    // Offscreen parent should be removed
    expect(flatNodes).not.toContain("OffscreenParent");
  });

  describe("findAccessibilityFocusedElement", function() {
    test("should find accessibility-focused element from top-level field", function() {
      const hierarchy = {
        "accessibility-focused-element": {
          "text": "Focused Button",
          "resource-id": "com.app:id/button",
          "content-desc": "Submit",
          "bounds": { left: 100, top: 200, right: 300, bottom: 250 }
        },
        "hierarchy": {
          bounds: "[0,0][1080,2400]",
          node: [
            { text: "Other Button", bounds: "[0,100][500,200]" }
          ]
        }
      };

      const result = viewHierarchy.findAccessibilityFocusedElement(hierarchy);

      expect(result).not.toBeNull();
      expect(result?.text).toBe("Focused Button");
      expect(result?.["resource-id"]).toBe("com.app:id/button");
      expect(result?.["content-desc"]).toBe("Submit");
      expect(result?.["accessibility-focused"]).toBe(true);
    });

    test("should find accessibility-focused element by traversing hierarchy", function() {
      const hierarchy = {
        hierarchy: {
          bounds: "[0,0][1080,2400]",
          node: [
            { text: "Button 1", bounds: "[0,100][500,200]" },
            {
              text: "Container",
              bounds: "[0,300][500,600]",
              node: [
                { "text": "Button 2", "accessibility-focused": "true", "bounds": "[10,310][490,350]" },
                { text: "Button 3", bounds: "[10,360][490,400]" }
              ]
            }
          ]
        }
      };

      const result = viewHierarchy.findAccessibilityFocusedElement(hierarchy);

      expect(result).not.toBeNull();
      expect(result?.text).toBe("Button 2");
      expect(result?.["accessibility-focused"]).toBe(true);
    });

    test("should return null when no accessibility-focused element exists", function() {
      const hierarchy = {
        hierarchy: {
          bounds: "[0,0][1080,2400]",
          node: [
            { text: "Button 1", bounds: "[0,100][500,200]" },
            { text: "Button 2", bounds: "[0,300][500,400]" }
          ]
        }
      };

      const result = viewHierarchy.findAccessibilityFocusedElement(hierarchy);

      expect(result).toBeNull();
    });

    test("should return null when hierarchy is null", function() {
      const result = viewHierarchy.findAccessibilityFocusedElement(null);

      expect(result).toBeNull();
    });

    test("should prioritize top-level field over hierarchy traversal", function() {
      const hierarchy = {
        "accessibility-focused-element": {
          text: "Top-level Focused",
          bounds: { left: 100, top: 200, right: 300, bottom: 250 }
        },
        "hierarchy": {
          bounds: "[0,0][1080,2400]",
          node: [
            { "text": "Hierarchy Focused", "accessibility-focused": "true", "bounds": "[0,100][500,200]" }
          ]
        }
      };

      const result = viewHierarchy.findAccessibilityFocusedElement(hierarchy);

      expect(result).not.toBeNull();
      expect(result?.text).toBe("Top-level Focused");
      expect(result?.["accessibility-focused"]).toBe(true);
    });

    test("should search across top-level root nodes for accessibility-focused element", function() {
      const hierarchy = {
        hierarchy: {
          bounds: "[0,0][1080,2400]",
          node: [
            { text: "Main Window Button", bounds: "[0,100][500,200]" },
            {
              bounds: "[0,0][500,300]",
              node: [
                { "text": "Popup Button", "accessibility-focused": "true", "bounds": "[10,10][490,50]" }
              ]
            }
          ]
        }
      };

      const result = viewHierarchy.findAccessibilityFocusedElement(hierarchy);

      expect(result).not.toBeNull();
      expect(result?.text).toBe("Popup Button");
      expect(result?.["accessibility-focused"]).toBe(true);
    });
  });
});
