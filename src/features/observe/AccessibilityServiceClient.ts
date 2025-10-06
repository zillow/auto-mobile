import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { logger } from "../../utils/logger";
import { BootedDevice, ViewHierarchyResult } from "../../models";
import { ViewHierarchyQueryOptions, ViewHierarchyTimestampContext } from "../../models/ViewHierarchyQueryOptions";
import { AccessibilityServiceManager } from "../../utils/accessibilityServiceManager";
import { v4 as uuidv4 } from "uuid";

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
  private device: BootedDevice;
  private adb: AdbUtils;
  private static readonly PACKAGE_NAME = "com.zillow.automobile.accessibilityservice";
  private static readonly HIERARCHY_FILE_PATH = "files/latest_hierarchy.json";

  constructor(device: BootedDevice, adb: AdbUtils | null = null) {
    this.device = device;
    this.adb = adb || new AdbUtils(device);
    AccessibilityServiceManager.getInstance(device, adb);
  }

  /**
   * Query the accessibility service for targeted view hierarchy using broadcast receiver
   * @param queryOptions - Options to filter the view hierarchy
   * @returns Promise<AccessibilityHierarchy | null> - The hierarchy data or null if unavailable
   */
  async getTargetedHierarchy(queryOptions: ViewHierarchyQueryOptions): Promise<AccessibilityHierarchy | null> {
    const startTime = Date.now();
    const queryId = uuidv4();

    try {
      logger.info(`[ACCESSIBILITY_SERVICE] Sending targeted hierarchy request with UUID: ${queryId}`);

      // Prepare broadcast command with query parameters
      const broadcastCommand = this.buildBroadcastCommand(queryId, queryOptions);
      const hierarchyFileName = `hierarchy_${queryId}.json`;

      // Run broadcast and polling in parallel
      const broadcastPromise = this.adb.executeCommand(broadcastCommand);

      // Start polling after 100ms delay to give the service time to write the file
      const pollingPromise = (async () => {
        // Initial delay to let the service process the broadcast
        await new Promise(resolve => setTimeout(resolve, 100));

        const maxDelay = 500;
        let delay = 50; // Start with 50ms since we already waited 100ms
        let result;

        while (delay <= maxDelay) {
          try {
            result = await this.adb.executeCommand(
              `shell run-as ${AccessibilityServiceClient.PACKAGE_NAME} cat files/${hierarchyFileName}`
            );

            if (result.stdout && result.stdout.trim() !== "") {
              return result;
            }
          } catch (err) {
            // Ignore errors and continue polling
            logger.debug(`[ACCESSIBILITY_SERVICE] Error while reading hierarchy file (retrying in ${delay}ms): ${err}`);
          }

          // Wait for the current delay period
          await new Promise(resolve => setTimeout(resolve, delay));

          // Double the delay for the next iteration (exponential backoff)
          delay *= 2;
        }

        return null;
      })();

      // Wait for both broadcast and polling to complete
      const [, pollingResult] = await Promise.all([broadcastPromise, pollingPromise]);

      // If result is still not available after maximum retries
      if (!pollingResult || !pollingResult.stdout || pollingResult.stdout.trim() === "") {
        logger.warn(`[ACCESSIBILITY_SERVICE] No hierarchy data received for query ID: ${queryId}`);
        return null;
      }

      // Parse the JSON response
      const hierarchyData: AccessibilityHierarchy = JSON.parse(pollingResult.stdout);

      const duration = Date.now() - startTime;
      logger.info(`[ACCESSIBILITY_SERVICE] Successfully retrieved targeted hierarchy in ${duration}ms (query: ${queryId})`);

      return hierarchyData;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] Failed to get targeted hierarchy after ${duration}ms: ${error}`);
      return null;
    }
  }

  /**
   * Build broadcast command for accessibility service
   * @param uuid - Unique identifier for the request
   * @param queryOptions - Query options for filtering
   * @returns Complete broadcast command string
   */
  private buildBroadcastCommand(uuid: string, queryOptions: ViewHierarchyQueryOptions): string {
    const baseCommand = `shell am broadcast -a com.zillow.automobile.EXTRACT_HIERARCHY`;
    const extras: string[] = [`--es uuid "${uuid}"`];

    if (queryOptions.text) {
      extras.push(`--es text "${queryOptions.text}"`);
    }
    if (queryOptions.elementId) {
      extras.push(`--es elementId "${queryOptions.elementId}"`);
    }
    if (queryOptions.containerElementId) {
      extras.push(`--es containerElementId "${queryOptions.containerElementId}"`);
    }
    if (queryOptions.xpath) {
      extras.push(`--es xpath "${queryOptions.xpath}"`);
    }

    return `${baseCommand} ${extras.join(" ")}`;
  }

  /**
   * Parse ls -l --full-time output to get modification timestamp in milliseconds
   * @param lsOutput - Output from: adb shell "run-as ... ls -l --full-time files/latest_hierarchy.json"
   * @returns Timestamp in milliseconds since epoch, or null if parsing fails
   */
  private parseFileTimestamp(lsOutput: string): number | null {
    try {
      // Example output:
      // -rw-rw---- 1 u0_a385 u0_a385 17562 2025-10-01 09:11:00.875765737 -0500 files/latest_hierarchy.json

      const parts = lsOutput.trim().split(/\s+/);

      // Date is at index 5, time at index 6, timezone at index 7
      const datePart = parts[5];      // 2025-10-01
      const timePart = parts[6];      // 09:11:00.875765737
      const timezonePart = parts[7];  // -0500

      // Split time into seconds and nanoseconds
      const [timeBase, nanoseconds] = timePart.split(".");

      // Extract milliseconds from nanoseconds (first 3 digits)
      const milliseconds = nanoseconds.substring(0, 3);

      // Construct ISO 8601 timestamp with milliseconds
      // Convert timezone format from -0500 to -05:00
      const timezoneFormatted = timezonePart.slice(0, 3) + ":" + timezonePart.slice(3);
      const isoTimestamp = `${datePart}T${timeBase}.${milliseconds}${timezoneFormatted}`;

      // Parse to Date and get milliseconds since epoch
      const timestamp = new Date(isoTimestamp).getTime();

      return isNaN(timestamp) ? null : timestamp;
    } catch (error) {
      logger.warn(`Failed to parse file timestamp from ls output: ${error}`);
      return null;
    }
  }

  /**
   * Get file modification timestamp using ls -l --full-time
   * @returns Timestamp in milliseconds since epoch, or null if fails
   */
  private async getFileTimestamp(): Promise<number | null> {
    try {
      const result = await this.adb.executeCommand(
        `shell run-as ${AccessibilityServiceClient.PACKAGE_NAME} ls -l --full-time ${AccessibilityServiceClient.HIERARCHY_FILE_PATH}`
      );
      return this.parseFileTimestamp(result.stdout);
    } catch (error) {
      logger.warn(`[ACCESSIBILITY_SERVICE] Failed to get file timestamp: ${error}`);
      return null;
    }
  }

  /**
   * Validate that the view hierarchy file timestamp meets requirements
   * @param fileTimestamp - File modification timestamp in milliseconds
   * @param context - Timestamp context with action and stability timing
   * @returns True if timestamp is valid, false otherwise
   */
  private validateHierarchyTimestamp(
    fileTimestamp: number | null,
    context: ViewHierarchyTimestampContext
  ): boolean {
    if (!fileTimestamp) {
      logger.error("[ACCESSIBILITY_SERVICE] Could not determine file timestamp, failing validation");
      return false;
    }

    // File must be newer than action start
    if (fileTimestamp < context.actionStartTime) {
      logger.warn(
        `[ACCESSIBILITY_SERVICE] File timestamp ${fileTimestamp} is older than action start ${context.actionStartTime} ` +
        `(age: ${context.actionStartTime - fileTimestamp}ms)`
      );
      return false;
    }

    // If UI settling occurred, file must be at least as new as stability window start
    if (context.stabilityStartTime && fileTimestamp < context.stabilityStartTime) {
      logger.warn(
        `[ACCESSIBILITY_SERVICE] File timestamp ${fileTimestamp} is older than stability start ${context.stabilityStartTime} ` +
        `(age: ${context.stabilityStartTime - fileTimestamp}ms)`
      );
      return false;
    }

    logger.info(
      `[ACCESSIBILITY_SERVICE] View hierarchy file timestamp validated: ${fileTimestamp} >= ${context.minRequiredTimestamp} ` +
      `(file is ${fileTimestamp - context.minRequiredTimestamp}ms newer)`
    );
    return true;
  }

  /**
     * Query the accessibility service for the latest view hierarchy
   * @param queryOptions - Options to filter the view hierarchy
   * @param timestampContext - Optional timestamp context for validation
     * @returns Promise<AccessibilityHierarchy | null> - The hierarchy data or null if unavailable
     */
  async getLatestHierarchy(
    queryOptions?: ViewHierarchyQueryOptions,
    timestampContext?: ViewHierarchyTimestampContext
  ): Promise<AccessibilityHierarchy | null> {
    const startTime = Date.now();

    try {
      logger.info("[ACCESSIBILITY_SERVICE] Querying latest view hierarchy from accessibility service");

      // If query options are provided, use targeted hierarchy retrieval
      // if (queryOptions) {
      //   return await this.getTargetedHierarchy(queryOptions);
      // }

      // Validate timestamp if context provided
      if (timestampContext) {
        const fileTimestamp = await this.getFileTimestamp();

        if (!this.validateHierarchyTimestamp(fileTimestamp, timestampContext)) {
          logger.warn("[ACCESSIBILITY_SERVICE] Hierarchy file timestamp validation failed");
          return null;
        }
      }

      // Otherwise, get the standard latest hierarchy
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
   * @param queryOptions - Options to filter the view hierarchy
   * @param timestampContext - Optional timestamp context for validation
     * @returns Promise<ViewHierarchyResult | null> - The hierarchy or null if service unavailable
     */
  async getAccessibilityHierarchy(
    queryOptions?: ViewHierarchyQueryOptions,
    timestampContext?: ViewHierarchyTimestampContext
  ): Promise<ViewHierarchyResult | null> {
    const startTime = Date.now();

    try {
      // Check if service is available

      const available = await AccessibilityServiceManager.getInstance(this.device, this.adb).isAvailable();
      if (!available) {
        logger.info("[ACCESSIBILITY_SERVICE] Service not available, will use fallback");
        return null;
      }

      // Get hierarchy from service
      const accessibilityHierarchy = await this.getLatestHierarchy(queryOptions, timestampContext);
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
