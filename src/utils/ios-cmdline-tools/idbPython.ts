import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "../logger";
import {
  ExecResult,
  DeviceInfo,
  BootedDevice,
  ViewHierarchyResult,
  ViewHierarchyNode,
  NodeAttributes, ScreenSize, SwipeResult
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

export type IdbButton = "APPLE_PAY" | "HOME" | "LOCK" | "SIDE_BUTTON" | "SIRI";

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

export interface ScreenDimensions {
  width: number;
  height: number;
  density: number;
  width_points: number;
  height_points: number;
}

export interface DomainSocketAddress {
  path: string;
}

export interface CompanionInfo {
  udid: string;
  is_local: boolean;
  pid: number | null;
  address: DomainSocketAddress;
  metadata: Record<string, any>;
}

export interface TargetDescription {
  udid: string;
  name: string;
  target_type: "simulator" | "device";
  state: string;
  os_version: string;
  architecture: string;
  companion_info: CompanionInfo | null;
  screen_dimensions: ScreenDimensions | null;
  model: string | null;
  device: string | null;
  extended: Record<string, any>;
  diagnostics: Record<string, any>;
  metadata: Record<string, any>;
}

export interface IdbLaunchResult {
  pid?: number;
  error?: string;
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
    return "idb";
  }

  /**
   * Add the device ID to the command if it exists
   * @param command - The command to add the device ID to
   * @returns The command with the device ID added
   */
  addDeviceToCommand(command: string): string {
    const deviceId = this.device?.deviceId;
    if (command.includes("--udid")) {
      return command;
    }
    return deviceId ? `${command} --udid ${deviceId}` : command;
  }

  /**
   * Execute an idb command
   * @param command - The simctl command to execute
   * @param timeoutMs - Optional timeout in milliseconds
   * @returns Promise with command output
   */
  async executeCommand(command: string, timeoutMs?: number): Promise<ExecResult> {
    const fullCommand = this.addDeviceToCommand(`${this.getBaseCommand()} ${command}`);
    const startTime = Date.now();

    logger.info(`[idb] Executing command: ${fullCommand}`);

    // Check if device is connected before executing command (if device is specified)
    if (this.device?.deviceId && !command.startsWith("list-targets") && !command.startsWith("connect")) {
      await this.ensureDeviceConnected();
    }

    const executeWithTimeout = async (): Promise<ExecResult> => {
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
          return result;
        } finally {
          clearTimeout(timeoutId!);
        }
      }

      // No timeout specified
      return await this.execAsync(fullCommand);
    };

    try {
      const result = await executeWithTimeout();
      const duration = Date.now() - startTime;
      logger.info(`[idb] Command completed in ${duration}ms: ${command}`);
      logger.info(`[idb] Command result...`);

      for (const line of result.stdout.split("\n")) {
        logger.info(`[idb] ${line}`);
      }
      return result;
    } catch (error) {
      const errorMessage = (error as Error).message;

      // Handle "Mach port not connected" error by connecting and retrying
      if (errorMessage.includes("Mach port not connected, device may not be ready yet") && this.device?.deviceId) {
        logger.info(`[idb] Device not connected, attempting to connect to ${this.device.deviceId}`);

        try {
          // Run idb connect directly without using executeCommand to avoid recursion
          const connectCommand = `${this.getBaseCommand()} connect ${this.device.deviceId} --json`;
          logger.info(`[idb] Executing connect command: ${connectCommand}`);
          await this.execAsync(connectCommand);

          // Retry the original command
          logger.info(`[idb] Retrying original command after connect: ${fullCommand}`);
          const retryResult = await executeWithTimeout();
          const duration = Date.now() - startTime;
          logger.info(`[idb] Command completed after retry in ${duration}ms: ${command}`);
          return retryResult;
        } catch (connectError) {
          logger.warn(`[idb] Failed to connect device ${this.device.deviceId}: ${(connectError as Error).message}`);
          // Fall through to original error handling
        }
      }

      const duration = Date.now() - startTime;
      logger.warn(`[idb] Command failed after ${duration}ms: ${command} - ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Ensure the current device is connected to idb companion
   * @throws Error if device cannot be connected
   */
  private async ensureDeviceConnected(): Promise<void> {
    if (!this.device?.deviceId) {
      return; // No device specified, nothing to check
    }

    try {
      logger.info(`[idb] Checking if device ${this.device.deviceId} is connected`);

      // Check current targets to see if our device is connected
      const listCommand = `${this.getBaseCommand()} list-targets --json`;
      const result = await this.execAsync(listCommand);

      const lines = result.stdout
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0);

      let deviceFound = false;
      let deviceConnected = false;

      for (const line of lines) {
        try {
          const target = JSON.parse(line);
          if (target.udid === this.device.deviceId) {
            deviceFound = true;
            // Check if device has companion info indicating it's connected
            if (target.companion_info && target.companion_info.is_local) {
              deviceConnected = true;
              logger.info(`[idb] Device ${this.device.deviceId} is already connected`);
              break;
            }
          }
        } catch (parseError) {
          logger.warn(`[idb] Failed to parse target line: ${line}`);
        }
      }

      if (!deviceFound) {
        throw new Error(`Device ${this.device.deviceId} not found in available targets`);
      }

      if (!deviceConnected) {
        logger.info(`[idb] Device ${this.device.deviceId} found but not connected, attempting to connect`);

        // Connect to the device
        const connectCommand = `${this.getBaseCommand()} connect ${this.device.deviceId} --json`;
        logger.info(`[idb] Executing connect command: ${connectCommand}`);
        await this.execAsync(connectCommand);

        logger.info(`[idb] Successfully connected to device ${this.device.deviceId}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`[idb] Failed to ensure device connection: ${errorMessage}`);
      throw new Error(`Failed to connect to device ${this.device.deviceId}: ${errorMessage}`);
    }
  }

  // =================
  // TARGET MANAGEMENT
  // =================

  /**
   * List all connected targets and parse the output as IdbTargetInfo[]
   */
  async listTargets(): Promise<IdbTargetInfo[]> {
    logger.info("[iOS] Listing connected targets");
    const result = await this.executeCommand("list-targets --json");
    // The output is a sequence of JSON objects, one per line (not a JSON array).
    // We need to parse each line as JSON and map to IdbTargetInfo[].
    const lines = result.stdout
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0);

    const targets: IdbTargetInfo[] = lines.map(line => {
      try {
        return JSON.parse(line) as IdbTargetInfo;
      } catch (err) {
        logger.warn(`[idb] Failed to parse target line: ${line}`);
        throw err;
      }
    });

    return targets;
  }

  /**
   * Describe the current or specified target
   * @param udid - Optional target UDID
   */
  async describe(): Promise<TargetDescription> {
    logger.info(`[idb] Describing target`);
    const result = await this.executeCommand(`describe --json`);
    return JSON.parse(result.stdout) as TargetDescription;
  }

  /**
   * Boot a simulator
   * @param udid - Simulator UDID
   */
  async boot(udid: string): Promise<ExecResult> {
    logger.info(`[idb] Booting simulator ${udid}`);
    return await this.executeCommand(`boot ${udid}`);
  }

  /**
   * Disconnect a target
   * @param udid - Target UDID
   */
  async disconnect(udid: string): Promise<ExecResult> {
    logger.info(`[idb] Disconnecting target ${udid}`);
    return await this.executeCommand(`disconnect ${udid}`);
  }

  // ==============
  // APP MANAGEMENT
  // ==============

  /**
   * List installed apps
   */
  async listApps(): Promise<IdbAppInfo[]> {
    logger.info("[iOS] Listing installed apps");
    const result = await this.executeCommand("list-apps --json");
    // The output is a sequence of JSON objects, one per line (not a JSON array).
    // We need to parse each line as JSON and map to IdbAppInfo[].
    const lines = result.stdout
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0);

    const apps: IdbAppInfo[] = lines.map(line => {
      const obj = JSON.parse(line);
      // Map fields from idb output to our IdbAppInfo interface
      return {
        bundleId: obj.bundle_id,
        name: obj.name,
        installType: obj.install_type,
        architectures: obj.architectures,
        isRunning: obj.process_state === "Running",
        isDebuggable: obj.debuggable,
      } as IdbAppInfo;
    });
    return apps;
  }

  /**
   * Install an app
   * @param appPath - Path to .app or .ipa file
   */
  async installApp(appPath: string): Promise<ExecResult> {
    logger.info(`[idb] Installing app from ${appPath}`);
    const { stdout } = await this.executeCommand(`install "${appPath}" --json`);
    return JSON.parse(stdout);
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
  ): Promise<IdbLaunchResult> {
    logger.info(`[idb] Launching app ${bundleId}`);
    let command = `launch ${bundleId} --json`;

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

    logger.info(`[idb] Launching app ${bundleId}${options ? " with options" : ""}`);
    const result = await this.executeCommand(command);
    logger.info(`[IDB] launchApp stdout: ${result.stdout}`);

    // Try to parse as JSON first (success case)
    try {
      const parsed = JSON.parse(result.stdout);
      if (parsed.pid) {
        return { pid: parsed.pid };
      }
      return parsed;
    } catch (jsonError) {
      // If JSON parsing fails, it's likely an error message
      const stdout = result.stdout.trim();

      // Check for common error patterns
      if (stdout.includes("can't be launched") ||
          stdout.includes("is not installed") ||
          stdout.includes("Error Domain=")) {
        return { error: stdout };
      }

      // If it's not a recognized error pattern, re-throw the JSON parsing error
      throw new Error(`Failed to parse idb launch output: ${stdout}`);
    }
  }

  /**
   * Terminate a running app
   * @param bundleId - App bundle ID
   */
  async terminateApp(bundleId: string): Promise<ExecResult> {
    logger.info(`[idb] Terminating app ${bundleId}`);
    const { stdout } = await this.executeCommand(`terminate ${bundleId} --json`);
    return JSON.parse(stdout);
  }

  /**
   * Uninstall an app
   * @param bundleId - App bundle ID
   */
  async uninstallApp(bundleId: string): Promise<ExecResult> {
    logger.info(`[idb] Uninstalling app ${bundleId}`);
    const { stdout } = await this.executeCommand(`uninstall ${bundleId} --json`);
    return JSON.parse(stdout);
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
    logger.info(`[idb] Tapping at (${x}, ${y})${duration ? ` for ${duration}ms` : ""}`);
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
  ): Promise<SwipeResult> {
    let command = `ui swipe ${startX} ${startY} ${endX} ${endY}`;
    if (stepSize) {
      command += ` --delta ${stepSize}`;
    }
    logger.info(`[idb] Swiping from (${startX}, ${startY}) to (${endX}, ${endY})${stepSize ? ` with step size ${stepSize}` : ""}`);

    try {
      await this.executeCommand(command);

      // Calculate duration based on distance (rough estimate)
      const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
      const estimatedDuration = Math.max(300, distance * 2); // Minimum 300ms, scaled by distance

      return {
        success: true,
        x1: startX,
        y1: startY,
        x2: endX,
        y2: endY,
        duration: estimatedDuration,
        easing: "linear"
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`[idb] Swipe failed: ${errorMessage}`);

      return {
        success: false,
        x1: startX,
        y1: startY,
        x2: endX,
        y2: endY,
        duration: 0,
        error: errorMessage
      };
    }
  }

  /**
   * Press a button
   * @param buttonType - Type of button to press
   */
  async pressButton(buttonType: IdbButton): Promise<ExecResult> {
    logger.info(`[idb] Pressing button ${buttonType}`);
    return await this.executeCommand(`ui button ${buttonType}`);
  }

  /**
   * Input text
   * @param text - Text to input
   */
  async inputText(text: string): Promise<ExecResult> {
    logger.info(`[idb] Inputting text: ${text}`);
    return await this.executeCommand(`ui text "${text}"`);
  }

  // =============
  // ACCESSIBILITY
  // =============
  async getScreenSize(): Promise<ScreenSize> {
    try {
      logger.info("[iOS] Getting screen size");
      const deviceInfo = await this.describe();

      // Use the structured data from TargetDescription
      if (deviceInfo.screen_dimensions) {
        // For iOS, idb ui swipe expects pixel coordinates, not logical points
        // Use the actual pixel dimensions (width/height) instead of points
        return {
          width: deviceInfo.screen_dimensions.width,
          height: deviceInfo.screen_dimensions.height
        };
      }

      logger.warn("[iOS] Could not get screen dimensions from device info");
      return {
        width: 0,
        height: 0
      };
    } catch (error) {
      logger.warn(`[idb] Failed to get screen size: ${error}`);
      return {
        width: 0,
        height: 0
      };
    }
  }

  /**
   * Describe the entire screen accessibility information
   */
  async describeAll(): Promise<ExecResult> {
    logger.info("[iOS] Describing entire screen accessibility");
    return await this.executeCommand("ui describe-all");
  }

  /**
   * Describe accessibility information at a point
   * @param x - X coordinate
   * @param y - Y coordinate
   */
  async describePoint(x: number, y: number): Promise<ExecResult> {
    logger.info(`[idb] Describing accessibility at point (${x}, ${y})`);
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
      logger.info("[iOS] Converting iOS accessibility elements to ViewHierarchyResult format");

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
      logger.info(`[idb] Accessibility conversion completed in ${duration}ms`);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[idb] Accessibility conversion failed after ${duration}ms: ${error}`);

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
      logger.warn(`[idb] Failed to get view hierarchy: ${error}`);

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
    logger.info(`[idb] Adding media file ${mediaPath}`);
    return await this.executeCommand(`media add "${mediaPath}"`);
  }

  /**
   * Approve permissions for an app
   * @param bundleId - App bundle ID
   * @param permissions - Array of permissions to approve
   */
  async approvePermissions(bundleId: string, permissions: string[]): Promise<ExecResult> {
    const permissionString = permissions.join(" ");
    logger.info(`[idb] Approving permissions for ${bundleId}: ${permissionString}`);
    return await this.executeCommand(`approve ${bundleId} ${permissionString}`);
  }

  /**
   * Update contacts database
   * @param contactsDbPath - Path to contacts database
   */
  async updateContacts(contactsDbPath: string): Promise<ExecResult> {
    logger.info(`[idb] Updating contacts from ${contactsDbPath}`);
    return await this.executeCommand(`contacts update "${contactsDbPath}"`);
  }

  /**
   * Open URL
   * @param url - URL to open
   */
  async openUrl(url: string): Promise<ExecResult> {
    logger.info(`[idb] Opening URL: ${url}`);
    return await this.executeCommand(`url open "${url}"`);
  }

  /**
   * Focus simulator window
   */
  async focus(): Promise<ExecResult> {
    logger.info("[iOS] Focusing simulator window");
    return await this.executeCommand("focus");
  }

  /**
   * Kill idb and clear companion information
   */
  async kill(): Promise<ExecResult> {
    logger.info("[iOS] Killing idb and clearing companion information");
    return await this.executeCommand("kill");
  }

  /**
   * Check if idb is available on the system
   * @returns Promise<boolean> - Whether idb is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.execAsync("idb --version");
      return true;
    } catch (error) {
      logger.info("[iOS] idb not available:", error);
      return false;
    }
  }
}
