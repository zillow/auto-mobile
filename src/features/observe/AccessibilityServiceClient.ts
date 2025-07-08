import { AdbUtils } from "../../utils/adb";
import { logger } from "../../utils/logger";
import { ViewHierarchyResult } from "../../models";
import { AccessibilityServiceManager } from "../../utils/accessibilityServiceManager";

/**
 * Interface for accessibility service node format
 */
interface AccessibilityNode {
    text?: string;
    "content-desc"?: string;
    "resource-id"?: string;
    className?: string;
    packageName?: string;
    bounds?: {
        left: number;
        top: number;
        right: number;
        bottom: number;
    };
    clickable?: string;
    enabled?: string;
    focusable?: string;
    focused?: string;
    scrollable?: string;
    password?: string;
    checkable?: string;
    checked?: string;
    selected?: string;
    "long-clickable"?: string;
  accessible?: number;
  node?: AccessibilityNode | AccessibilityNode[];
}

/**
 * Interface for accessibility service hierarchy format
 */
interface AccessibilityHierarchy {
  timestamp: number;
  packageName: string;
  hierarchy: AccessibilityNode;
}

/**
 * Client for interacting with the AutoMobile Accessibility Service
 */
export class AccessibilityServiceClient {
  private adb: AdbUtils;
  private accessibilityServiceManager: AccessibilityServiceManager;
  private static readonly PACKAGE_NAME = "com.zillow.automobile.accessibilityservice";
  private static readonly HIERARCHY_FILE_PATH = "files/latest_hierarchy.json";

  constructor(deviceId: string, adb: AdbUtils | null = null) {
    this.adb = adb || new AdbUtils(deviceId);
    this.accessibilityServiceManager = new AccessibilityServiceManager(deviceId, adb);
  }

  /**
     * Clear the cached availability status
     */
  public static clearAvailabilityCache(): void {
    AccessibilityServiceManager.clearAvailabilityCache();
    logger.info("[ACCESSIBILITY_SERVICE] Cleared all availability caches");
  }

  /**
     * Query the accessibility service for the latest view hierarchy
     * @returns Promise<AccessibilityHierarchy | null> - The hierarchy data or null if unavailable
     */
  async getLatestHierarchy(): Promise<AccessibilityHierarchy | null> {
    const startTime = Date.now();

    try {
      logger.info("[ACCESSIBILITY_SERVICE] Querying latest view hierarchy from accessibility service");

      const result = await this.adb.executeCommand(
        `shell run-as ${AccessibilityServiceClient.PACKAGE_NAME} cat ${AccessibilityServiceClient.HIERARCHY_FILE_PATH}`
      );

      if (!result.stdout || result.stdout.trim() === "") {
        logger.warn("[ACCESSIBILITY_SERVICE] No hierarchy data received from accessibility service");
        return null;
      }

      // Parse the JSON response
      const hierarchyData: AccessibilityHierarchy = JSON.parse(result.stdout);

      const duration = Date.now() - startTime;
      logger.info(`[ACCESSIBILITY_SERVICE] Successfully retrieved hierarchy in ${duration}ms (timestamp: ${hierarchyData.timestamp})`);

      return hierarchyData;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] Failed to get hierarchy after ${duration}ms: ${error}`);
      return null;
    }
  }

  /**
     * Convert accessibility service hierarchy format to ViewHierarchyResult format
     * @param accessibilityHierarchy - The accessibility service hierarchy data
     * @returns ViewHierarchyResult - Converted hierarchy in the expected format
     */
  convertToViewHierarchyResult(accessibilityHierarchy: AccessibilityHierarchy): ViewHierarchyResult {
    const startTime = Date.now();

    try {
      logger.info("[ACCESSIBILITY_SERVICE] Converting accessibility service format to ViewHierarchyResult format");

      // Convert the accessibility node format to match the existing XML-based format
      const convertedHierarchy = this.convertAccessibilityNode(accessibilityHierarchy.hierarchy);

      const result: ViewHierarchyResult = {
        hierarchy: convertedHierarchy
      };

      const duration = Date.now() - startTime;
      logger.info(`[ACCESSIBILITY_SERVICE] Format conversion completed in ${duration}ms`);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] Format conversion failed after ${duration}ms: ${error}`);

