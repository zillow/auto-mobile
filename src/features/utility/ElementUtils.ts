import { Element } from "../../models/Element";
import { Point } from "../../models/Point";
import { ElementBounds } from "../../models";

/**
 * Utility class for working with UI elements
 */
export class ElementUtils {
  /**
   * Calculate the center point of an element
   * @param element - Element to get center for
   * @returns Center point coordinates
   */
  getElementCenter(element: Element): Point {
    const bounds = element.bounds;
    return {
      x: Math.floor((bounds.left + bounds.right) / 2),
      y: Math.floor((bounds.top + bounds.bottom) / 2)
    };
  }

  getSwipeDirectionForScroll(
    direction: "up" | "down" | "left" | "right"
  ): "up" | "down" | "left" | "right" {

    switch (direction) {
      case "up":
        return "down";
      case "down":
        return "up";
      case "left":
        return "right";
      case "right":
        return "left";
    }
  }

  getSwipeDurationFromSpeed(speed: "slow" | "fast" | "normal" = "normal"): number {
    switch (speed) {
      case "slow":
        return 1000;
      case "fast":
        return 100;
      case "normal":
      default:
        return 500;
    }
  }

  /**
   * Calculate start and end coordinates for swipe based on bounds and direction
   * @param direction - Direction to swipe ('up', 'down', 'left', 'right')
   * @param bounds - The coordinate bounds to swipe within
   * @returns Start and end coordinates for the swipe
   */
  getSwipeWithinBounds(
    direction: "up" | "down" | "left" | "right",
    bounds: ElementBounds
  ): { startX: number; startY: number; endX: number; endY: number } {

    const centerX = Math.floor((bounds.left + bounds.right) / 2);
    const centerY = Math.floor((bounds.top + bounds.bottom) / 2);

    // Use full available space with 8px padding
    let startX = centerX;
    let startY = centerY;
    let endX = centerX;
    let endY = centerY;

    switch (direction) {
      case "up":
        // For "up" direction: Swipe finger from bottom to top
        startY = bounds.bottom - (centerY * 0.25);
        endY = bounds.top + (centerY * 0.1);
        break;
      case "down":
        // For "down" direction: Swipe finger from top to bottom
        startY = bounds.top + (centerY * 0.1);
        endY = bounds.bottom - (centerY * 0.1);
        break;
      case "left":
        // For "left" direction: Swipe finger from right to left
        startX = bounds.right - (centerY * 0.1);
        endX = bounds.left + (centerX * 0.1);
        break;
      case "right":
        // For "right" direction: Swipe finger from left to right
        startX = bounds.left + (centerY * 0.1);
        endX = bounds.right - (centerX * 0.1);
        break;
    }

    return { startX, startY, endX, endY };
  }

  /**
   * Check if coordinates are within element bounds
   * @param element - Element to check
   * @param x - X coordinate
   * @param y - Y coordinate
   * @returns True if coordinates are within element bounds
   */
  isPointInElement(element: Element, x: number, y: number): boolean {
    const bounds = element.bounds;
    return (
      x >= bounds.left &&
      x <= bounds.right &&
      y >= bounds.top &&
      y <= bounds.bottom
    );
  }

  /**
   * Check if an element is visible on screen
   * @param element - Element to check
   * @param screenWidth - Screen width
   * @param screenHeight - Screen height
   * @returns True if element is visible
   */
  isElementVisible(element: Element, screenWidth: number, screenHeight: number): boolean {
    const bounds = element.bounds;

    // Check if at least part of the element is within screen bounds
    return (
      bounds.right > 0 &&
      bounds.bottom > 0 &&
      bounds.left < screenWidth &&
      bounds.top < screenHeight
    );
  }

