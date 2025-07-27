import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "../logger";
import {
  ExecResult,
  DeviceInfo,
  BootedDevice,
  ScreenSize, SwipeResult, ActionableError
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

export type AxeButton = "apple_pay" | "home" | "lock" | "side_button" | "siri";

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

export class Axe {
  device: BootedDevice | null;
  execAsync: (command: string) => Promise<ExecResult>;

  // Static cache for device list
  private static deviceListCache: { devices: DeviceInfo[], timestamp: number } | null = null;
  private static readonly DEVICE_LIST_CACHE_TTL = 5000; // 5 seconds

  /**
   * Create an Axe instance
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
   * Get the base Axe command with device UDID
   * @returns The base Axe command
   */
  getBaseCommand(): string {
    return "axe";
  }

  /**
   * Get the UDID parameter for commands
   * @returns UDID parameter string
   */
  private getUdidParam(): string {
    if (this.device?.deviceId) {
      return `--udid ${this.device.deviceId}`;
    }
    return "";
  }

  /**
   * Execute an axe command
   * @param command - The axe command to execute
   * @param timeoutMs - Optional timeout in milliseconds
   * @returns Promise with command output
   */
  async executeCommand(command: string, timeoutMs?: number): Promise<ExecResult> {
    const udidParam = this.getUdidParam();
    const fullCommand = `${this.getBaseCommand()} ${command} ${udidParam}`.trim();
    const startTime = Date.now();

    logger.info(`[axe] Executing command: ${fullCommand}`);

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
      logger.debug(`[axe] Command completed in ${duration}ms: ${command}`);
      logger.debug(`[axe] Command result...`);

      for (const line of result.stdout.split("\n")) {
        logger.debug(`[axe] ${line}`);
      }
      return result;
    } catch (error) {
      const errorMessage = (error as Error).message;
      const duration = Date.now() - startTime;
      logger.warn(`[axe] Command failed after ${duration}ms: ${command} - ${errorMessage}`);
      throw error;
    }
  }

  /**
   * List all available simulators
   */
  async listTargets(): Promise<IdbTargetInfo[]> {
    logger.debug("[iOS] Listing available simulators");
    const result = await this.executeCommand("list-simulators");

    // Parse the output to extract simulator information
    // The exact format will depend on axe's output format
    const lines = result.stdout
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0);

    const targets: IdbTargetInfo[] = [];

    // Parse each line of simulator output
    for (const line of lines) {
      // This is a placeholder - actual parsing will depend on axe's output format
      try {
        // If axe outputs JSON, parse it; otherwise parse text format
        if (line.startsWith("{")) {
          const target = JSON.parse(line) as IdbTargetInfo;
          targets.push(target);
        } else {
          // Parse text format if needed
          // This would need to be implemented based on actual axe output
        }
      } catch (err) {
        logger.warn(`[axe] Failed to parse simulator line: ${line}`);
      }
    }

    return targets;
  }

  /**
   * Describe the current target - not directly supported by axe
   * Returns basic device info if available
   */
  async describe(): Promise<TargetDescription> {
    logger.debug(`[axe] Getting target description`);

    // Axe doesn't have a direct describe command, so we'll return basic info
    if (!this.device?.deviceId) {
      throw new Error("No device set for description");
    }

    // Return a basic description with available information
    return {
      udid: this.device.deviceId,
      name: this.device.name || "iOS Simulator",
      target_type: "simulator",
      state: "booted", // Assume booted if we can interact with it
      os_version: "unknown",
      architecture: "x86_64",
      companion_info: null,
      screen_dimensions: null,
      model: null,
      device: null,
      extended: {},
      diagnostics: {},
      metadata: {}
    } as TargetDescription;
  }

  /**
   * Tap at coordinates
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param duration - Optional tap duration in milliseconds (not directly supported)
   */
  async tap(x: number, y: number, duration?: number): Promise<ExecResult> {
    let command = `tap -x ${x} -y ${y}`;
    if (duration) {
      // Axe doesn't have direct duration support for tap, but we can add pre/post delays
      command += ` --post-delay ${duration / 1000}`;
    }
    logger.debug(`[axe] Tapping at (${x}, ${y})${duration ? ` with ${duration}ms delay` : ""}`);
    return await this.executeCommand(command);
  }

  /**
   * Swipe from start to end coordinates
   * @param startX - Start X coordinate
   * @param startY - Start Y coordinate
   * @param endX - End X coordinate
   * @param endY - End Y coordinate
   * @param stepSize - Optional step size (delta in axe terminology) - not used, kept for compatibility
   * @param duration - Optional swipe duration in seconds - not used, hardcoded to 0.3
   */
  async swipe(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    stepSize?: number,
    duration?: number
  ): Promise<SwipeResult> {
    // Hard code duration to 0.3 as requested
    const command = `swipe --start-x ${startX} --end-x ${endX} --start-y ${startY} --end-y ${endY} --duration 0.3`;

    logger.info(`[axe] Swiping from (${startX}, ${startY}) to (${endX}, ${endY}) with duration 0.3s`);

    try {
      await this.executeCommand(command);

      return {
        success: true,
        x1: startX,
        y1: startY,
        x2: endX,
        y2: endY,
        duration: 300, // Return duration in milliseconds
        easing: "linear"
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`[axe] Swipe failed: ${errorMessage}`);

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
  async pressButton(buttonType: AxeButton): Promise<ExecResult> {
    logger.debug(`[axe] Pressing button ${buttonType}`);
    return await this.executeCommand(`button ${buttonType}`);
  }

  /**
   * Input text
   * @param text - Text to input
   */
  async inputText(text: string): Promise<ExecResult> {
    logger.debug(`[axe] Inputting text: ${text}`);
    // Use single quotes to handle special characters
    return await this.executeCommand(`type '${text.replace(/'/g, "\\'")}'`);
  }

  async getScreenSize(): Promise<ScreenSize> {
    logger.debug("[iOS] Getting screen size via describe-ui");

    const result = await this.executeCommand("describe-ui");

    // Parse the JSON output
    try {
      const uiElements = JSON.parse(result.stdout.trim());

      // The first element should be the root application element
      if (Array.isArray(uiElements) && uiElements.length > 0) {
        const rootElement = uiElements[0];
        if (rootElement.frame && rootElement.frame.width && rootElement.frame.height) {
          return {
            width: Math.round(rootElement.frame.width),
            height: Math.round(rootElement.frame.height)
          };
        }
      }
    } catch (parseError) {
      logger.warn(`[axe] Failed to parse JSON output: ${parseError}`);
    }

    throw new ActionableError("Failed to determine screen size from axe describe-ui output");
  }

  /**
   * Open URL - not directly supported by axe
   */
  async openUrl(url: string): Promise<ExecResult> {
    throw new Error("URL opening not supported by axe - use simctl or Safari automation instead");
  }

  /**
   * Focus simulator window - not supported by axe
   */
  async focus(): Promise<ExecResult> {
    logger.debug("[iOS] Focus not supported by axe");
    // Return success response as this is not critical
    return {
      stdout: "Focus not supported by axe",
      stderr: "",
      toString: () => "Focus not supported by axe",
      trim: () => "Focus not supported by axe",
      includes: (searchString: string) => false
    };
  }

  /**
   * Kill axe processes - not applicable
   */
  async kill(): Promise<ExecResult> {
    logger.debug("[iOS] Kill not applicable for axe");
    return {
      stdout: "Kill not applicable for axe",
      stderr: "",
      toString: () => "Kill not applicable for axe",
      trim: () => "Kill not applicable for axe",
      includes: (searchString: string) => false
    };
  }

  /**
   * Check if axe is available on the system
   * @returns Promise<boolean> - Whether axe is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.execAsync("axe --help");
      return true;
    } catch (error) {
      logger.debug("[iOS] axe not available:", error);
      return false;
    }
  }

  /**
   * Execute a gesture preset
   * @param preset - Gesture preset name
   * @param options - Optional timing and screen dimension options
   */
  async executeGesture(
    preset: string,
    options?: {
      preDelay?: number;
      postDelay?: number;
      screenWidth?: number;
      screenHeight?: number;
    }
  ): Promise<ExecResult> {
    let command = `gesture ${preset}`;

    if (options?.preDelay) {
      command += ` --pre-delay ${options.preDelay}`;
    }

    if (options?.postDelay) {
      command += ` --post-delay ${options.postDelay}`;
    }

    if (options?.screenWidth) {
      command += ` --screen-width ${options.screenWidth}`;
    }

    if (options?.screenHeight) {
      command += ` --screen-height ${options.screenHeight}`;
    }

    logger.debug(`[axe] Executing gesture preset: ${preset}`);
    return await this.executeCommand(command);
  }

  /**
   * Scroll up using gesture preset
   */
  async scrollUp(options?: { preDelay?: number; postDelay?: number }): Promise<ExecResult> {
    return await this.executeGesture("scroll-up", options);
  }

  /**
   * Scroll down using gesture preset
   */
  async scrollDown(options?: { preDelay?: number; postDelay?: number }): Promise<ExecResult> {
    return await this.executeGesture("scroll-down", options);
  }

  /**
   * Scroll left using gesture preset
   */
  async scrollLeft(options?: { preDelay?: number; postDelay?: number }): Promise<ExecResult> {
    return await this.executeGesture("scroll-left", options);
  }

  /**
   * Scroll right using gesture preset
   */
  async scrollRight(options?: { preDelay?: number; postDelay?: number }): Promise<ExecResult> {
    return await this.executeGesture("scroll-right", options);
  }

  /**
   * Swipe from left edge (back navigation)
   */
  async swipeFromLeftEdge(options?: { preDelay?: number; postDelay?: number }): Promise<ExecResult> {
    return await this.executeGesture("swipe-from-left-edge", options);
  }

  /**
   * Swipe from right edge
   */
  async swipeFromRightEdge(options?: { preDelay?: number; postDelay?: number }): Promise<ExecResult> {
    return await this.executeGesture("swipe-from-right-edge", options);
  }

  /**
   * Swipe from top edge
   */
  async swipeFromTopEdge(options?: { preDelay?: number; postDelay?: number }): Promise<ExecResult> {
    return await this.executeGesture("swipe-from-top-edge", options);
  }

  /**
   * Swipe from bottom edge
   */
  async swipeFromBottomEdge(options?: { preDelay?: number; postDelay?: number }): Promise<ExecResult> {
    return await this.executeGesture("swipe-from-bottom-edge", options);
  }
}
