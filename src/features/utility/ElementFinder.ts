import { Element } from "../../models/Element";
import { ViewHierarchyNode, ViewHierarchyResult } from "../../models";
import { logger } from "../../utils/logger";
import { ElementParser } from "./ElementParser";
import { TextMatcher } from "./TextMatcher";

/**
 * Handles searching and selection of elements in view hierarchy
 */
export class ElementFinder {
  private parser: ElementParser;
  private textMatcher: TextMatcher;

  constructor() {
    this.parser = new ElementParser();
    this.textMatcher = new TextMatcher();
  }

  hasContainerElement(
    viewHierarchy: ViewHierarchyResult,
    container?: { elementId?: string; text?: string }
  ): boolean {
    if (!viewHierarchy || !container) {
      return false;
    }

    return this.findContainerNode(viewHierarchy, container) !== null;
  }

  private findContainerNodeInRoots(
    rootNodes: ViewHierarchyNode[],
    container: { elementId?: string; text?: string },
    matchesContainerText: ((input?: string) => boolean) | null
  ): ViewHierarchyNode | null {
    for (const rootNode of rootNodes) {
      let containerNode: ViewHierarchyNode | null = null;
      this.parser.traverseNode(rootNode, (node: ViewHierarchyNode) => {
        if (containerNode) {
          return; // Already found
        }

        const nodeProperties = this.parser.extractNodeProperties(node);
        const nodeResourceId = nodeProperties["resource-id"];
        const nodeText = nodeProperties.text;
        const nodeContentDesc = nodeProperties["content-desc"];
        const nodeIosLabel = nodeProperties["ios-accessibility-label"];

        if (container.elementId && nodeResourceId === container.elementId) {
          containerNode = node;
          return;
        }

        if (
          matchesContainerText &&
          (
            (typeof nodeText === "string" && matchesContainerText(nodeText)) ||
            (typeof nodeContentDesc === "string" && matchesContainerText(nodeContentDesc)) ||
            (typeof nodeIosLabel === "string" && matchesContainerText(nodeIosLabel))
          )
        ) {
          containerNode = node;
        }
      });

      if (containerNode) {
        return containerNode;
      }
    }

    return null;
  }

  private findContainerNode(
    viewHierarchy: ViewHierarchyResult,
    container: { elementId?: string; text?: string }
  ): ViewHierarchyNode | null {
    if (!viewHierarchy || !container) {
      return null;
    }

    const matchesContainerText = container.text
      ? this.textMatcher.createTextMatcher(container.text, true, false)
      : null;
    const rootNodes = this.parser.extractRootNodes(viewHierarchy);
    const containerInMain = this.findContainerNodeInRoots(
      rootNodes,
      container,
      matchesContainerText
    );
    if (containerInMain) {
      return containerInMain;
    }

    const windowRootGroups = this.parser.extractWindowRootGroups(viewHierarchy, "topmost-first");
    for (const windowRoots of windowRootGroups) {
      const containerInWindow = this.findContainerNodeInRoots(
        windowRoots,
        container,
        matchesContainerText
      );
      if (containerInWindow) {
        return containerInWindow;
      }
    }

    return null;
  }

  private sortElementsByArea(elements: Element[]): void {
    elements.sort((a, b) => {
      const aArea = (a.bounds.right - a.bounds.left) * (a.bounds.bottom - a.bounds.top);
      const bArea = (b.bounds.right - b.bounds.left) * (b.bounds.bottom - b.bounds.top);
      return aArea - bArea;
    });
  }

