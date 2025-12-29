import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { logger } from "../../utils/logger";
import { BootedDevice, Element, ViewHierarchyResult, DebugSearchResult, DebugSearchMatch } from "../../models";
import { ViewHierarchy } from "../observe/ViewHierarchy";
import { ElementUtils } from "../utility/ElementUtils";
import { NoOpPerformanceTracker } from "../../utils/PerformanceTracker";

export interface DebugSearchOptions {
  /**
   * Text to search for
   */
  text?: string;

  /**
   * Resource ID to search for
   */
  resourceId?: string;

  /**
   * Container element ID to restrict search within
   */
  containerElementId?: string;

  /**
   * Whether to use fuzzy matching (default: true)
   */
  fuzzyMatch?: boolean;

  /**
   * Whether to use case-sensitive matching (default: false)
   */
  caseSensitive?: boolean;

  /**
   * Include near-misses in the result (elements that were close to matching)
   */
  includeNearMisses?: boolean;

  /**
   * Maximum number of near-misses to include
   */
  maxNearMisses?: number;
}

/**
 * Feature to debug element search operations
 * Shows all matching elements and explains why certain elements were/weren't selected
 */
export class DebugSearch {
  private device: BootedDevice;
  private readonly adb: AdbClient;
  private viewHierarchy: ViewHierarchy;
  private elementUtils: ElementUtils;

  constructor(
    device: BootedDevice,
    adb: AdbClient | null = null
  ) {
    this.device = device;
    this.adb = adb || new AdbClient(device);
    this.viewHierarchy = new ViewHierarchy(device, this.adb);
    this.elementUtils = new ElementUtils();
  }

