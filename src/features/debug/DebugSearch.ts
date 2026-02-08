import { AdbClientFactory, defaultAdbClientFactory } from "../../utils/android-cmdline-tools/AdbClientFactory";
import type { AdbExecutor } from "../../utils/android-cmdline-tools/interfaces/AdbExecutor";
import { logger } from "../../utils/logger";
import { Timer, defaultTimer } from "../../utils/SystemTimer";
import { BootedDevice, Element, DebugSearchResult, DebugSearchMatch } from "../../models";
import { ViewHierarchy } from "../observe/ViewHierarchy";
import { NoOpPerformanceTracker } from "../../utils/PerformanceTracker";
import { resolveViewHierarchyForSearch } from "../../utils/viewHierarchySearch";
import { boundsArea } from "../../utils/bounds";
import type { ElementParser } from "../../utils/interfaces/ElementParser";
import type { TextMatcher } from "../../utils/interfaces/TextMatcher";
import type { ElementFinder } from "../../utils/interfaces/ElementFinder";
import { DefaultElementParser } from "../utility/ElementParser";
import { DefaultTextMatcher } from "../utility/TextMatcher";
import { DefaultElementFinder } from "../utility/ElementFinder";

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
   * Container element to restrict search within
   */
  container?: {
    elementId?: string;
    text?: string;
  };

  /**
   * Whether to use partial matching (substring containment, default: true)
   */
  partialMatch?: boolean;

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
  private readonly adb: AdbExecutor;
  private viewHierarchy: ViewHierarchy;
  private timer: Timer;
  private parser: ElementParser;
  private textMatcher: TextMatcher;
  private finder: ElementFinder;

  constructor(
    device: BootedDevice,
    adbFactory: AdbClientFactory = defaultAdbClientFactory,
    timer: Timer = defaultTimer,
    parser: ElementParser = new DefaultElementParser(),
    textMatcher: TextMatcher = new DefaultTextMatcher(),
    finder: ElementFinder = new DefaultElementFinder()
  ) {
    this.device = device;
    this.adb = adbFactory.create(device);
    this.viewHierarchy = new ViewHierarchy(device, adbFactory);
    this.timer = timer;
    this.parser = parser;
    this.textMatcher = textMatcher;
    this.finder = finder;
  }

  /**
   * Execute debug search
   * @param options - Search options
   * @returns Debug search result with all matches and analysis
   */
  async execute(options: DebugSearchOptions): Promise<DebugSearchResult> {
    const startTime = this.timer.now();
    const partialMatch = options.partialMatch !== false;
    const caseSensitive = options.caseSensitive === true;
    const includeNearMisses = options.includeNearMisses !== false;
    const maxNearMisses = options.maxNearMisses || 10;

    logger.info(`[DebugSearch] Starting search - text: "${options.text}", resourceId: "${options.resourceId}"`);

    // Get current view hierarchy
    const perf = new NoOpPerformanceTracker();
    const hierarchy = await this.viewHierarchy.getViewHierarchy({}, perf);
    const searchHierarchy = resolveViewHierarchyForSearch(hierarchy) ?? hierarchy;

    if (!searchHierarchy || !searchHierarchy.hierarchy) {
      return {
        query: {
          text: options.text,
          resourceId: options.resourceId,
          container: options.container,
          partialMatch,
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
    const matchesText = this.textMatcher.createTextMatcher(options.text || "", partialMatch, caseSensitive);

    // Traverse the hierarchy and find all matches
    const rootNodes = this.parser.extractRootNodes(searchHierarchy);

    // If container is specified, find container first
    let containerNode: any = null;
    if (options.container) {
      containerNode = this.finder.findContainerNode(searchHierarchy, options.container);
      if (!containerNode) {
        logger.warn(`[DebugSearch] Container "${options.container.elementId || options.container.text}" not found`);
      }
    }

    const searchNodes = containerNode ? [containerNode] : rootNodes;

    for (const searchNode of searchNodes) {
      this.parser.traverseNode(searchNode, (node: any) => {
        totalElements++;
        const props = this.parser.extractNodeProperties(node);
        const element = this.parser.parseNodeBounds(node);

        if (!element) {return;}

        const elementInfo: Partial<DebugSearchMatch> = {
          className: props.class || props.className,
          resourceId: props["resource-id"],
          clickable: props.clickable === "true" || props.clickable === true,
          enabled: props.enabled !== "false" && props.enabled !== false,
          visible: boundsArea(element.bounds) > 0
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
      const aArea = boundsArea(a.element.bounds);
      const bArea = boundsArea(b.element.bounds);
      return aArea - bArea;
    });

    // Determine which element would be selected by normal search
    const selectedMatch = matches.length > 0 ? matches[0] : undefined;

    const result: DebugSearchResult = {
      query: {
        text: options.text,
        resourceId: options.resourceId,
        container: options.container,
        partialMatch,
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
}