  private findElementByTextInRoots(
    rootNodes: ViewHierarchyNode[],
    text: string,
    matchesText: (input?: string) => boolean
  ): Element | null {
    const matches: Element[] = [];
    const exactMatches: Element[] = [];

    for (const searchNode of rootNodes) {
      this.parser.traverseNode(searchNode, (node: any) => {
        const nodeProperties = this.parser.extractNodeProperties(node);
        logger.info(`[Element] node: ${nodeProperties["text"]} ${nodeProperties["content-desc"]} ${nodeProperties["class"]}`);

        // Check text attribute
        if (
          nodeProperties.text &&
          typeof nodeProperties.text === "string" &&
          matchesText(nodeProperties.text)
        ) {
          logger.info("[Element] Matches text property");
          const parsedNode = this.parser.parseNodeBounds(node);
          if (parsedNode) {
            if (nodeProperties.text === text) {
              exactMatches.push(parsedNode);
            } else {
              matches.push(parsedNode);
            }
          }
        } else if (
          nodeProperties["content-desc"] &&
          typeof nodeProperties["content-desc"] === "string" &&
          matchesText(nodeProperties["content-desc"])
        ) {
          logger.info("[Element] Matches content-desc property");
          const parsedNode = this.parser.parseNodeBounds(node);
          if (parsedNode) {
            if (nodeProperties["content-desc"] === text) {
              exactMatches.push(parsedNode);
            } else {
              matches.push(parsedNode);
            }
          }
        } else if (
          nodeProperties["ios-accessibility-label"] &&
          typeof nodeProperties["ios-accessibility-label"] === "string" &&
          matchesText(nodeProperties["ios-accessibility-label"])
        ) {
          logger.info("[Element] Matches ios-accessibility-label property");
          const parsedNode = this.parser.parseNodeBounds(node);
          if (parsedNode) {
            if (nodeProperties["ios-accessibility-label"] === text) {
              exactMatches.push(parsedNode);
            } else {
              matches.push(parsedNode);
            }
          }
        } else if (
          matchesText(
            nodeProperties.text || nodeProperties["content-desc"] || ""
          ) &&
          (
            nodeProperties["ios-role"] === "AXButton" ||
            nodeProperties.class === "Button" ||
            nodeProperties.clickable === "true"
          )
        ) {
          logger.info("[Element] Matches clickable element with text");
          const parsedNode = this.parser.parseNodeBounds(node);
          if (parsedNode) {
            matches.push(parsedNode);
          }
        } else {
          logger.debug(`[Element] No match found in properties`);
        }
      });
    }

    if (exactMatches.length > 0) {
      this.sortElementsByArea(exactMatches);
      return exactMatches[0];
    }

    if (matches.length > 0) {
      this.sortElementsByArea(matches);
      return matches[0];
    }

    return null;
  }

  private findElementByResourceIdInRoots(
    rootNodes: ViewHierarchyNode[],
    resourceId: string,
    partialMatch: boolean
  ): Element | null {
    const matches: Element[] = [];

    for (const searchNode of rootNodes) {
      this.parser.traverseNode(searchNode, (node: any) => {
        const nodeProperties = this.parser.extractNodeProperties(node);
        if (nodeProperties["resource-id"] && typeof nodeProperties["resource-id"] === "string") {
          const nodeResourceId = nodeProperties["resource-id"];
          if (
            nodeResourceId === resourceId ||
            (partialMatch && nodeResourceId.toLowerCase().includes(resourceId.toLowerCase()))
          ) {
            const parsedNode = this.parser.parseNodeBounds(node);
            if (parsedNode) {
              matches.push(parsedNode);
            }
          }
        }
      });
    }

    if (matches.length > 0) {
      this.sortElementsByArea(matches);
      return matches[0];
    }

    return null;
  }

  private findScrollableContainerInRoots(rootNodes: ViewHierarchyNode[]): Element | null {
    for (const rootNode of rootNodes) {
      let foundScrollable: Element | null = null;
      this.parser.traverseNode(rootNode, (node: any) => {
        if (foundScrollable) {return;} // Already found one
        const nodeProperties = this.parser.extractNodeProperties(node);
        if (nodeProperties.scrollable === "true" || nodeProperties.scrollable === true) {
          const parsedNode = this.parser.parseNodeBounds(node);
          if (parsedNode) {
            foundScrollable = parsedNode;
          }
        }
      });
      if (foundScrollable) {
        return foundScrollable;
      }
    }

    return null;
  }

  private findFocusedTextInputInRoots(rootNodes: ViewHierarchyNode[], inputClasses: string[]): Element | null {
    for (const rootNode of rootNodes) {
      let foundElement: Element | null = null;
      this.parser.traverseNode(rootNode, (node: any) => {
        if (foundElement) {return;} // Already found one

        const nodeProperties = this.parser.extractNodeProperties(node);
        // Check for both 'class' and 'className' property names
        const nodeClass = nodeProperties.class || nodeProperties.className;
        if ((nodeProperties.focused === "true" || nodeProperties.focused === true) &&
          nodeClass &&
          inputClasses.some(cls => nodeClass.includes(cls))) {
          const parsedNode = this.parser.parseNodeBounds(node);
          if (parsedNode) {
            foundElement = parsedNode;
          }
        }
      });

      if (foundElement) {return foundElement;}
    }

    return null;
  }

