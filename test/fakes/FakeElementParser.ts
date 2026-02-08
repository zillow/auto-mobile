import type { Element } from "../../src/models/Element";
import type { ElementBounds, ViewHierarchyNode, ViewHierarchyResult } from "../../src/models";
import type { ElementParser } from "../../src/utils/interfaces/ElementParser";

export class FakeElementParser implements ElementParser {
  nextNodeProperties: any = {};
  nextParsedBounds: ElementBounds | null = null;
  nextParsedNode: Element | null = null;
  nextRootNodes: ViewHierarchyNode[] = [];
  nextWindowRootGroups: ViewHierarchyNode[][] = [];
  nextFlattenedElements: Array<{ element: Element; index: number; depth: number; text?: string }> = [];

  extractNodeProperties(_node: ViewHierarchyNode): any {
    return this.nextNodeProperties;
  }

  parseBounds(_boundsString: string): ElementBounds | null {
    return this.nextParsedBounds;
  }

  parseNodeBounds(_node: ViewHierarchyNode): Element | null {
    return this.nextParsedNode;
  }

  extractRootNodes(_viewHierarchy: ViewHierarchyResult): ViewHierarchyNode[] {
    return this.nextRootNodes;
  }

  extractWindowRootGroups(
    _viewHierarchy: ViewHierarchyResult,
    _order?: "topmost-first" | "bottommost-first"
  ): ViewHierarchyNode[][] {
    return this.nextWindowRootGroups;
  }

  extractWindowRootNodes(
    _viewHierarchy: ViewHierarchyResult,
    _order?: "topmost-first" | "bottommost-first"
  ): ViewHierarchyNode[] {
    return this.nextWindowRootGroups.flat();
  }

  traverseNode(node: any, callback: (node: any, depth: number) => void, depth: number = 0): void {
    if (!node) {return;}
    callback(node, depth);
    const childNodes = node.node || node.children;
    if (childNodes) {
      const children = Array.isArray(childNodes) ? childNodes : [childNodes];
      for (const child of children) {
        this.traverseNode(child, callback, depth + 1);
      }
    }
  }

  flattenViewHierarchy(
    _viewHierarchy: ViewHierarchyResult,
    _options?: { includeWindows?: boolean; windowOrder?: "topmost-first" | "bottommost-first" }
  ): Array<{ element: Element; index: number; depth: number; text?: string }> {
    return this.nextFlattenedElements;
  }
}