      // Return error format consistent with existing error handling
      return {
        hierarchy: {
          error: "Failed to convert accessibility service hierarchy format"
        }
      } as ViewHierarchyResult;
    }
  }

  /**
     * Convert individual accessibility node to the expected format
     * @param node - The accessibility service node
     * @returns Converted node in XML-like format
     */
  private convertAccessibilityNode(node: AccessibilityNode | AccessibilityNode[]): any {
    // Handle array of nodes
    if (Array.isArray(node)) {
      const convertedArray = node.map(child => this.convertAccessibilityNode(child));
      // If there's only one element in the array, return it as a single object
      // This matches the expected behavior from the original XML parsing logic
      return convertedArray.length === 1 ? convertedArray[0] : convertedArray;
    }

    const converted: any = {};

    // Copy over all properties
    if (node.text) {
      converted.text = node.text;
    }
    if (node["content-desc"]) {
      converted["content-desc"] = node["content-desc"];
    }
    if (node["resource-id"]) {
      converted["resource-id"] = node["resource-id"];
    }
    if (node.className) {
      converted.className = node.className;
    }
    if (node.packageName) {
      converted.packageName = node.packageName;
    }
    if (node.clickable && node.clickable !== "false") {
      converted.clickable = node.clickable;
    }
    if (node.enabled && node.enabled !== "false") {
      converted.enabled = node.enabled;
    }
    if (node.focusable && node.focusable !== "false") {
      converted.focusable = node.focusable;
    }
    if (node.focused && node.focused !== "false") {
      converted.focused = node.focused;
    }
    if (node.scrollable && node.scrollable !== "false") {
      converted.scrollable = node.scrollable;
    }
    if (node.password && node.password !== "false") {
      converted.password = node.password;
    }
    if (node.checkable && node.checkable !== "false") {
      converted.checkable = node.checkable;
    }
    if (node.checked && node.checked !== "false") {
      converted.checked = node.checked;
    }
    if (node.selected && node.selected !== "false") {
      converted.selected = node.selected;
    }
    if (node["long-clickable"] && node["long-clickable"] !== "false") {
      converted["long-clickable"] = node["long-clickable"];
    }

    // Preserve the accessible property if it exists
    if ((node as any).accessible !== undefined) {
      converted.accessible = (node as any).accessible;
    }

    // Convert bounds from object format to string format to match XML parser output
    if (node.bounds) {
      converted.bounds = `[${node.bounds.left},${node.bounds.top}][${node.bounds.right},${node.bounds.bottom}]`;
    }

    // Convert child nodes recursively
    if (node.node) {
      converted.node = this.convertAccessibilityNode(node.node);
    }

    return converted;
  }

  /**
     * Get view hierarchy from accessibility service
     * This is the main entry point for getting hierarchy data from the accessibility service
     * @returns Promise<ViewHierarchyResult | null> - The hierarchy or null if service unavailable
     */
  async getAccessibilityHierarchy(): Promise<ViewHierarchyResult | null> {
    const startTime = Date.now();

    try {
      // Check if service is available
      const available = this.accessibilityServiceManager.isAvailable();
      if (!available) {
        logger.info("[ACCESSIBILITY_SERVICE] Service not available, will use fallback");
        return null;
      }

      // Get hierarchy from service
      const accessibilityHierarchy = await this.getLatestHierarchy();
      if (!accessibilityHierarchy) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to get hierarchy from service, will use fallback");
        return null;
      }

      // Convert to expected format
      const convertedHierarchy = this.convertToViewHierarchyResult(accessibilityHierarchy);

      const duration = Date.now() - startTime;
      logger.info(`[ACCESSIBILITY_SERVICE] Successfully retrieved and converted hierarchy in ${duration}ms`);

      return convertedHierarchy;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] getViewHierarchyWithFallback failed after ${duration}ms: ${error}`);
      return null;
    }
  }
}
