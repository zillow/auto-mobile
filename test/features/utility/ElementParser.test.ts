import { describe, expect, test } from "bun:test";
import { DefaultElementParser } from "../../../src/features/utility/ElementParser";
import type { ViewHierarchyNode, ViewHierarchyResult } from "../../../src/models";

describe("DefaultElementParser", () => {
  const parser = new DefaultElementParser();

  describe("extractNodeProperties", () => {
    test("returns $ properties when present", () => {
      const node = { $: { text: "hello", bounds: "[0,0][100,100]" } } as ViewHierarchyNode;
      const props = parser.extractNodeProperties(node);
      expect(props.text).toBe("hello");
      expect(props.bounds).toBe("[0,0][100,100]");
    });

    test("returns node itself when $ is missing", () => {
      const node = { text: "hello" } as any;
      const props = parser.extractNodeProperties(node);
      expect(props.text).toBe("hello");
    });

    test("returns node itself for null $", () => {
      const node = { $: null } as any;
      const props = parser.extractNodeProperties(node);
      expect(props).toBe(node);
    });
  });

  describe("parseBounds", () => {
    test("parses valid bounds string", () => {
      const bounds = parser.parseBounds("[10,20][300,400]");
      expect(bounds).toEqual({ left: 10, top: 20, right: 300, bottom: 400 });
    });

    test("returns null for empty string", () => {
      expect(parser.parseBounds("")).toBeNull();
    });

    test("returns null for invalid format", () => {
      expect(parser.parseBounds("invalid")).toBeNull();
    });

    test("returns null for partial bounds", () => {
      expect(parser.parseBounds("[10,20]")).toBeNull();
    });

    test("parses bounds with zero values", () => {
      const bounds = parser.parseBounds("[0,0][0,0]");
      expect(bounds).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
    });

    test("parses large bounds values", () => {
      const bounds = parser.parseBounds("[0,0][1080,1920]");
      expect(bounds).toEqual({ left: 0, top: 0, right: 1080, bottom: 1920 });
    });
  });

  describe("parseNodeBounds", () => {
    test("returns null for null node", () => {
      expect(parser.parseNodeBounds(null as any)).toBeNull();
    });

    test("parses Android node with string bounds", () => {
      const node = { $: { text: "Login", bounds: "[10,20][300,400]" } } as ViewHierarchyNode;
      const element = parser.parseNodeBounds(node);
      expect(element).not.toBeNull();
      expect(element!.bounds).toEqual({ left: 10, top: 20, right: 300, bottom: 400 });
    });

    test("returns null for node with invalid string bounds", () => {
      const node = { $: { text: "Login", bounds: "invalid" } } as ViewHierarchyNode;
      expect(parser.parseNodeBounds(node)).toBeNull();
    });

    test("handles iOS node with object bounds", () => {
      const node = {
        $: { text: "Login" },
        bounds: { left: 10, top: 20, right: 300, bottom: 400 },
      } as any;
      const element = parser.parseNodeBounds(node);
      expect(element).not.toBeNull();
      expect(element!.bounds).toEqual({ left: 10, top: 20, right: 300, bottom: 400 });
    });

    test("returns null for node without bounds", () => {
      const node = { $: { text: "Login" } } as ViewHierarchyNode;
      expect(parser.parseNodeBounds(node)).toBeNull();
    });
  });

  describe("traverseNode", () => {
    test("does nothing for null node", () => {
      const visited: number[] = [];
      parser.traverseNode(null, (_node, depth) => visited.push(depth));
      expect(visited).toHaveLength(0);
    });

    test("visits single node at depth 0", () => {
      const visited: number[] = [];
      parser.traverseNode({ $: {} }, (_node, depth) => visited.push(depth));
      expect(visited).toEqual([0]);
    });

    test("traverses children via 'node' property", () => {
      const tree = {
        $: { text: "root" },
        node: [
          { $: { text: "child1" } },
          { $: { text: "child2" } },
        ],
      };

      const visited: Array<{ text: string; depth: number }> = [];
      parser.traverseNode(tree, (node, depth) => {
        visited.push({ text: node.$?.text || node.text || "", depth });
      });

      expect(visited).toEqual([
        { text: "root", depth: 0 },
        { text: "child1", depth: 1 },
        { text: "child2", depth: 1 },
      ]);
    });

    test("traverses children via 'children' property", () => {
      const tree = {
        text: "root",
        children: [
          { text: "child1" },
          { text: "child2" },
        ],
      };

      const visited: Array<{ text: string; depth: number }> = [];
      parser.traverseNode(tree, (node, depth) => {
        visited.push({ text: node.text || "", depth });
      });

      expect(visited).toEqual([
        { text: "root", depth: 0 },
        { text: "child1", depth: 1 },
        { text: "child2", depth: 1 },
      ]);
    });

    test("traverses nested hierarchy", () => {
      const tree = {
        $: { text: "level0" },
        node: [{
          $: { text: "level1" },
          node: [{
            $: { text: "level2" },
          }],
        }],
      };

      const depths: number[] = [];
      parser.traverseNode(tree, (_node, depth) => depths.push(depth));
      expect(depths).toEqual([0, 1, 2]);
    });

    test("handles single child object (not array)", () => {
      const tree = {
        $: { text: "root" },
        node: { $: { text: "only-child" } },
      };

      const visited: string[] = [];
      parser.traverseNode(tree, node => {
        visited.push(node.$?.text || "");
      });

      expect(visited).toEqual(["root", "only-child"]);
    });

    test("respects custom starting depth", () => {
      const depths: number[] = [];
      parser.traverseNode({ $: {} }, (_node, depth) => depths.push(depth), 5);
      expect(depths).toEqual([5]);
    });
  });

  describe("extractRootNodes", () => {
    test("returns empty array for null hierarchy", () => {
      expect(parser.extractRootNodes(null as any)).toEqual([]);
    });

    test("returns empty array for hierarchy with error", () => {
      const viewHierarchy: ViewHierarchyResult = {
        hierarchy: { error: "Failed to capture" },
      };
      expect(parser.extractRootNodes(viewHierarchy)).toEqual([]);
    });

    test("extracts single root node", () => {
      const rootNode: ViewHierarchyNode = { $: { text: "root" } };
      const viewHierarchy: ViewHierarchyResult = {
        hierarchy: { node: rootNode },
      };
      const roots = parser.extractRootNodes(viewHierarchy);
      expect(roots).toHaveLength(1);
    });

    test("extracts array of root nodes", () => {
      const viewHierarchy: ViewHierarchyResult = {
        hierarchy: {
          node: [
            { $: { text: "root1" } },
            { $: { text: "root2" } },
          ] as any,
        },
      };
      const roots = parser.extractRootNodes(viewHierarchy);
      expect(roots).toHaveLength(2);
    });
  });

  describe("extractWindowRootGroups", () => {
    test("returns empty for hierarchy without windows", () => {
      const viewHierarchy: ViewHierarchyResult = {
        hierarchy: { node: { $: {} } },
      };
      expect(parser.extractWindowRootGroups(viewHierarchy)).toEqual([]);
    });

    test("returns empty for empty windows array", () => {
      const viewHierarchy: ViewHierarchyResult = {
        hierarchy: { node: { $: {} } },
        windows: [],
      };
      expect(parser.extractWindowRootGroups(viewHierarchy)).toEqual([]);
    });

    test("extracts root groups from windows", () => {
      const viewHierarchy: ViewHierarchyResult = {
        hierarchy: { node: { $: {} } },
        windows: [
          { windowLayer: 0, hierarchy: { $: { text: "win0" } } },
          { windowLayer: 1, hierarchy: { $: { text: "win1" } } },
        ],
      };
      const groups = parser.extractWindowRootGroups(viewHierarchy);
      expect(groups).toHaveLength(2);
    });

    test("filters out windows without hierarchy", () => {
      const viewHierarchy: ViewHierarchyResult = {
        hierarchy: { node: { $: {} } },
        windows: [
          { windowLayer: 0, hierarchy: { $: { text: "win0" } } },
          { windowLayer: 1 },
        ],
      };
      const groups = parser.extractWindowRootGroups(viewHierarchy);
      expect(groups).toHaveLength(1);
    });
  });

  describe("flattenViewHierarchy", () => {
    test("returns empty for null hierarchy", () => {
      expect(parser.flattenViewHierarchy(null as any)).toEqual([]);
    });

    test("flattens single element", () => {
      const viewHierarchy: ViewHierarchyResult = {
        hierarchy: {
          node: { $: { text: "button", bounds: "[0,0][100,50]" } },
        },
      };
      const result = parser.flattenViewHierarchy(viewHierarchy);
      expect(result).toHaveLength(1);
      expect(result[0].index).toBe(0);
      expect(result[0].depth).toBe(0);
      expect(result[0].text).toBe("button");
    });

    test("assigns sequential indices", () => {
      const viewHierarchy: ViewHierarchyResult = {
        hierarchy: {
          node: {
            $: { text: "parent", bounds: "[0,0][100,100]" },
            node: [
              { $: { text: "child1", bounds: "[0,0][50,50]" } },
              { $: { text: "child2", bounds: "[50,0][100,50]" } },
            ],
          },
        },
      };
      const result = parser.flattenViewHierarchy(viewHierarchy);
      expect(result).toHaveLength(3);
      expect(result[0].index).toBe(0);
      expect(result[1].index).toBe(1);
      expect(result[2].index).toBe(2);
    });

    test("skips nodes without valid bounds", () => {
      const viewHierarchy: ViewHierarchyResult = {
        hierarchy: {
          node: {
            $: { text: "parent", bounds: "[0,0][100,100]" },
            node: [
              { $: { text: "no-bounds" } },
              { $: { text: "valid", bounds: "[0,0][50,50]" } },
            ],
          },
        },
      };
      const result = parser.flattenViewHierarchy(viewHierarchy);
      expect(result).toHaveLength(2); // parent + valid child
    });

    test("extracts content-desc as text", () => {
      const viewHierarchy: ViewHierarchyResult = {
        hierarchy: {
          node: { $: { "content-desc": "Close button", "bounds": "[0,0][100,50]" } },
        },
      };
      const result = parser.flattenViewHierarchy(viewHierarchy);
      expect(result[0].text).toBe("Close button");
    });
  });
});