  /**
   * Find an element in the view hierarchy that matches the specified text
   * @param viewHierarchy - The view hierarchy to search
   * @param text - The text to search for
   * @param container - Container element selector to restrict the search within its child nodes
   * @param fuzzyMatch - Whether to use fuzzy matching (partial text match)
   * @param caseSensitive - Whether to use case-sensitive matching
   * @returns The found element or null
   */
  findElementByText(
    viewHierarchy: ViewHierarchyResult,
    text: string,
    container: { elementId?: string; text?: string } | null = null,
    fuzzyMatch: boolean = true,
    caseSensitive: boolean = false
  ): Element | null {
    if (!viewHierarchy || !text) {
      return null;
    }

    // Create matcher function once instead of repeatedly in the loop
    const matchesText = this.textMatcher.createTextMatcher(text, fuzzyMatch, caseSensitive);
    const containerNode = container
      ? this.findContainerNode(viewHierarchy, container)
      : null;

    if (container && !containerNode) {
      // Container not found, return null
      return null;
    }

    if (containerNode) {
      return this.findElementByTextInRoots([containerNode], text, matchesText);
    }

    const rootNodes = this.parser.extractRootNodes(viewHierarchy);
    const mainMatch = this.findElementByTextInRoots(rootNodes, text, matchesText);
    if (mainMatch) {
      return mainMatch;
    }

    const windowRootGroups = this.parser.extractWindowRootGroups(viewHierarchy, "topmost-first");
    for (const windowRoots of windowRootGroups) {
      const windowMatch = this.findElementByTextInRoots(windowRoots, text, matchesText);
      if (windowMatch) {
        return windowMatch;
      }
    }

    return null;
  }

  /**
   * Find elements by resource ID
   * @param viewHierarchy - The view hierarchy to search
   * @param resourceId - Resource ID to search for
   * @param container - Container element selector to restrict the search within its child nodes
   * @param partialMatch - Whether to allow partial ID matching
   * @returns Array of matching elements
   */
  findElementByResourceId(
    viewHierarchy: ViewHierarchyResult,
    resourceId: string,
    container: { elementId?: string; text?: string } | null = null,
    partialMatch: boolean = false
  ): Element | null {
    if (!viewHierarchy || !resourceId) {
      return null;
    }

    const containerNode = container
      ? this.findContainerNode(viewHierarchy, container)
      : null;

    if (container && !containerNode) {
      // Container not found, return empty list
      return null;
    }

    if (containerNode) {
      return this.findElementByResourceIdInRoots([containerNode], resourceId, partialMatch);
    }

    const rootNodes = this.parser.extractRootNodes(viewHierarchy);
    const mainMatch = this.findElementByResourceIdInRoots(rootNodes, resourceId, partialMatch);
    if (mainMatch) {
      return mainMatch;
    }

    const windowRootGroups = this.parser.extractWindowRootGroups(viewHierarchy, "topmost-first");
    for (const windowRoots of windowRootGroups) {
      const windowMatch = this.findElementByResourceIdInRoots(windowRoots, resourceId, partialMatch);
      if (windowMatch) {
        return windowMatch;
      }
    }

    return null;
  }

  /**
   * Find an element by its index in the flattened view hierarchy
   * @param viewHierarchy - The view hierarchy to search
   * @param index - The index of the element to find
   * @returns The element at the specified index or null if not found
   */
  findElementByIndex(viewHierarchy: ViewHierarchyResult, index: number): { element: Element; text?: string } | null {
    if (!viewHierarchy || index < 0) {
      return null;
    }

    const flattenedElements = this.parser.flattenViewHierarchy(viewHierarchy, {
      includeWindows: true,
      windowOrder: "topmost-first"
    });

    if (index >= flattenedElements.length) {
      return null;
    }

    const found = flattenedElements[index];
    return {
      element: found.element,
      text: found.text
    };
  }