  /**
   * Calculate the visible portion of an element
   * @param element - Element to check
   * @param screenWidth - Screen width
   * @param screenHeight - Screen height
   * @returns Bounds of the visible portion or null if not visible
   */
  getVisibleBounds(element: Element, screenWidth: number, screenHeight: number): Element["bounds"] | null {
    const bounds = element.bounds;

    // Check if element is visible at all
    if (!this.isElementVisible(element, screenWidth, screenHeight)) {
      return null;
    }

    // Calculate visible bounds
    return {
      left: Math.max(0, bounds.left),
      top: Math.max(0, bounds.top),
      right: Math.min(screenWidth, bounds.right),
      bottom: Math.min(screenHeight, bounds.bottom)
    };
  }

  /**
   * Check if an element is fully visible on screen accounting for system insets
   * @param element - The element to check
   * @param screenSize - The screen size
   * @param systemInsets - The system insets
   * @returns Whether the element is fully visible
   */
  isElementFullyVisible(
    element: Element,
    screenSize: { width: number; height: number },
    systemInsets: { top: number; right: number; bottom: number; left: number }
  ): boolean {
    return (
      element.bounds.left >= systemInsets.left &&
      element.bounds.top >= systemInsets.top &&
      element.bounds.right <= (screenSize.width - systemInsets.right) &&
      element.bounds.bottom <= (screenSize.height - systemInsets.bottom)
    );
  }

  /**
   * Check if an element is partially visible on screen accounting for system insets
   * @param element - The element to check
   * @param screenSize - The screen size
   * @param systemInsets - The system insets
   * @returns Whether the element is at least partially visible
   */
  isElementPartiallyVisible(
    element: Element,
    screenSize: { width: number; height: number },
    systemInsets: { top: number; right: number; bottom: number; left: number }
  ): boolean {
    // Check if element is completely outside the visible area
    return !(
      element.bounds.right <= systemInsets.left ||
      element.bounds.bottom <= systemInsets.top ||
      element.bounds.left >= (screenSize.width - systemInsets.right) ||
      element.bounds.top >= (screenSize.height - systemInsets.bottom)
    );
  }

  /**
   * Perform fuzzy text matching between two strings
   * @param text1 - First string to compare
   * @param text2 - Second string to compare
   * @param caseSensitive - Whether to use case-sensitive matching
   * @returns True if the strings match according to fuzzy logic
   */
  fuzzyTextMatch(text1: string, text2: string, caseSensitive: boolean = false): boolean {
    if (!text1 || !text2) {
      return false;
    }

    const str1 = caseSensitive ? text1 : text1.toLowerCase();
    const str2 = caseSensitive ? text2 : text2.toLowerCase();

    // Check if either string contains the other
    return str1.includes(str2) || str2.includes(str1);
  }

  /**
   * Create a text matching function based on options
   * @param text - Text to search for
   * @param fuzzyMatch - Whether to use fuzzy matching
   * @param caseSensitive - Whether to use case-sensitive matching
   * @returns A function that tests if an input string matches the search text
   */
  createTextMatcher(text: string, fuzzyMatch: boolean = true, caseSensitive: boolean = false): (input?: string) => boolean {
    if (!text) {return () => false;}

    const searchText = caseSensitive ? text : text.toLowerCase();

    return (input?: string): boolean => {
      if (!input) {return false;}

      const targetText = caseSensitive ? input : input.toLowerCase();

      return fuzzyMatch
        ? targetText.includes(searchText)
        : targetText === searchText;
    };
  }

