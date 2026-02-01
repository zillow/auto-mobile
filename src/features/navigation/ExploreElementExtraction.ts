import type { Element } from "../../models";
import type { ElementParser } from "../utility/ElementParser";
import type { TrackedElement } from "./ExploreTypes";

/**
 * Extract elements likely to be navigation controls
 */
export function extractNavigationElements(
  viewHierarchy: any,
  elementParser: ElementParser
): Element[] {
  const flatElements = elementParser.flattenViewHierarchy(viewHierarchy);
  const navigationElements: Element[] = [];
  const targetPackage = viewHierarchy.packageName;

  for (const { element, depth } of flatElements) {
    if (isNavigationCandidate(element)) {
      // Filter by package name if available (keep only elements from target app)
      if (targetPackage && element.package && element.package !== targetPackage) {
        continue;
      }

      // Enrich element with properties from child nodes (for Compose UI)
      const enrichedElement = enrichElementWithChildProperties(element);

      // Store depth information for scoring
      (enrichedElement as any).hierarchyDepth = depth;

      navigationElements.push(enrichedElement);
    }
  }

  return navigationElements;
}

/**
 * Enrich element with properties from child nodes (for Compose UI elements)
 */
export function enrichElementWithChildProperties(element: Element): Element {
  const enriched = { ...element };

  // For Compose elements, text and className might be on child nodes
  if ((element as any).node) {
    const children = Array.isArray((element as any).node)
      ? (element as any).node
      : [(element as any).node];

    for (const child of children) {
      // Extract text from first child with text
      if (!enriched.text && child.text) {
        enriched.text = child.text;
      }

      // Extract className from first child with className
      if (!enriched["class"] && child.className) {
        enriched["class"] = child.className;
      }

      // Extract content-desc from first child with content-desc
      if (!enriched["content-desc"] && child["content-desc"]) {
        enriched["content-desc"] = child["content-desc"];
      }
    }
  }

  return enriched;
}

/**
 * Extract scrollable containers for swiping
 */
export function extractScrollableContainers(
  viewHierarchy: any,
  elementParser: ElementParser
): Element[] {
  const flatElements = elementParser.flattenViewHierarchy(viewHierarchy);
  const scrollableContainers: Element[] = [];
  const targetPackage = viewHierarchy.packageName;

  for (const { element, depth } of flatElements) {
    // Must be scrollable
    const isScrollable =
      element.scrollable === true || (element.scrollable as any) === "true";
    if (!isScrollable) {
      continue;
    }

    // Filter by package name if available
    if (targetPackage && element.package && element.package !== targetPackage) {
      continue;
    }

    // Must have reasonable size for scrolling
    if (element.bounds) {
      const width = element.bounds.right - element.bounds.left;
      const height = element.bounds.bottom - element.bounds.top;
      if (width < 50 || height < 50) {
        continue;
      }
    }

    // Store depth information for scoring
    (element as any).hierarchyDepth = depth;

    scrollableContainers.push(element);
  }

  return scrollableContainers;
}

/**
 * Check if element is a navigation candidate
 */
export function isNavigationCandidate(element: Element): boolean {
  // Must be clickable (handle both boolean and string values from XML parsing)
  const isClickable =
    element.clickable === true || (element.clickable as any) === "true";
  if (!isClickable) {
    return false;
  }

  // Must be enabled (handle both boolean and string values from XML parsing)
  const isEnabled =
    element.enabled !== false && (element.enabled as any) !== "false";
  if (!isEnabled) {
    return false;
  }

  // Must have reasonable size
  if (element.bounds) {
    const width = element.bounds.right - element.bounds.left;
    const height = element.bounds.bottom - element.bounds.top;
    if (width < 10 || height < 10) {
      return false;
    }
  }

  // Check if it looks like a navigation element
  const className = element["class"]?.toLowerCase() ?? "";

  // Avoid input elements
  if (className.includes("edittext") || className.includes("textfield")) {
    return false;
  }

  // Avoid checkboxes and switches
  if (className.includes("checkbox") || className.includes("switch")) {
    return false;
  }

  return true;
}

/**
 * Extract all elements from hierarchy (including non-clickable)
 */
export function extractAllElements(
  viewHierarchy: any,
  elementParser: ElementParser
): Element[] {
  const flatElements = elementParser.flattenViewHierarchy(viewHierarchy);
  return flatElements.map(({ element }) => element);
}

/**
 * Generate unique key for element tracking
 */
export function getElementKey(element: Element): string {
  const parts: string[] = [];

  if (element["resource-id"]) {
    parts.push(`id:${element["resource-id"]}`);
  }
  if (element.text) {
    parts.push(`text:${element.text}`);
  }
  if (element["content-desc"]) {
    parts.push(`desc:${element["content-desc"]}`);
  }
  if (element["class"]) {
    parts.push(`class:${element["class"]}`);
  }

  return parts.join("|") || "unknown";
}

/**
 * Filter out elements that have been exhausted
 */
export function filterUnexhaustedElements(
  elements: Element[],
  exploredElements: Map<string, TrackedElement>,
  currentScreen: string | null
): Element[] {
  return elements.filter(element => {
    const elementKey = getElementKey(element);
    const tracked = exploredElements.get(elementKey);

    // Allow if never tried
    if (!tracked) {
      return true;
    }

    // Allow if tried on different screen
    if (tracked.lastInteractionScreen !== currentScreen) {
      return true;
    }

    // Filter out if tried too many times from this screen
    return tracked.interactionCount < 2;
  });
}