  /**
   * Execute debug search
   * @param options - Search options
   * @returns Debug search result with all matches and analysis
   */
  async execute(options: DebugSearchOptions): Promise<DebugSearchResult> {
    const startTime = Date.now();
    const fuzzyMatch = options.fuzzyMatch !== false;
    const caseSensitive = options.caseSensitive === true;
    const includeNearMisses = options.includeNearMisses !== false;
    const maxNearMisses = options.maxNearMisses || 10;

    logger.info(`[DebugSearch] Starting search - text: "${options.text}", resourceId: "${options.resourceId}"`);

    // Get current view hierarchy
    const perf = new NoOpPerformanceTracker();
    const hierarchy = await this.viewHierarchy.getViewHierarchy({}, perf);

    if (!hierarchy || !hierarchy.hierarchy) {
      return {
        query: {
          text: options.text,
          resourceId: options.resourceId,
          containerElementId: options.containerElementId,
          fuzzyMatch,
          caseSensitive
        },
        matches: [],
        totalElements: 0,
        timestamp: startTime
      };
    }

    const matches: DebugSearchMatch[] = [];
    const nearMisses: { element: Element; property: string; value: string; reason: string }[] = [];
    let totalElements = 0;

    // Create text matcher
    const matchesText = this.createTextMatcher(options.text || "", fuzzyMatch, caseSensitive);

    // Traverse the hierarchy and find all matches
    const rootNodes = this.extractRootNodes(hierarchy);

    // If containerElementId is specified, find container first
    let containerNode: any = null;
    if (options.containerElementId) {
      for (const rootNode of rootNodes) {
        this.traverseNode(rootNode, (node: any) => {
          if (containerNode) {return;}
          const props = this.extractNodeProperties(node);
          if (props["resource-id"]?.includes(options.containerElementId!)) {
            containerNode = node;
          }
        });
        if (containerNode) {break;}
      }

      if (!containerNode) {
        logger.warn(`[DebugSearch] Container "${options.containerElementId}" not found`);
      }
    }

    const searchNodes = containerNode ? [containerNode] : rootNodes;

    for (const searchNode of searchNodes) {
      this.traverseNode(searchNode, (node: any) => {
        totalElements++;
        const props = this.extractNodeProperties(node);
        const element = this.parseNodeBounds(node);

        if (!element) {return;}

        const elementInfo: Partial<DebugSearchMatch> = {
          className: props.class || props.className,
          resourceId: props["resource-id"],
          clickable: props.clickable === "true" || props.clickable === true,
          enabled: props.enabled !== "false" && props.enabled !== false,
          visible: this.isElementVisible(element)
        };

        // Check for text match
        if (options.text) {
          // Check text property
          if (props.text && typeof props.text === "string") {
            if (matchesText(props.text)) {
              matches.push({
                element,
                matchedProperty: "text",
                matchedValue: props.text,
                isExactMatch: props.text === options.text,
                ...elementInfo
              } as DebugSearchMatch);
            } else if (includeNearMisses && this.isSimilar(props.text, options.text)) {
              nearMisses.push({
                element,
                property: "text",
                value: props.text,
                reason: `Similar but didn't match: "${props.text}" vs "${options.text}"`
              });
            }
          }

          // Check content-desc
          if (props["content-desc"] && typeof props["content-desc"] === "string") {
            if (matchesText(props["content-desc"])) {
              matches.push({
                element,
                matchedProperty: "content-desc",
                matchedValue: props["content-desc"],
                isExactMatch: props["content-desc"] === options.text,
                ...elementInfo
              } as DebugSearchMatch);
            } else if (includeNearMisses && this.isSimilar(props["content-desc"], options.text)) {
              nearMisses.push({
                element,
                property: "content-desc",
                value: props["content-desc"],
                reason: `Similar but didn't match: "${props["content-desc"]}" vs "${options.text}"`
              });
            }
          }

          // Check iOS accessibility label
          if (props["ios-accessibility-label"] && typeof props["ios-accessibility-label"] === "string") {
            if (matchesText(props["ios-accessibility-label"])) {
              matches.push({
                element,
                matchedProperty: "ios-accessibility-label",
                matchedValue: props["ios-accessibility-label"],
                isExactMatch: props["ios-accessibility-label"] === options.text,
                ...elementInfo
              } as DebugSearchMatch);
            }
          }
        }

        // Check for resource ID match
        if (options.resourceId) {
          const nodeResourceId = props["resource-id"];
          if (nodeResourceId) {
            const idMatches = nodeResourceId.includes(options.resourceId) ||
              nodeResourceId.endsWith(`:id/${options.resourceId}`);

            if (idMatches) {
              matches.push({
                element,
                matchedProperty: "resource-id",
                matchedValue: nodeResourceId,
                isExactMatch: nodeResourceId === options.resourceId ||
                  nodeResourceId.endsWith(`:id/${options.resourceId}`),
                ...elementInfo
              } as DebugSearchMatch);
            } else if (includeNearMisses && this.isSimilar(nodeResourceId, options.resourceId)) {
              nearMisses.push({
                element,
                property: "resource-id",
                value: nodeResourceId,
                reason: `Similar resource ID: "${nodeResourceId}" vs "${options.resourceId}"`
              });
            }
          }
        }
      });
    }

    // Sort matches: exact matches first, then by smallest area
    matches.sort((a, b) => {
      if (a.isExactMatch !== b.isExactMatch) {
        return a.isExactMatch ? -1 : 1;
      }
      const aArea = this.getElementArea(a.element);
      const bArea = this.getElementArea(b.element);
      return aArea - bArea;
    });

    // Determine which element would be selected by normal search
    const selectedMatch = matches.length > 0 ? matches[0] : undefined;

    const result: DebugSearchResult = {
      query: {
        text: options.text,
        resourceId: options.resourceId,
        containerElementId: options.containerElementId,
        fuzzyMatch,
        caseSensitive
      },
      matches,
      selectedMatch,
      totalElements,
      timestamp: startTime
    };

    if (includeNearMisses && nearMisses.length > 0) {
      result.nearMisses = nearMisses.slice(0, maxNearMisses);
    }

    logger.info(`[DebugSearch] Found ${matches.length} matches, ${nearMisses.length} near-misses out of ${totalElements} elements`);

    return result;
  }

