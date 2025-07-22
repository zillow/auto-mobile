import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "../logger";
import { ExecResult, ActionableError, DeviceInfo, BootedDevice } from "../../models";

// Enhance the standard execAsync result to implement the ExecResult interface
const execAsync = async (command: string, maxBuffer?: number): Promise<ExecResult> => {
  const options = maxBuffer ? { maxBuffer } : undefined;
  const result = await promisify(exec)(command, options);

  // Add the required string methods
  const enhancedResult: ExecResult = {
    stdout: typeof result.stdout === "string" ? result.stdout : result.stdout.toString(),
    stderr: typeof result.stderr === "string" ? result.stderr : result.stderr.toString(),
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

export interface IdbTestBundle {
  bundleId: string;
  name: string;
  testMethods: string[];
}

export interface IdbCrashLog {
  name: string;
  date: string;
  bundleId?: string;
}

export class IdbPython {
  device: BootedDevice | null;
  execAsync: (command: string, maxBuffer?: number) => Promise<ExecResult>;

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
    execAsyncFn: ((command: string, maxBuffer?: number) => Promise<ExecResult>) | null = null
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
