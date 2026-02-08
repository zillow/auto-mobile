import { UIState, SelectedElement, SelectedElementDetection, ScrollPosition, ModalState } from "../../utils/interfaces/NavigationGraph";
import { ObserveResult, ViewHierarchyResult } from "../../models";
import { SwipeOnOptions } from "../../models";
import { resolveSwipeDirection } from "../../utils/swipeOnUtils";
import type { ElementParser } from "../../utils/interfaces/ElementParser";
import { DefaultElementParser } from "../utility/ElementParser";

/**
 * Extracts UI state from a view hierarchy.
 * Captures selected elements (tabs, menu items) and destination IDs.
 */
export class UIStateExtractor {
  private readonly parser: ElementParser;

  constructor(parser: ElementParser = new DefaultElementParser()) {
    this.parser = parser;
  }

  /**
   * Extract UI state from a view hierarchy result.
   */
  extract(viewHierarchy: ViewHierarchyResult | undefined): UIState | undefined {
    if (!viewHierarchy?.hierarchy) {
      return undefined;
    }

    const selectedElements: SelectedElement[] = [];
    let destinationId: string | undefined;
    const modalStack: ModalState[] = [];
    const windowsWithHierarchy = viewHierarchy.windows?.filter(window => window.hierarchy) ?? [];

    // Traverse the hierarchy to find selected elements and destination
    this.parser.traverseNode(viewHierarchy.hierarchy, (node, depth) => {
      const attrs = this.parser.extractNodeProperties(node);

      // Check for destination ID (resource-id like "navigation.HomeDestination")
      const resourceId = this.getAttribute(attrs, ["resource-id", "resourceId"]);
      if (resourceId && resourceId.startsWith("navigation.") && resourceId.endsWith("Destination")) {
        destinationId = resourceId.replace("navigation.", "");
      }

      // Check for selected elements (tabs, menu items, etc.)
      if (this.getAttribute(attrs, ["selected"]) === "true") {
        const element: SelectedElement = {};

        // Try to get identifying information
        const text = this.getAttribute(attrs, ["text"]);
        const contentDesc = this.getAttribute(attrs, ["content-desc", "contentDesc"]);
        if (text) {
          element.text = text;
        }
        if (resourceId) {
          element.resourceId = resourceId;
        }
        if (contentDesc) {
          element.contentDesc = contentDesc;
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

      if (windowsWithHierarchy.length === 0) {
        this.collectModalStack(modalStack, attrs, depth);
      }
    });

    if (windowsWithHierarchy.length > 0) {
      for (const [index, window] of windowsWithHierarchy.entries()) {
        const windowId = window.id ?? undefined;
        const windowType = window.type !== undefined ? String(window.type) : undefined;
        const windowLayer = window.windowLayer ?? index;
        this.parser.traverseNode(window.hierarchy as Record<string, any>, (node, depth) => {
          const attrs = this.parser.extractNodeProperties(node);
          this.collectModalStack(modalStack, attrs, windowLayer + depth, { windowId, windowType });
        });
      }
    }

    const normalizedModalStack = this.normalizeModalStack(modalStack);

    // Return undefined if no useful state was found
    if (selectedElements.length === 0 && !destinationId && normalizedModalStack.length === 0) {
      return undefined;
    }

    return {
      selectedElements,
      destinationId,
      modalStack: normalizedModalStack.length > 0 ? normalizedModalStack : undefined
    };
  }

  /**
   * Extract UI state from an observation, using visual fallback selections if accessibility data is missing.
   */
  extractFromObservation(observation?: ObserveResult): UIState | undefined {
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

  private applySelectedState(
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
  private findTextInChildren(node: Record<string, any> | Record<string, any>[]): string | undefined {
    if (Array.isArray(node)) {
      for (const child of node) {
        const attrs = this.parser.extractNodeProperties(child);
        const text = this.getAttribute(attrs, ["text"]);
        if (text) {
          return text;
        }
        if (child.node) {
          const result = this.findTextInChildren(child.node);
          if (result) {
            return result;
          }
        }
      }
    } else if (node && typeof node === "object") {
      const attrs = this.parser.extractNodeProperties(node);
      const text = this.getAttribute(attrs, ["text"]);
      if (text) {
        return text;
      }
      if (node.node) {
        return this.findTextInChildren(node.node);
      }
    }
    return undefined;
  }

  private getAttribute(
    attrs: Record<string, any>,
    keys: string[]
  ): string | undefined {
    for (const key of keys) {
      const value = attrs[key];
      if (typeof value === "string" && value !== "") {
        return value;
      }
    }
    return undefined;
  }

  private collectModalStack(
    modalStack: ModalState[],
    attrs: Record<string, any>,
    depth: number,
    context?: { windowId?: number; windowType?: string }
  ): void {
    const className = this.getAttribute(attrs, ["class", "className"]);
    if (!className) {
      return;
    }

    const modalType = this.classifyModalType(className);
    if (!modalType) {
      return;
    }

    const modalId = this.getModalIdentifier(attrs, className);
    const windowId = this.getWindowId(attrs, context?.windowId, modalType, modalId, className);
    const windowType = this.getWindowType(attrs, context?.windowType);

    modalStack.push({
      type: modalType,
      identifier: modalId,
      layer: depth,
      windowId,
      windowType
    });
  }

  private getWindowId(
    attrs: Record<string, any>,
    contextWindowId: number | undefined,
    modalType: ModalState["type"],
    modalId: string | undefined,
    className: string
  ): number | undefined {
    const attrWindowId = this.getAttribute(attrs, ["window-id", "windowId", "window_id"]);
    const parsed = attrWindowId ? Number(attrWindowId) : NaN;
    if (Number.isFinite(parsed)) {
      return parsed;
    }

    if (contextWindowId !== undefined) {
      return contextWindowId;
    }

    const stableKey = `${modalType}:${modalId ?? className}`;
    return this.hashToId(stableKey);
  }

  private getWindowType(
    attrs: Record<string, any>,
    contextWindowType: string | undefined
  ): string | undefined {
    return this.getAttribute(attrs, ["window-type", "windowType", "window_type"]) ?? contextWindowType;
  }

  private classifyModalType(className: string): ModalState["type"] | null {
    const normalized = className.toLowerCase();
    if (normalized.includes("alert") || normalized.includes("dialog")) {
      return "dialog";
    }
    if (normalized.includes("actionsheet") || normalized.includes("sheet")) {
      return "bottomsheet";
    }
    if (normalized.includes("popover")) {
      return "popup";
    }
    if (normalized.includes("menu")) {
      return "menu";
    }
    if (normalized.includes("modal") || normalized.includes("presentation")) {
      return "overlay";
    }
    return null;
  }

  private getModalIdentifier(attrs: Record<string, any>, className: string): string | undefined {
    return this.getAttribute(attrs, ["resource-id", "resourceId", "content-desc", "contentDesc", "text"]) ?? className;
  }

  private hashToId(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i += 1) {
      hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
    }
    return hash;
  }

  private normalizeModalStack(modals: ModalState[]): ModalState[] {
    if (modals.length === 0) {
      return [];
    }

    const unique = new Map<string, ModalState>();
    for (const modal of modals) {
      const key = modal.identifier ?? `${modal.type}-${modal.layer}`;
      if (!unique.has(key)) {
        unique.set(key, modal);
      }
    }

    return Array.from(unique.values())
      .sort((a, b) => a.layer - b.layer)
      .map((modal, index) => ({
        ...modal,
        layer: index
      }));
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