  /**
   * Find scrollable elements in the view hierarchy
   * @param viewHierarchy - The view hierarchy to search
   * @returns Array of scrollable elements
   */
  findScrollableElements(viewHierarchy: ViewHierarchyResult): Element[] {
    if (!viewHierarchy) {
      return [];
    }

    const rootNodes = [
      ...this.parser.extractRootNodes(viewHierarchy),
      ...this.parser.extractWindowRootNodes(viewHierarchy, "topmost-first")
    ];
    const scrollables: Element[] = [];

    // Process each root node
    for (const rootNode of rootNodes) {
      this.parser.traverseNode(rootNode, (node: any) => {
        const nodeProperties = this.parser.extractNodeProperties(node);
        if (nodeProperties.scrollable === "true" || nodeProperties.scrollable === true) {
          const parsedNode = this.parser.parseNodeBounds(node);
          if (parsedNode) {
            scrollables.push(parsedNode);
          }
        }
      });
    }

    return scrollables;
  }

  /**
   * Find the first scrollable container element in the view hierarchy
   * @param viewHierarchy - The view hierarchy to search
   * @returns The first scrollable element found, or null
   */
  findScrollableContainer(viewHierarchy: ViewHierarchyResult): Element | null {
    if (!viewHierarchy) {
      return null;
    }

    const rootNodes = this.parser.extractRootNodes(viewHierarchy);
    const mainScrollable = this.findScrollableContainerInRoots(rootNodes);
    if (mainScrollable) {
      return mainScrollable;
    }

    const windowRootGroups = this.parser.extractWindowRootGroups(viewHierarchy, "topmost-first");
    for (const windowRoots of windowRootGroups) {
      const windowScrollable = this.findScrollableContainerInRoots(windowRoots);
      if (windowScrollable) {
        return windowScrollable;
      }
    }

    return null;
  }

  /**
   * Find clickable elements in the view hierarchy
   * @param viewHierarchy - The view hierarchy to search
   * @returns Array of clickable elements
   */
  findClickableElements(viewHierarchy: ViewHierarchyResult): Element[] {
    if (!viewHierarchy) {
      return [];
    }

    const rootNodes = [
      ...this.parser.extractRootNodes(viewHierarchy),
      ...this.parser.extractWindowRootNodes(viewHierarchy, "topmost-first")
    ];
    const clickables: Element[] = [];

    // Process each root node
    for (const rootNode of rootNodes) {
      this.parser.traverseNode(rootNode, (node: any) => {
        const nodeProperties = this.parser.extractNodeProperties(node);
        if (nodeProperties.clickable === "true" || nodeProperties.clickable === true) {
          const parsedNode = this.parser.parseNodeBounds(node);
          if (parsedNode) {
            clickables.push(parsedNode);
          }
        }
      });
    }

    return clickables;
  }

  /**
   * Find child elements within a parent element's bounds
   * @param viewHierarchy - The view hierarchy to search
   * @param parentElement - The parent element
   * @returns Array of child elements
   */
  findChildElements(viewHierarchy: ViewHierarchyResult, parentElement: Element): Element[] {
    if (!viewHierarchy || !parentElement) {
      return [];
    }

    const rootNodes = [
      ...this.parser.extractRootNodes(viewHierarchy),
      ...this.parser.extractWindowRootNodes(viewHierarchy, "topmost-first")
    ];
    const childElements: Element[] = [];
    const parentBounds = parentElement.bounds;

    // Find elements that are within the parent's bounds
    for (const rootNode of rootNodes) {
      this.parser.traverseNode(rootNode, (node: any) => {
        const nodeProperties = this.parser.extractNodeProperties(node);
        const nodeBounds = this.parser.parseBounds(nodeProperties.bounds);

        if (!nodeBounds) {
          return;
        }

        // Check if the node is within the parent's bounds but not the parent itself
        const isWithin =
          nodeBounds.left >= parentBounds.left &&
          nodeBounds.top >= parentBounds.top &&
          nodeBounds.right <= parentBounds.right &&
          nodeBounds.bottom <= parentBounds.bottom;

        const isNotParent =
          nodeBounds.left !== parentBounds.left ||
          nodeBounds.top !== parentBounds.top ||
          nodeBounds.right !== parentBounds.right ||
          nodeBounds.bottom !== parentBounds.bottom;

        if (isWithin && isNotParent) {
          const parsedNode = this.parser.parseNodeBounds(node);
          if (parsedNode) {
            childElements.push(parsedNode);
          }
        }
      });
    }

    // Sort elements by vertical position
    childElements.sort((a, b) => a.bounds.top - b.bounds.top);

    return childElements;
  }

