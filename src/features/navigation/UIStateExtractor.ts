import { UIState, SelectedElement, SelectedElementDetection, ModalState, ScrollPosition } from "../../utils/interfaces/NavigationGraph";
import { ObserveResult, ViewHierarchyResult, WindowHierarchy } from "../../models";
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

    // Extract modal stack from windows
    const modalStack = this.extractModalStack(viewHierarchy);

    // Return undefined if no useful state was found
    if (selectedElements.length === 0 && !destinationId && (!modalStack || modalStack.length === 0)) {
      return undefined;
    }

    return {
      selectedElements,
      destinationId,
      modalStack: modalStack && modalStack.length > 0 ? modalStack : undefined
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
   * Extract modal stack from the windows array in the view hierarchy.
   * Returns modals sorted by layer (bottom to top).
   */
  private static extractModalStack(viewHierarchy: ViewHierarchyResult): ModalState[] | undefined {
    if (!viewHierarchy.windows || viewHierarchy.windows.length === 0) {
      return undefined;
    }

    const modals: ModalState[] = [];

    // Filter and classify modal windows
    for (const window of viewHierarchy.windows) {
      const modalType = this.classifyWindowAsModal(window);
      if (modalType) {
        const identifier = this.extractModalIdentifier(window);

        modals.push({
          type: modalType,
          identifier,
          layer: window.windowLayer,
          windowId: window.windowId,
          windowType: window.windowType
        });
      }
    }

    // Sort by layer (bottom to top)
    modals.sort((a, b) => a.layer - b.layer);

    return modals.length > 0 ? modals : undefined;
  }

  /**
   * Classify a window as a modal type based on window type and hierarchy analysis.
   * Returns undefined if the window is not a modal.
   */
  private static classifyWindowAsModal(window: WindowHierarchy): ModalState["type"] | undefined {
    const windowType = window.windowType.toLowerCase();

    // Dialog detection
    if (windowType.includes("dialog") || windowType.includes("alert")) {
      return "dialog";
    }

    // Popup detection
    if (windowType.includes("popup") || windowType.includes("menu")) {
      return windowType.includes("menu") ? "menu" : "popup";
    }

    // Application overlay detection (includes bottom sheets and custom modals)
    if (windowType.includes("overlay") || windowType.includes("panel")) {
      // Try to distinguish bottom sheet from generic overlay
      if (window.hierarchy) {
        const isBottomSheet = this.detectBottomSheetInHierarchy(window.hierarchy);
        if (isBottomSheet) {
          return "bottomsheet";
        }
      }
      return "overlay";
    }

    // Application sub-panel (could be bottom sheet)
    if (windowType.includes("sub_panel") || windowType.includes("application_panel")) {
      if (window.hierarchy) {
        const isBottomSheet = this.detectBottomSheetInHierarchy(window.hierarchy);
        if (isBottomSheet) {
          return "bottomsheet";
        }
      }
      return "dialog";
    }

    // Not a modal window
    return undefined;
  }

  /**
   * Detect if a window hierarchy contains bottom sheet indicators.
   */
  private static detectBottomSheetInHierarchy(hierarchy: any): boolean {
    let found = false;

    this.traverseHierarchy(hierarchy, node => {
      const className = node.class?.toLowerCase() || "";
      const resourceId = node["resource-id"]?.toLowerCase() || "";

      // Check for bottom sheet class names
      if (className.includes("bottomsheet") ||
          resourceId.includes("bottomsheet") ||
          resourceId.includes("bottom_sheet")) {
        found = true;
      }
    });

    return found;
  }

  /**
   * Extract an identifier for a modal window.
   * Prefers resource-id, falls back to unique text content.
   */
  private static extractModalIdentifier(window: WindowHierarchy): string | undefined {
    if (!window.hierarchy) {
      return undefined;
    }

    // Try to find a resource-id first (preferred)
    let resourceId: string | undefined;
    let text: string | undefined;

    this.traverseHierarchy(window.hierarchy, node => {
      // Look for meaningful resource-ids (skip generic ones)
      const nodeResourceId = node["resource-id"];
      if (nodeResourceId && !resourceId) {
        // Skip generic Android IDs
        if (!nodeResourceId.startsWith("android:id/")) {
          resourceId = nodeResourceId;
        }
      }

      // Collect text as fallback
      if (!text && node.text && node.text.trim().length > 0) {
        text = node.text.trim();
      }
    });

    // Prefer resource-id over text
    return resourceId || text;
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
