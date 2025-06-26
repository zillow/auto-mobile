import { AdbUtils } from "../../utils/adb";
import { logger } from "../../utils/logger";
import { ViewHierarchyResult } from "../../models/ViewHierarchyResult";

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
  private static readonly PACKAGE_NAME = "com.zillow.automobile.accessibilityservice";
  private static readonly HIERARCHY_FILE_PATH = "files/latest_hierarchy.json";

  constructor(deviceId: string | null = null, adb: AdbUtils | null = null) {
    this.adb = adb || new AdbUtils(deviceId);
  }

  /**
     * Check if the accessibility service package is installed
     * @returns Promise<boolean> - True if installed, false otherwise
     */
  async isInstalled(): Promise<boolean> {
    try {
      logger.info("[ACCESSIBILITY_SERVICE] Checking if accessibility service is installed");
      const result = await this.adb.executeCommand("shell pm list packages | grep automobile.accessibility");
      const isInstalled = result.stdout.includes(AccessibilityServiceClient.PACKAGE_NAME);
      logger.info(`[ACCESSIBILITY_SERVICE] Service installation status: ${isInstalled ? "installed" : "not installed"}`);
      return isInstalled;
    } catch (error) {
      logger.warn(`[ACCESSIBILITY_SERVICE] Error checking installation status: ${error}`);
      return false;
    }
  }

  /**
     * Check if the accessibility service is enabled
     * @returns Promise<boolean> - True if enabled, false otherwise
     */
  async isEnabled(): Promise<boolean> {
    try {
      logger.info("[ACCESSIBILITY_SERVICE] Checking if accessibility service is enabled");
      const result = await this.adb.executeCommand("shell settings get secure enabled_accessibility_services");
      const isEnabled = result.stdout.includes(AccessibilityServiceClient.PACKAGE_NAME);
      logger.info(`[ACCESSIBILITY_SERVICE] Service enabled status: ${isEnabled ? "enabled" : "disabled"}`);
      return isEnabled;
    } catch (error) {
      logger.warn(`[ACCESSIBILITY_SERVICE] Error checking enabled status: ${error}`);
      return false;
    }
  }

  /**
     * Check if the accessibility service is both installed and enabled
     * @returns Promise<boolean> - True if available for use, false otherwise
     */
  async isAvailable(): Promise<boolean> {
    const startTime = Date.now();

    try {
      // Check installation and enabled status in parallel for better performance
      const [installed, enabled] = await Promise.all([
        this.isInstalled(),
        this.isEnabled()
      ]);

      const available = installed && enabled;
      const duration = Date.now() - startTime;

      logger.info(`[ACCESSIBILITY_SERVICE] Availability check completed in ${duration}ms - Available: ${available}`);
      return available;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] Availability check failed after ${duration}ms: ${error}`);
      return false;
    }
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
     * Get view hierarchy from accessibility service with automatic fallback
     * This is the main entry point for getting hierarchy data from the accessibility service
     * @returns Promise<ViewHierarchyResult | null> - The hierarchy or null if service unavailable
     */
  async getAccessibilityHierarchy(): Promise<ViewHierarchyResult | null> {
    return this.getViewHierarchyWithFallback();
  }

  /**
   * Get view hierarchy from accessibility service with automatic fallback
   * @returns Promise<ViewHierarchyResult | null> - The hierarchy or null if service unavailable
   */
  async getViewHierarchyWithFallback(): Promise<ViewHierarchyResult | null> {
    const startTime = Date.now();

    try {
      // Check if service is available
      const available = await this.isAvailable();
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
