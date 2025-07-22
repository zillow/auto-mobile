import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "../logger";
import {
  ExecResult,
  ActionableError,
  DeviceInfo,
  BootedDevice,
  ViewHierarchyResult,
  ViewHierarchyNode,
  NodeAttributes
} from "../../models";

// Enhance the standard execAsync result to implement the ExecResult interface
const execAsync = async (command: string): Promise<ExecResult> => {
  const result = await promisify(exec)(command);

  // Add the required string methods
  const enhancedResult: ExecResult = {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    toString() {
      return this.stdout;
    },
    trim() {
      return this.stdout.trim();
    },
    includes(searchString: string) {
      return this.stdout.includes(searchString);
    }
  };

  return enhancedResult;
};

export interface IdbAppInfo {
  bundleId: string;
  name: string;
  installType: "user" | "system";
  architectures: string[];
  isRunning: boolean;
  isDebuggable: boolean;
}

export interface IdbTargetInfo {
  udid: string;
  name: string;
  screenDimensions?: { width: number; height: number };
  screenDensity?: number;
  state: string;
  type: "simulator" | "device";
  iosVersion: string;
  architecture: string;
  companionInfo?: any;
}

export interface IdbAccessibilityElement {
  AXFrame: string;
  AXUniqueId: string | null;
  frame: {
    y: number;
    x: number;
    width: number;
    height: number;
  };
  role_description: string;
  AXLabel: string;
  content_required: boolean;
  type: string;
  title: string | null;
  help: string | null;
  custom_actions: string[];
  AXValue: string | null;
  enabled: boolean;
  role: string;
  subrole: string | null;
}

export class IdbPython {
  device: BootedDevice | null;
  execAsync: (command: string) => Promise<ExecResult>;

  // Static cache for device list
  private static deviceListCache: { devices: DeviceInfo[], timestamp: number } | null = null;
  private static readonly DEVICE_LIST_CACHE_TTL = 5000; // 5 seconds

  /**
   * Create an IosUtils instance
   * @param device - Optional device
   * @param execAsyncFn - promisified exec function (for testing)
   */
  constructor(
    device: BootedDevice | null = null,
    execAsyncFn: ((command: string) => Promise<ExecResult>) | null = null
  ) {
    this.device = device;
    this.execAsync = execAsyncFn || execAsync;
  }

  /**
   * Set the target device ID
   * @param device - Device identifier
   */
  setDevice(device: BootedDevice): void {
    this.device = device;
  }

  /**
   * Get the base ADB command with optional device ID
   * @returns The base ADB command
   */
  getBaseCommand(): string {
    const deviceId = this.device?.deviceId;
    return deviceId ? `idb --udid ${deviceId}` : "idb";
  }