  /**
   * Find elements that look like spannable text elements
   * @param element - The parent element to search within
   * @returns Array of spannable elements or null if none found
   */
  findSpannables(element: Element): Element[] | null {
    if (!element) {
      return null;
    }

    // Common classes for spannable text elements in Android
    const spannableClasses = [
      "android.widget.TextView",
      "android.widget.EditText",
      "android.widget.Button",
      "android.widget.CheckBox",
      "android.widget.RadioButton",
      "android.widget.Switch",
      "android.widget.Spinner"
    ];

    // Check if the element itself is a spannable
    if (element.class && spannableClasses.some(cls => element.class?.includes(cls)) && element.text) {
      return [element];
    }

    // Find all spannable children
    const spannables: Element[] = [];

    // Process each child if the node structure is available
    if (element.node) {
      const children = element.node;
      if (Array.isArray(children)) {
        for (const child of children) {
          const parsedNode = this.parser.parseNodeBounds(child);
          if (parsedNode && parsedNode.class &&
              spannableClasses.some(cls => parsedNode.class?.includes(cls)) &&
              parsedNode.text) {
            spannables.push(parsedNode);
          }

          // Recursively search for spannables in this child
          if (parsedNode) {
            const childSpannables = this.findSpannables(parsedNode);
            if (childSpannables) {
              spannables.push(...childSpannables);
            }
          }
        }
      } else if (typeof children === "object") {
        const parsedNode = this.parser.parseNodeBounds(children);
        if (parsedNode) {
          const childSpannables = this.findSpannables(parsedNode);
          if (childSpannables) {
            spannables.push(...childSpannables);
          }
        }
      }
    }

    return spannables.length > 0 ? spannables : null;
  }

  /**
   * Find a focused text input in the view hierarchy
   * @param viewHierarchy - The view hierarchy to search
   * @returns The focused text input element or null if not found
   */
  findFocusedTextInput(viewHierarchy: any): any {
    const inputClasses = [
      "android.widget.EditText",
      "android.widget.AutoCompleteTextView",
      "android.widget.MultiAutoCompleteTextView",
      "androidx.appcompat.widget.AppCompatEditText"
    ];

    const rootNodes = this.parser.extractRootNodes(viewHierarchy);
    const mainMatch = this.findFocusedTextInputInRoots(rootNodes, inputClasses);
    if (mainMatch) {
      return mainMatch;
    }

    const windowRootGroups = this.parser.extractWindowRootGroups(viewHierarchy, "topmost-first");
    for (const windowRoots of windowRootGroups) {
      const windowMatch = this.findFocusedTextInputInRoots(windowRoots, inputClasses);
      if (windowMatch) {
        return windowMatch;
      }
    }

    return null;
  }

  /**
   * Check if an element is currently focused based on view hierarchy attributes
   * @param element - The element to check
   * @returns True if the element appears to be focused
   */
  isElementFocused(element: any): boolean {
    // Check for focus-related attributes
    const focused = element.focused === "true" || element.focused === true;
    const selected = element.selected === "true" || element.selected === true;

    // Some UI frameworks use 'isFocused' instead of 'focused'
    const isFocused = element.isFocused === "true" || element.isFocused === true;

    // Check if element has keyboard focus (for text inputs)
    const hasKeyboardFocus = element["has-keyboard-focus"] === "true" || element["has-keyboard-focus"] === true;

    return focused || selected || isFocused || hasKeyboardFocus;
  }

  /**
   * Validate that an element with optional text matches expectations
   * @param foundElement - The element found by index
   * @param expectedText - Optional expected text for validation
   * @returns True if the element matches expectations
   */
  validateElementText(foundElement: { element: Element; text?: string }, expectedText?: string): boolean {
    if (!expectedText) {
      return true; // No text validation required
    }

    if (!foundElement.text) {
      return false; // Expected text but element has no text
    }

    // Use fuzzy matching for text validation
    return this.textMatcher.fuzzyTextMatch(foundElement.text, expectedText, false);
  }
}
