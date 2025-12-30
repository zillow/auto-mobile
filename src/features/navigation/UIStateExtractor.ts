import { UIState, SelectedElement } from "../../utils/interfaces/NavigationGraph";
import { ViewHierarchyResult } from "../../models";

/**
 * Extracts UI state from a view hierarchy.
 * Captures selected elements (tabs, menu items) and destination IDs.
 */
export class UIStateExtractor {
  /**
   * Extract UI state from a view hierarchy result.
   */
  static extract(viewHierarchy: ViewHierarchyResult | undefined): UIState | undefined {
    if (!viewHierarchy?.hierarchy) {
      return undefined;
    }

    const selectedElements: SelectedElement[] = [];
    let destinationId: string | undefined;

    // Traverse the hierarchy to find selected elements and destination
    this.traverseHierarchy(viewHierarchy.hierarchy, node => {
      // Check for destination ID (resource-id like "navigation.HomeDestination")
      const resourceId = node["resource-id"];
      if (resourceId && resourceId.startsWith("navigation.") && resourceId.endsWith("Destination")) {
        destinationId = resourceId.replace("navigation.", "");
      }

      // Check for selected elements (tabs, menu items, etc.)
      if (node.selected === "true") {
        const element: SelectedElement = {};

        // Try to get identifying information
        if (node.text) {
          element.text = node.text;
        }
        if (node["resource-id"]) {
          element.resourceId = node["resource-id"];
        }
        if (node["content-desc"]) {
          element.contentDesc = node["content-desc"];
        }

        // Also check child nodes for text (common in Compose where text is nested)
        if (!element.text && node.node) {
          const childText = this.findTextInChildren(node.node);
          if (childText) {
            element.text = childText;
          }
        }

        // Only add if we have at least one identifier
        if (element.text || element.resourceId || element.contentDesc) {
          selectedElements.push(element);
        }
      }
    });

    // Return undefined if no useful state was found
    if (selectedElements.length === 0 && !destinationId) {
      return undefined;
    }

    return {
      selectedElements,
      destinationId
    };
  }

  /**
   * Traverse the view hierarchy and call visitor for each node.
   */
  private static traverseHierarchy(
    node: Record<string, any>,
    visitor: (node: Record<string, any>) => void
  ): void {
    visitor(node);

    // Handle array of child nodes
    if (Array.isArray(node.node)) {
      for (const child of node.node) {
        this.traverseHierarchy(child, visitor);
      }
    } else if (node.node && typeof node.node === "object") {
      // Handle single child node
      this.traverseHierarchy(node.node, visitor);
    }
  }

  /**
   * Find text in child nodes (for Compose layouts where text is nested).
   */
  private static findTextInChildren(node: Record<string, any> | Record<string, any>[]): string | undefined {
    if (Array.isArray(node)) {
      for (const child of node) {
        if (child.text) {
          return child.text;
        }
        if (child.node) {
          const result = this.findTextInChildren(child.node);
          if (result) {
            return result;
          }
        }
      }
    } else if (node && typeof node === "object") {
      if (node.text) {
        return node.text;
      }
      if (node.node) {
        return this.findTextInChildren(node.node);
      }
    }
    return undefined;
  }
}