  /**
   * Execute an idb command
   * @param command - The simctl command to execute
   * @param timeoutMs - Optional timeout in milliseconds
   * @returns Promise with command output
   */
  async executeCommand(command: string, timeoutMs?: number): Promise<ExecResult> {

    if (!(await this.isAvailable())) {
      throw new ActionableError("idb is not available. Please install Facebook's idb CLI to continue.");
    }

    const fullCommand = `${this.getBaseCommand()} ${command}`;
    const startTime = Date.now();

    logger.debug(`[iOS] Executing command: ${fullCommand}`);

    // Use Promise.race to implement timeout if specified
    if (timeoutMs) {
      let timeoutId: NodeJS.Timeout;

      const timeoutPromise = new Promise<ExecResult>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`Command timed out after ${timeoutMs}ms: ${fullCommand}`)),
          timeoutMs
        );
      });

      try {
        const result = await Promise.race([this.execAsync(fullCommand), timeoutPromise]);
        const duration = Date.now() - startTime;
        logger.debug(`[iOS] Command completed in ${duration}ms: ${command}`);
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.warn(`[iOS] Command failed after ${duration}ms: ${command} - ${(error as Error).message}`);
        throw error;
      } finally {
        clearTimeout(timeoutId!);
      }
    }

    // No timeout specified
    try {
      const result = await this.execAsync(fullCommand);
      const duration = Date.now() - startTime;
      logger.debug(`[iOS] Command completed in ${duration}ms: ${command}`);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[iOS] Command failed after ${duration}ms: ${command} - ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Check if idb is available
   * @returns Promise with boolean indicating availability
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.execAsync("idb --version");
      return true;
    } catch (error) {
      logger.warn("idb is not available - iOS functionality requires Facebook's idb CLI tool to be installed and on PATH.");
      return false;
    }
  }

  // =================
  // TARGET MANAGEMENT
  // =================

  /**
   * List all connected targets
   */
  async listTargets(): Promise<ExecResult> {
    logger.debug("[iOS] Listing connected targets");
    return await this.executeCommand("list-targets");
  }

  /**
   * Describe the current or specified target
   * @param udid - Optional target UDID
   */
  async describe(udid?: string): Promise<ExecResult> {
    const command = udid ? `describe --udid ${udid}` : "describe";
    logger.debug(`[iOS] Describing target${udid ? ` ${udid}` : ""}`);
    return await this.executeCommand(command);
  }

  /**
   * Boot a simulator
   * @param udid - Simulator UDID
   */
  async boot(udid: string): Promise<ExecResult> {
    logger.debug(`[iOS] Booting simulator ${udid}`);
    return await this.executeCommand(`boot ${udid}`);
  }

  /**
   * Disconnect a target
   * @param udid - Target UDID
   */
  async disconnect(udid: string): Promise<ExecResult> {
    logger.debug(`[iOS] Disconnecting target ${udid}`);
    return await this.executeCommand(`disconnect ${udid}`);
  }

  // ==============
  // APP MANAGEMENT
  // ==============

  /**
   * List installed apps
   */
  async listApps(): Promise<ExecResult> {
    logger.debug("[iOS] Listing installed apps");
    return await this.executeCommand("list-apps");
  }

  /**
   * Install an app
   * @param appPath - Path to .app or .ipa file
   */
  async installApp(appPath: string): Promise<ExecResult> {
    logger.debug(`[iOS] Installing app from ${appPath}`);
    return await this.executeCommand(`install "${appPath}"`);
  }

  /**
   * Launch an app
   * @param bundleId - App bundle ID
   * @param options - Launch options
   */
  async launchApp(
    bundleId: string,
    options?: {
      args?: { [key: string]: string };
      foregroundIfRunning?: boolean;
      waitFor?: boolean;
    }
  ): Promise<ExecResult> {
    let command = `launch ${bundleId}`;

    if (options?.args) {
      for (const [key, value] of Object.entries(options.args)) {
        command += ` --${key} "${value}"`;
      }
    }

    if (options?.foregroundIfRunning) {
      command += " --foreground-if-running";
    }

    if (options?.waitFor) {
      command += " --wait-for";
    }

    logger.debug(`[iOS] Launching app ${bundleId}${options ? " with options" : ""}`);
    return await this.executeCommand(command);
  }

  /**
   * Terminate a running app
   * @param bundleId - App bundle ID
   */
  async terminateApp(bundleId: string): Promise<ExecResult> {
    logger.debug(`[iOS] Terminating app ${bundleId}`);
    return await this.executeCommand(`terminate ${bundleId}`);
  }

  /**
   * Uninstall an app
   * @param bundleId - App bundle ID
   */
  async uninstallApp(bundleId: string): Promise<ExecResult> {
    logger.debug(`[iOS] Uninstalling app ${bundleId}`);
    return await this.executeCommand(`uninstall ${bundleId}`);
  }

  // ============
  // UI INTERACTION
  // ============

  /**
   * Tap at coordinates
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param duration - Optional tap duration in milliseconds
   */
  async tap(x: number, y: number, duration?: number): Promise<ExecResult> {
    let command = `ui tap ${x} ${y}`;
    if (duration) {
      command += ` --duration ${duration}`;
    }
    logger.debug(`[iOS] Tapping at (${x}, ${y})${duration ? ` for ${duration}ms` : ""}`);
    return await this.executeCommand(command);
  }

  /**
   * Swipe from start to end coordinates
   * @param startX - Start X coordinate
   * @param startY - Start Y coordinate
   * @param endX - End X coordinate
   * @param endY - End Y coordinate
   * @param stepSize - Optional step size (default: 10 points)
   */
  async swipe(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    stepSize?: number
  ): Promise<ExecResult> {
    let command = `ui swipe ${startX} ${startY} ${endX} ${endY}`;
    if (stepSize) {
      command += ` --delta ${stepSize}`;
    }
    logger.debug(`[iOS] Swiping from (${startX}, ${startY}) to (${endX}, ${endY})${stepSize ? ` with step size ${stepSize}` : ""}`);
    return await this.executeCommand(command);
  }

  /**
   * Press a button
   * @param buttonType - Type of button to press
   */
  async pressButton(buttonType: string): Promise<ExecResult> {
    logger.debug(`[iOS] Pressing button ${buttonType}`);
    return await this.executeCommand(`ui button ${buttonType}`);
  }

  /**
   * Input text
   * @param text - Text to input
   */
  async inputText(text: string): Promise<ExecResult> {
    logger.debug(`[iOS] Inputting text: ${text}`);
    return await this.executeCommand(`ui text "${text}"`);
  }

  // =============
  // ACCESSIBILITY
  // =============

  /**
   * Describe the entire screen accessibility information
   */
  async describeAll(): Promise<ExecResult> {
    logger.debug("[iOS] Describing entire screen accessibility");
    return await this.executeCommand("ui describe-all");
  }

  /**
   * Describe accessibility information at a point
   * @param x - X coordinate
   * @param y - Y coordinate
   */
  async describePoint(x: number, y: number): Promise<ExecResult> {
    logger.debug(`[iOS] Describing accessibility at point (${x}, ${y})`);
    return await this.executeCommand(`ui describe-point ${x} ${y}`);
  }

  /**
   * Parse iOS accessibility elements to ViewHierarchyResult format
   * @param accessibilityElements - Array of iOS accessibility elements from idb ui describe-all
   * @returns ViewHierarchyResult - Parsed hierarchy in the expected format
   */
  parseAccessibilityToViewHierarchy(accessibilityElements: IdbAccessibilityElement[]): ViewHierarchyResult {
    const startTime = Date.now();

    try {
      logger.debug("[iOS] Converting iOS accessibility elements to ViewHierarchyResult format");

      if (!accessibilityElements || accessibilityElements.length === 0) {
        return {
          hierarchy: {
            error: "No accessibility elements provided"
          }
        };
      }

      // Find the root element (usually the Application element)
      const rootElement = accessibilityElements.find(el => el.type === "Application") || accessibilityElements[0];
      const childElements = accessibilityElements.filter(el => el !== rootElement);

      // Convert root element to ViewHierarchyNode
      const rootNode = this.convertAccessibilityElementToNode(rootElement);

      // Add child elements as flat structure under root
      if (childElements.length > 0) {
        rootNode.node = childElements.map(el => this.convertAccessibilityElementToNode(el));
      }

      const result: ViewHierarchyResult = {
        hierarchy: {
          node: rootNode
        }
      };

      const duration = Date.now() - startTime;
      logger.debug(`[iOS] Accessibility conversion completed in ${duration}ms`);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[iOS] Accessibility conversion failed after ${duration}ms: ${error}`);

      return {
        hierarchy: {
          error: "Failed to convert iOS accessibility elements"
        }
      };
    }
  }

  /**
   * Convert individual iOS accessibility element to ViewHierarchyNode
   * @param element - iOS accessibility element
   * @returns ViewHierarchyNode - Converted node
   */
  private convertAccessibilityElementToNode(element: IdbAccessibilityElement): ViewHierarchyNode {
    const attributes: NodeAttributes = {};

    // Map iOS accessibility properties to Android-like attributes
    if (element.AXLabel) {
      attributes.text = element.AXLabel;
      attributes["content-desc"] = element.AXLabel;
    }

    if (element.AXUniqueId) {
      attributes["resource-id"] = element.AXUniqueId;
    }

    if (element.type) {
      attributes.class = element.type;
    }

    if (element.role) {
      attributes["ios-role"] = element.role;
    }

    if (element.subrole) {
      attributes["ios-subrole"] = element.subrole;
    }

    if (element.role_description) {
      attributes["ios-role-description"] = element.role_description;
    }

    if (element.AXValue) {
      attributes["ios-value"] = element.AXValue;
    }

    if (element.help) {
      attributes["ios-help"] = element.help;
    }

    // Map boolean properties
    attributes.enabled = element.enabled.toString();
    attributes.clickable = this.isClickableElement(element).toString();
    attributes.focusable = this.isFocusableElement(element).toString();
    attributes.scrollable = this.isScrollableElement(element).toString();

    // Convert frame to bounds in Android format [left,top][right,bottom]
    const bounds = `[${element.frame.x},${element.frame.y}][${element.frame.x + element.frame.width},${element.frame.y + element.frame.height}]`;
    attributes.bounds = bounds;

    return {
      $: attributes,
      bounds: {
        left: element.frame.x,
        top: element.frame.y,
        right: element.frame.x + element.frame.width,
        bottom: element.frame.y + element.frame.height
      }
    };
  }

  /**
   * Determine if an iOS accessibility element is clickable
   * @param element - iOS accessibility element
   * @returns boolean - Whether the element is clickable
   */
  private isClickableElement(element: IdbAccessibilityElement): boolean {
    const clickableTypes = ["Button", "StaticText"];
    const clickableRoles = ["AXButton"];

    return clickableTypes.includes(element.type) ||
      clickableRoles.includes(element.role) ||
      element.custom_actions.length > 0;
  }

  /**
   * Determine if an iOS accessibility element is focusable
   * @param element - iOS accessibility element
   * @returns boolean - Whether the element is focusable
   */
  private isFocusableElement(element: IdbAccessibilityElement): boolean {
    const focusableTypes = ["TextField", "Button"];
    const focusableRoles = ["AXTextField", "AXButton"];

    return focusableTypes.includes(element.type) ||
      focusableRoles.includes(element.role);
  }

  /**
   * Determine if an iOS accessibility element is scrollable
   * @param element - iOS accessibility element
   * @returns boolean - Whether the element is scrollable
   */
  private isScrollableElement(element: IdbAccessibilityElement): boolean {
    const scrollableTypes = ["ScrollArea"];
    const scrollableRoles = ["AXScrollArea"];

    return scrollableTypes.includes(element.type) ||
      scrollableRoles.includes(element.role) ||
      element.custom_actions.some(action => action.toLowerCase().includes("scroll"));
  }

  /**
   * Get accessibility hierarchy and parse to ViewHierarchyResult
   * @returns Promise<ViewHierarchyResult> - Parsed view hierarchy
   */
  async getViewHierarchy(): Promise<ViewHierarchyResult> {
    try {
      const result = await this.describeAll();
      const accessibilityElements: IdbAccessibilityElement[] = JSON.parse(result.stdout);

      return this.parseAccessibilityToViewHierarchy(accessibilityElements);
    } catch (error) {
      logger.warn(`[iOS] Failed to get view hierarchy: ${error}`);

      return {
        hierarchy: {
          error: "Failed to retrieve iOS view hierarchy"
        }
      };
    }
  }

  // ===================
  // MEDIA & PERMISSIONS
  // ===================

  /**
   * Add media file
   * @param mediaPath - Path to media file
   */
  async addMedia(mediaPath: string): Promise<ExecResult> {
    logger.debug(`[iOS] Adding media file ${mediaPath}`);
    return await this.executeCommand(`media add "${mediaPath}"`);
  }

  /**
   * Approve permissions for an app
   * @param bundleId - App bundle ID
   * @param permissions - Array of permissions to approve
   */
  async approvePermissions(bundleId: string, permissions: string[]): Promise<ExecResult> {
    const permissionString = permissions.join(" ");
    logger.debug(`[iOS] Approving permissions for ${bundleId}: ${permissionString}`);
    return await this.executeCommand(`approve ${bundleId} ${permissionString}`);
  }

  /**
   * Update contacts database
   * @param contactsDbPath - Path to contacts database
   */
  async updateContacts(contactsDbPath: string): Promise<ExecResult> {
    logger.debug(`[iOS] Updating contacts from ${contactsDbPath}`);
    return await this.executeCommand(`contacts update "${contactsDbPath}"`);
  }

  /**
   * Open URL
   * @param url - URL to open
   */
  async openUrl(url: string): Promise<ExecResult> {
    logger.debug(`[iOS] Opening URL: ${url}`);
    return await this.executeCommand(`url open "${url}"`);
  }

  /**
   * Focus simulator window
   */
  async focus(): Promise<ExecResult> {
    logger.debug("[iOS] Focusing simulator window");
    return await this.executeCommand("focus");
  }

  /**
   * Kill idb and clear companion information
   */
  async kill(): Promise<ExecResult> {
    logger.debug("[iOS] Killing idb and clearing companion information");
    return await this.executeCommand("kill");
  }
}
