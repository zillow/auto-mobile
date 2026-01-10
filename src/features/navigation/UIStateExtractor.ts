import { UIState, SelectedElement, SelectedElementDetection, ScrollPosition } from "../../utils/interfaces/NavigationGraph";
import { ObserveResult, ViewHierarchyResult } from "../../models";
import { SwipeOnOptions } from "../../models";
import { resolveSwipeDirection } from "../../utils/swipeOnUtils";

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
   * Extract UI state from an observation, using visual fallback selections if accessibility data is missing.
   */
  static extractFromObservation(observation?: ObserveResult): UIState | undefined {
    if (!observation?.viewHierarchy) {
      return undefined;
    }

    const baseState = this.extract(observation.viewHierarchy);
    const accessibilitySelected = baseState?.selectedElements ?? [];

    if (accessibilitySelected.length > 0) {
      const selectedElements = this.applySelectedState(accessibilitySelected, {
        method: "accessibility",
        confidence: 1,
        reason: "selected attribute present in view hierarchy"
      });
      return {
        ...baseState,
        selectedElements
      };
    }

    const fallbackSelected = observation.selectedElements ?? [];
    if (fallbackSelected.length > 0) {
      if (baseState) {
        return {
          ...baseState,
          selectedElements: fallbackSelected
        };
      }

      return {
        selectedElements: fallbackSelected
      };
    }

    return baseState;
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

  private static applySelectedState(
    selectedElements: SelectedElement[],
    selectedState: SelectedElementDetection
  ): SelectedElement[] {
    return selectedElements.map(element => ({
      ...element,
      selectedState: element.selectedState ?? selectedState
    }));
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

  /**
   * Create a ScrollPosition from swipeOn options (when lookFor is used).
   * This captures the scroll action needed to make a navigation element visible.
   */
  static createScrollPosition(options: SwipeOnOptions): ScrollPosition | undefined {
    // Only create scroll position for lookFor scrolls (explicit element search)
    if (!options.lookFor) {
      return undefined;
    }

    const resolvedDirection = resolveSwipeDirection(options);
    if (!resolvedDirection.direction) {
      return undefined;
    }

    const scrollPosition: ScrollPosition = {
      targetElement: {
        text: options.lookFor.text,
        resourceId: options.lookFor.elementId
      },
      direction: resolvedDirection.direction
    };

    // Add container information if specified
    if (options.container) {
      scrollPosition.container = {
        text: options.container.text,
        resourceId: options.container.elementId
      };
    }

    // Add speed if specified
    if (options.speed) {
      scrollPosition.speed = options.speed;
    }

    return scrollPosition;
  }
}
