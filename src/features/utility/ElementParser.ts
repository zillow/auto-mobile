import { Element } from "../../models/Element";
import { ElementBounds, ViewHierarchyNode, ViewHierarchyResult } from "../../models";
import { resolveViewHierarchyForSearch } from "../../utils/viewHierarchySearch";

type WindowSearchOrder = "topmost-first" | "bottommost-first";

/**
 * Handles parsing of view hierarchy structures
 */
export class ElementParser {
  /**
   * Extract node properties from the view hierarchy node
   * @param node - The node to extract properties from
   * @returns The node properties
   */
  extractNodeProperties(node: ViewHierarchyNode): any {
    // XML parser from xml2js puts properties in $ object
    return node && node.$ ? node.$ : node;
  }

  /**
   * Parse element bounds from string to object
   * @param boundsString - The bounds string in format [left,top][right,bottom]
   * @returns The parsed bounds or null if invalid
   */
  parseBounds(boundsString: string): ElementBounds | null {
    if (!boundsString) {return null;}

    const boundsParts = boundsString.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!boundsParts) {return null;}

    return {
      left: parseInt(boundsParts[1], 10),
      top: parseInt(boundsParts[2], 10),
      right: parseInt(boundsParts[3], 10),
      bottom: parseInt(boundsParts[4], 10)
    };
  }

  /**
   * Parse a node's bounds if they're in string format
   * @param node - The node to parse
   * @returns The node with parsed bounds or null
   */
  parseNodeBounds(node: ViewHierarchyNode): Element | null {
    if (!node) {return null;}

    // Create a copy of the node properties
    const nodeProperties = this.extractNodeProperties(node);
    const parsedNode: ViewHierarchyNode = { ...nodeProperties };

    // For iOS elements, bounds might already be an object structure
    if (node.bounds && typeof node.bounds === "object" &&
      typeof node.bounds.left === "number" &&
      typeof node.bounds.top === "number" &&
      typeof node.bounds.right === "number" &&
      typeof node.bounds.bottom === "number") {
      // iOS element already has parsed bounds object
      parsedNode.bounds = node.bounds;
    } else if (typeof nodeProperties.bounds === "string") {
      // Android element with string bounds format
      const parsedBounds = this.parseBounds(nodeProperties.bounds);
      if (!parsedBounds) {return null;}
      parsedNode.bounds = parsedBounds;
    } else if (!nodeProperties.bounds) {
      return null;
    } else {
      // Bounds exist but in unknown format, try to use as-is
      parsedNode.bounds = nodeProperties.bounds;
    }

    return parsedNode as Element;
  }

  /**
   * Extract root nodes from view hierarchy, handling different possible structures
   * @param viewHierarchy - The view hierarchy to extract from
   * @returns Array of root nodes
   */
  extractRootNodes(viewHierarchy: ViewHierarchyResult): ViewHierarchyNode[] {
    const searchHierarchy = resolveViewHierarchyForSearch(viewHierarchy);
    if (!searchHierarchy?.hierarchy) {
      return [];
    }

    const hierarchy: any = searchHierarchy.hierarchy;
    if (hierarchy && typeof hierarchy === "object" && "error" in hierarchy && hierarchy.error) {
      return [];
    }

    return this.extractHierarchyRoots(hierarchy);
  }

  /**
   * Extract root nodes from each window hierarchy, ordered by window layer.
   * @param viewHierarchy - The view hierarchy to extract from
   * @param order - Window search order (topmost-first by default)
   * @returns Array of root node arrays for each window
   */
  extractWindowRootGroups(
    viewHierarchy: ViewHierarchyResult,
    order: WindowSearchOrder = "topmost-first"
  ): ViewHierarchyNode[][] {
    const searchHierarchy = resolveViewHierarchyForSearch(viewHierarchy);
    if (!searchHierarchy?.windows || searchHierarchy.windows.length === 0) {
      return [];
    }

    const windowsWithHierarchy = searchHierarchy.windows.filter(window => window.hierarchy);
    if (windowsWithHierarchy.length === 0) {
      return [];
    }

    const sortedWindows = this.sortWindows(windowsWithHierarchy, order);
    return sortedWindows.map(window => this.extractHierarchyRoots(window.hierarchy as ViewHierarchyNode));
  }

  /**
   * Extract root nodes from all window hierarchies, ordered by window layer.
   * @param viewHierarchy - The view hierarchy to extract from
   * @param order - Window search order (topmost-first by default)
   * @returns Array of root nodes across all windows
   */
  extractWindowRootNodes(
    viewHierarchy: ViewHierarchyResult,
    order: WindowSearchOrder = "topmost-first"
  ): ViewHierarchyNode[] {
    const groups = this.extractWindowRootGroups(viewHierarchy, order);
    return groups.reduce(
      (acc, group) => acc.concat(group),
      [] as ViewHierarchyNode[]
    );
  }

  private extractHierarchyRoots(hierarchy: any): ViewHierarchyNode[] {
    if (!hierarchy) {
      return [];
    }

    if (hierarchy.node) {
      return Array.isArray(hierarchy.node) ? hierarchy.node : [hierarchy.node];
    }

    if (hierarchy.hierarchy) {
      return [hierarchy.hierarchy];
    }

    return [hierarchy];
  }

  private sortWindows<T extends { windowLayer: number }>(windows: T[], order: WindowSearchOrder): T[] {
    const direction = order === "topmost-first" ? -1 : 1;
    return windows
      .map((window, index) => ({ window, index }))
      .sort((a, b) => {
        const layerDelta = this.normalizeWindowLayer(a.window.windowLayer) -
          this.normalizeWindowLayer(b.window.windowLayer);
        if (layerDelta !== 0) {
          return layerDelta * direction;
        }
        return a.index - b.index;
      })
      .map(entry => entry.window);
  }

  private normalizeWindowLayer(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return 0;
  }

  /**
   * Traverse the view hierarchy and process each node with a provided function
   * @param node - The node to start traversal from
   * @param callback - Function to process each node (receives node and depth)
   * @param depth - Current depth in the hierarchy (0 = root)
   */
  traverseNode(node: any, callback: (node: any, depth: number) => void, depth: number = 0): void {
    if (!node) {return;}

    // Process the current node with its depth
    callback(node, depth);

    // Traverse child nodes with incremented depth
    if (node.node) {
      const children = node.node;
      if (Array.isArray(children)) {
        for (const child of children) {
          this.traverseNode(child, callback, depth + 1);
        }
      } else if (typeof children === "object") {
        this.traverseNode(children, callback, depth + 1);
      }
    }
  }

  /**
   * Flatten the view hierarchy into a linear array of elements with indices and depth
   * @param viewHierarchy - The view hierarchy to flatten
   * @returns Array of elements with their indices and depth in hierarchy
   */
  flattenViewHierarchy(
    viewHierarchy: ViewHierarchyResult,
    options: { includeWindows?: boolean; windowOrder?: WindowSearchOrder } = {}
  ): Array<{ element: Element; index: number; depth: number; text?: string }> {
    const searchHierarchy = resolveViewHierarchyForSearch(viewHierarchy);
    if (!searchHierarchy) {
      return [];
    }

    const flattenedElements: Array<{ element: Element; index: number; depth: number; text?: string }> = [];
    const rootNodes = options.includeWindows
      ? [
        ...this.extractRootNodes(searchHierarchy),
        ...this.extractWindowRootNodes(searchHierarchy, options.windowOrder ?? "topmost-first")
      ]
      : this.extractRootNodes(searchHierarchy);
    let currentIndex = 0;

    // Process each root node
    for (const rootNode of rootNodes) {
      this.traverseNode(rootNode, (node: any, depth: number) => {
        const parsedNode = this.parseNodeBounds(node);
        if (parsedNode) {
          const nodeProperties = this.extractNodeProperties(node);
          const accessibilityText = nodeProperties.text || nodeProperties["content-desc"] || undefined;

          flattenedElements.push({
            element: parsedNode,
            index: currentIndex,
            depth: depth,
            text: accessibilityText
          });
          currentIndex++;
        }
      });
    }

    return flattenedElements;
  }
}
