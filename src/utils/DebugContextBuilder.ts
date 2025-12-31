import { BootedDevice, Element } from "../models";
import { DebugSearch } from "../features/debug/DebugSearch";
import { isDebugModeEnabled } from "./debug";

/**
 * Debug information about an element search failure
 */
export interface ElementSearchDebugInfo {
  /**
   * What was being searched for
   */
  searchCriteria: {
    text?: string;
    resourceId?: string;
    containerElementId?: string;
  };

  /**
   * Elements that were close matches but didn't match exactly
   */
  nearMisses?: Array<{
    element: Element;
    property: string;
    value: string;
    reason: string;
  }>;

  /**
   * Total number of elements checked
   */
  totalElementsChecked?: number;

  /**
   * Current device state
   */
  deviceState?: {
    currentActivity?: string;
    focusedWindow?: string;
  };
}

/**
 * Build debug context for element search failures
 * Only collects information if debug mode is enabled
 */
export async function buildElementSearchDebugContext(
  device: BootedDevice | null,
  searchCriteria: {
    text?: string;
    resourceId?: string;
    containerElementId?: string;
  }
): Promise<ElementSearchDebugInfo | undefined> {
  // Only build debug context if debug mode is enabled
  if (!isDebugModeEnabled()) {
    return undefined;
  }

  // Can't build debug context without a device
  if (!device) {
    return {
      searchCriteria,
      nearMisses: [],
      totalElementsChecked: 0
    };
  }

  try {
    const debugSearch = new DebugSearch(device);
    const result = await debugSearch.execute({
      text: searchCriteria.text,
      resourceId: searchCriteria.resourceId,
      containerElementId: searchCriteria.containerElementId,
      includeNearMisses: true,
      maxNearMisses: 10,
      fuzzyMatch: true,
      caseSensitive: false
    });

    return {
      searchCriteria,
      nearMisses: result.nearMisses,
      totalElementsChecked: result.totalElements
    };
  } catch (error) {
    // If we can't build debug context, return basic info
    return {
      searchCriteria,
      nearMisses: [],
      totalElementsChecked: 0
    };
  }
}

/**
 * Generic debug information that can be included in any tool result
 */
export interface ToolDebugInfo {
  /**
   * Execution time in milliseconds
   */
  executionTimeMs?: number;

  /**
   * Element search debug info (for tools that search for elements)
   */
  elementSearch?: ElementSearchDebugInfo;

  /**
   * Additional debug data (tool-specific)
   */
  [key: string]: any;
}