  /**
   * Create a text matcher function
   */
  private createTextMatcher(
    text: string,
    fuzzyMatch: boolean,
    caseSensitive: boolean
  ): (value: string) => boolean {
    if (!text) {return () => false;}

    const searchText = caseSensitive ? text : text.toLowerCase();

    return (value: string) => {
      const compareValue = caseSensitive ? value : value.toLowerCase();
      if (fuzzyMatch) {
        return compareValue.includes(searchText);
      }
      return compareValue === searchText;
    };
  }

  /**
   * Check if two strings are similar (for near-miss detection)
   */
  private isSimilar(a: string, b: string): boolean {
    if (!a || !b) {return false;}
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();

    // Check if one contains a significant portion of the other
    if (aLower.length > 3 && bLower.length > 3) {
      // Check for common substring
      const shorter = aLower.length < bLower.length ? aLower : bLower;
      const longer = aLower.length < bLower.length ? bLower : aLower;

      // If the shorter string is at least 50% of the longer and they share a common prefix/suffix
      if (shorter.length >= longer.length * 0.5) {
        if (longer.startsWith(shorter.substring(0, 3)) ||
            longer.endsWith(shorter.substring(shorter.length - 3))) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Calculate element area
   */
  private getElementArea(element: Element): number {
    return (element.bounds.right - element.bounds.left) *
           (element.bounds.bottom - element.bounds.top);
  }

  /**
   * Check if element is visible on screen
   */
  private isElementVisible(element: Element): boolean {
    const bounds = element.bounds;
    // Simple visibility check - element has positive dimensions
    return bounds.right > bounds.left && bounds.bottom > bounds.top;
  }

  /**
   * Extract root nodes from view hierarchy
   */
  private extractRootNodes(viewHierarchy: ViewHierarchyResult): any[] {
    const hierarchy = viewHierarchy.hierarchy as any;
    if (!hierarchy) {return [];}

    if (Array.isArray(hierarchy.node)) {
      return hierarchy.node;
    } else if (hierarchy.node) {
      return [hierarchy.node];
    } else if (hierarchy.hierarchy) {
      return [hierarchy.hierarchy];
    }
    return [hierarchy];
  }

  /**
   * Traverse node tree
   */
  private traverseNode(node: any, callback: (node: any) => void): void {
    if (!node) {return;}
    callback(node);

    const children = node.node || node.children;
    if (Array.isArray(children)) {
      for (const child of children) {
        this.traverseNode(child, callback);
      }
    } else if (children) {
      this.traverseNode(children, callback);
    }
  }

  /**
   * Extract node properties
   */
  private extractNodeProperties(node: any): Record<string, any> {
    // Handle both XML-style ($ attributes) and JSON-style (direct properties)
    if (node.$) {
      return node.$;
    }
    return node;
  }

  /**
   * Parse node bounds into Element
   */
  private parseNodeBounds(node: any): Element | null {
    const props = this.extractNodeProperties(node);
    const boundsStr = props.bounds;

    if (!boundsStr) {
      // Try to get bounds from left/top/right/bottom properties
      if (props.left !== undefined && props.top !== undefined &&
          props.right !== undefined && props.bottom !== undefined) {
        return {
          bounds: {
            left: Number(props.left),
            top: Number(props.top),
            right: Number(props.right),
            bottom: Number(props.bottom)
          },
          text: props.text,
          contentDesc: props["content-desc"],
          resourceId: props["resource-id"],
          className: props.class || props.className,
          clickable: props.clickable === "true" || props.clickable === true,
          enabled: props.enabled !== "false" && props.enabled !== false,
          focused: props.focused === "true" || props.focused === true
        };
      }
      return null;
    }

    // Parse bounds string like "[0,0][1080,1920]"
    const matches = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!matches) {return null;}

    return {
      bounds: {
        left: parseInt(matches[1], 10),
        top: parseInt(matches[2], 10),
        right: parseInt(matches[3], 10),
        bottom: parseInt(matches[4], 10)
      },
      text: props.text,
      contentDesc: props["content-desc"],
      resourceId: props["resource-id"],
      className: props.class || props.className,
      clickable: props.clickable === "true" || props.clickable === true,
      enabled: props.enabled !== "false" && props.enabled !== false,
      focused: props.focused === "true" || props.focused === true
    };
  }
}