  /**
   * Parse element bounds from string to object
   * @param boundsString - The bounds string in format [left,top][right,bottom]
   * @returns The parsed bounds or null if invalid
   */
  parseBounds(boundsString: string): Element["bounds"] | null {
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
   * Extract node properties from the view hierarchy node
   * @param node - The node to extract properties from
   * @returns The node properties
   */
  extractNodeProperties(node: any): any {
    // XML parser from xml2js puts properties in $ object
    return node && node.$ ? node.$ : node;
  }

  /**
   * Parse a node's bounds if they're in string format
   * @param node - The node to parse
   * @returns The node with parsed bounds or null
   */
  parseNodeBounds(node: any): Element | null {
    if (!node) {return null;}

    // Create a copy of the node properties
    const nodeProperties = this.extractNodeProperties(node);
    const parsedNode: any = { ...nodeProperties };

    // Parse bounds if they're in string format
    if (typeof nodeProperties.bounds === "string") {
      const parsedBounds = this.parseBounds(nodeProperties.bounds);
      if (!parsedBounds) {return null;}

      parsedNode.bounds = parsedBounds;
    } else if (!nodeProperties.bounds) {
      return null;
    }

    return parsedNode as Element;
  }

  /**
   * Extract root nodes from view hierarchy, handling different possible structures
   * @param viewHierarchy - The view hierarchy to extract from
   * @returns Array of root nodes
   */
  extractRootNodes(viewHierarchy: any): any[] {
    if (!viewHierarchy) {return [];}

    let rootNodes: any[] = [];

    if (viewHierarchy.hierarchy && viewHierarchy.hierarchy.node) {
      // Standard hierarchy from UI Automator
      if (Array.isArray(viewHierarchy.hierarchy.node)) {
        rootNodes = viewHierarchy.hierarchy.node;
      } else {
        rootNodes = [viewHierarchy.hierarchy.node];
      }
    } else if (viewHierarchy.node) {
      // Direct node structure
      if (Array.isArray(viewHierarchy.node)) {
        rootNodes = viewHierarchy.node;
      } else {
        rootNodes = [viewHierarchy.node];
      }
    } else if (viewHierarchy) {
      // Try using viewHierarchy directly
      rootNodes = [viewHierarchy];
    }

    return rootNodes;
  }

  /**
   * Traverse the view hierarchy and process each node with a provided function
   * @param node - The node to start traversal from
   * @param callback - Function to process each node
   */
  traverseNode(node: any, callback: (node: any) => void): void {
    if (!node) {return;}

    // Process the current node
    callback(node);

    // Traverse child nodes
    if (node.node) {
      const children = node.node;
      if (Array.isArray(children)) {
        for (const child of children) {
          this.traverseNode(child, callback);
        }
      } else if (typeof children === "object") {
        this.traverseNode(children, callback);
      }
    }
  }

  /**
   * Find an element in the view hierarchy that matches the specified text
   * @param viewHierarchy - The view hierarchy to search
   * @param text - The text to search for
   * @param fuzzyMatch - Whether to use fuzzy matching (partial text match)
   * @param caseSensitive - Whether to use case-sensitive matching
   * @returns The found element or null
   */
  findElementByText(
    viewHierarchy: any,
    text: string,
    fuzzyMatch: boolean = true,
    caseSensitive: boolean = false
  ): Element | null {
    if (!viewHierarchy || !text) {
      return null;
    }

    // Create matcher function once instead of repeatedly in the loop
    const matchesText = this.createTextMatcher(text, fuzzyMatch, caseSensitive);
    const rootNodes = this.extractRootNodes(viewHierarchy);
    const matches: Element[] = [];

    // Process each root node
    for (const rootNode of rootNodes) {
      this.traverseNode(rootNode, (node: any) => {
        const nodeProperties = this.extractNodeProperties(node);
        let isMatch = false;

        // Check text attribute
        if (nodeProperties.text && typeof nodeProperties.text === "string" && matchesText(nodeProperties.text)) {
          isMatch = true;
        }

        // Check content-desc attribute
        if (!isMatch && nodeProperties["content-desc"] &&
            typeof nodeProperties["content-desc"] === "string" &&
            matchesText(nodeProperties["content-desc"])) {
          isMatch = true;
        }

        if (isMatch) {
          // Parse bounds if they're in string format
          const parsedNode = this.parseNodeBounds(node);
          if (parsedNode) {
            matches.push(parsedNode);
          }
        }
      });
    }

    // Sort matches by size (smaller elements first) to prefer exact matches
    if (matches.length > 0) {
      matches.sort((a, b) => {
        const aArea = (a.bounds.right - a.bounds.left) * (a.bounds.bottom - a.bounds.top);
        const bArea = (b.bounds.right - b.bounds.left) * (b.bounds.bottom - b.bounds.top);
        return aArea - bArea;
      });
      return matches[0];
    }

    return null;
  }

  /**
   * Find elements by resource ID
   * @param viewHierarchy - The view hierarchy to search
   * @param resourceId - Resource ID to search for
   * @param partialMatch - Whether to allow partial ID matching
   * @returns Array of matching elements
   */
  findElementsByResourceId(
    viewHierarchy: any,
    resourceId: string,
    partialMatch: boolean = false
  ): Element[] {
    if (!viewHierarchy || !resourceId) {
      return [];
    }

    const rootNodes = this.extractRootNodes(viewHierarchy);
    const matches: Element[] = [];

    // Process each root node
    for (const rootNode of rootNodes) {
      this.traverseNode(rootNode, (node: any) => {
        const nodeProperties = this.extractNodeProperties(node);
        if (nodeProperties["resource-id"] && typeof nodeProperties["resource-id"] === "string") {
          const nodeResourceId = nodeProperties["resource-id"];

          if ((partialMatch && nodeResourceId.toLowerCase().includes(resourceId.toLowerCase())) ||
              (!partialMatch && nodeResourceId === resourceId)) {
            const parsedNode = this.parseNodeBounds(node);
            if (parsedNode) {
              matches.push(parsedNode);
            }
          }
        }
      });
    }

    return matches;
  }

  /**
   * Find an element by resource ID (returns first match)
   * @param viewHierarchy - The view hierarchy to search
   * @param resourceId - Resource ID to search for
   * @returns The found element or null
   */
  findElementByResourceId(
    viewHierarchy: any,
    resourceId: string
  ): Element | null {
    const elements = this.findElementsByResourceId(viewHierarchy, resourceId, false);
    return elements.length > 0 ? elements[0] : null;
  }

  /**
   * Find elements by class name
   * @param viewHierarchy - The view hierarchy to search
   * @param className - Class name to search for
   * @returns Array of matching elements
   */
  findElementsByClassName(
    viewHierarchy: any,
    className: string
  ): Element[] {
    if (!viewHierarchy || !className) {
      return [];
    }

    const rootNodes = this.extractRootNodes(viewHierarchy);
    const matches: Element[] = [];

    // Process each root node
    for (const rootNode of rootNodes) {
      this.traverseNode(rootNode, (node: any) => {
        const nodeProperties = this.extractNodeProperties(node);
        if (nodeProperties["class"] && nodeProperties["class"] === className) {
          const parsedNode = this.parseNodeBounds(node);
          if (parsedNode) {
            matches.push(parsedNode);
          }
        }
      });
    }

    return matches;
  }

  /**
   * Find scrollable elements in the view hierarchy
   * @param viewHierarchy - The view hierarchy to search
   * @returns Array of scrollable elements
   */
  findScrollableElements(viewHierarchy: any): Element[] {
    if (!viewHierarchy) {
      return [];
    }

    const rootNodes = this.extractRootNodes(viewHierarchy);
    const scrollables: Element[] = [];

    // Process each root node
    for (const rootNode of rootNodes) {
      this.traverseNode(rootNode, (node: any) => {
        const nodeProperties = this.extractNodeProperties(node);
        if (nodeProperties.scrollable === "true" || nodeProperties.scrollable === true) {
          const parsedNode = this.parseNodeBounds(node);
          if (parsedNode) {
            scrollables.push(parsedNode);
          }
        }
      });
    }

    return scrollables;
  }

  /**
   * Find clickable elements in the view hierarchy
   * @param viewHierarchy - The view hierarchy to search
   * @returns Array of clickable elements
   */
  findClickableElements(viewHierarchy: any): Element[] {
    if (!viewHierarchy) {
      return [];
    }

    const rootNodes = this.extractRootNodes(viewHierarchy);
    const clickables: Element[] = [];

    // Process each root node
    for (const rootNode of rootNodes) {
      this.traverseNode(rootNode, (node: any) => {
        const nodeProperties = this.extractNodeProperties(node);
        if (nodeProperties.clickable === "true" || nodeProperties.clickable === true) {
          const parsedNode = this.parseNodeBounds(node);
          if (parsedNode) {
            clickables.push(parsedNode);
          }
        }
      });
    }

    return clickables;
  }

  /**
   * Find elements that look like dialogs
   * @param viewHierarchy - The view hierarchy to search
   * @returns Array of potential dialog elements
   */
  findDialogElements(viewHierarchy: any): Element[] {
    if (!viewHierarchy) {
      return [];
    }

    const rootNodes = this.extractRootNodes(viewHierarchy);
    const dialogs: Element[] = [];

    // Common dialog identifiers
    const dialogClasses = [
      "android.app.Dialog",
      "android.app.AlertDialog",
      "androidx.appcompat.app.AlertDialog",
      "com.google.android.material.dialog",
      "Dialog",
      "AlertDialog"
    ];

    const dialogResourceIdPartials = [
      "dialog",
      "alert",
      "popup",
      "modal"
    ];

    // Process each root node
    for (const rootNode of rootNodes) {
      this.traverseNode(rootNode, (node: any) => {
        let isDialog = false;
        const nodeProperties = this.extractNodeProperties(node);

        // Check class
        if (nodeProperties.class && dialogClasses.some(c => nodeProperties.class.includes(c))) {
          isDialog = true;
        }

        // Check resource-id
        if (!isDialog && nodeProperties["resource-id"] &&
            dialogResourceIdPartials.some(id => nodeProperties["resource-id"].toLowerCase().includes(id))) {
          isDialog = true;
        }

        if (isDialog) {
          const parsedNode = this.parseNodeBounds(node);
          if (parsedNode) {
            dialogs.push(parsedNode);
          }
        }
      });
    }

    return dialogs;
  }

  /**
   * Find child elements within a parent element's bounds
   * @param viewHierarchy - The view hierarchy to search
   * @param parentElement - The parent element
   * @returns Array of child elements
   */
  findChildElements(viewHierarchy: any, parentElement: Element): Element[] {
    if (!viewHierarchy || !parentElement) {
      return [];
    }

    const rootNodes = this.extractRootNodes(viewHierarchy);
    const childElements: Element[] = [];
    const parentBounds = parentElement.bounds;

    // Find elements that are within the parent's bounds
    for (const rootNode of rootNodes) {
      this.traverseNode(rootNode, (node: any) => {
        const nodeProperties = this.extractNodeProperties(node);
        const nodeBounds = this.parseBounds(nodeProperties.bounds);

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
          const parsedNode = this.parseNodeBounds(node);
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
          const parsedNode = this.parseNodeBounds(child);
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
        const parsedNode = this.parseNodeBounds(children);
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
     * Flatten the view hierarchy into a linear array of elements with indices
     * @param viewHierarchy - The view hierarchy to flatten
     * @returns Array of elements with their indices
     */
  flattenViewHierarchy(viewHierarchy: any): Array<{ element: Element; index: number; text?: string }> {
    if (!viewHierarchy) {
      return [];
    }

    const flattenedElements: Array<{ element: Element; index: number; text?: string }> = [];
    const rootNodes = this.extractRootNodes(viewHierarchy);
    let currentIndex = 0;

    // Process each root node
    for (const rootNode of rootNodes) {
      this.traverseNode(rootNode, (node: any) => {
        const parsedNode = this.parseNodeBounds(node);
        if (parsedNode) {
          const nodeProperties = this.extractNodeProperties(node);
          const accessibilityText = nodeProperties.text || nodeProperties["content-desc"] || undefined;

          flattenedElements.push({
            element: parsedNode,
            index: currentIndex,
            text: accessibilityText
          });
          currentIndex++;
        }
      });
    }

    return flattenedElements;
  }

  /**
     * Find an element by its index in the flattened view hierarchy
     * @param viewHierarchy - The view hierarchy to search
     * @param index - The index of the element to find
     * @returns The element at the specified index or null if not found
     */
  findElementByIndex(viewHierarchy: any, index: number): { element: Element; text?: string } | null {
    if (!viewHierarchy || index < 0) {
      return null;
    }

    const flattenedElements = this.flattenViewHierarchy(viewHierarchy);

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
    return this.fuzzyTextMatch(foundElement.text, expectedText, false);
  }
}
