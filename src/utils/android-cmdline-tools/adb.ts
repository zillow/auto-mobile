import { exec, spawn } from "child_process";
import { promisify } from "util";
import { logger } from "../logger";
import { BootedDevice, ExecResult } from "../../models";
import { detectAndroidCommandLineTools, getBestAndroidToolsLocation } from "./detection";

// Enhance the standard execAsync result to implement the ExecResult interface
const execAsync = async (command: string, maxBuffer?: number): Promise<ExecResult> => {
  const options = maxBuffer ? { maxBuffer } : undefined;
  const result = await promisify(exec)(command, options);

  // Add the required string methods
  const enhancedResult: ExecResult = {
    stdout: typeof result.stdout === "string" ? result.stdout : result.stdout.toString(),
    stderr: typeof result.stderr === "string" ? result.stderr : result.stderr.toString(),
    toString() { return this.stdout; },
    trim() { return this.stdout.trim(); },
    includes(searchString: string) { return this.stdout.includes(searchString); }
  };

  return enhancedResult;
};

export class AdbUtils {
  device: BootedDevice | null;
  execAsync: (command: string, maxBuffer?: number) => Promise<ExecResult>;
  spawnFn: typeof spawn;
  private adbPath: string;

  // Static cache for device list
  private static deviceListCache: { devices: BootedDevice[], timestamp: number } | null = null;
  private static readonly DEVICE_LIST_CACHE_TTL = 5000; // 5 seconds
  private static readonly MAX_ADB_RETRIES = 3;

  /**
   * Create an AdbUtils instance
   * @param device - Optional device
   * @param execAsyncFn - promisified exec function (for testing)
   * @param spawnFn - spawn function (for testing)
   */
  constructor(
    device: BootedDevice | null = null,
    execAsyncFn: ((command: string, maxBuffer?: number) => Promise<ExecResult>) | null = null,
    spawnFn: typeof spawn | null = null
  ) {
    this.device = device;
    this.execAsync = execAsyncFn || execAsync;
    this.spawnFn = spawnFn || spawn;
    // Initialize with fallback, will be updated lazily
    this.adbPath = this.getFallbackAdbPath();
  }

  /**
   * Get fallback ADB path using environment variables and PATH
   */
  private getFallbackAdbPath(): string {
    // Try environment variables
    const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || process.env.ANDROID_SDK_HOME;
    if (androidHome) {
      return `${androidHome}/platform-tools/adb`;
    }

    // Final fallback to PATH
    return "adb";
  }

  /**
   * Get the ADB path asynchronously via detection
   */
  private async getAdbPath(): Promise<string> {
    // Try to find via Android command line tools detection
    try {
      const locations = await detectAndroidCommandLineTools();
      const bestLocation = getBestAndroidToolsLocation(locations);

      if (bestLocation) {
        // For Homebrew installations, the platform-tools are in the SDK root directory
        if (bestLocation.source === "homebrew") {
          // /opt/homebrew/share/android-commandlinetools/cmdline-tools/latest -> /opt/homebrew/share/android-commandlinetools
          const sdkRoot = bestLocation.path.replace("/cmdline-tools/latest", "");
          return `${sdkRoot}/platform-tools/adb`;
        }

        // For standard installations, look in the parent SDK directory
        const sdkRoot = bestLocation.path.replace("/cmdline-tools/latest", "");
        return `${sdkRoot}/platform-tools/adb`;
      }
    } catch (error) {
      logger.debug(`Failed to detect ADB path via Android tools detection: ${error}`);
    }

    return this.getFallbackAdbPath();
  }

  /**
   * Ensure ADB path is properly detected and cached
   */
  private async ensureAdbPath(): Promise<string> {
    // Update cached path if needed
    const detectedPath = await this.getAdbPath();
    this.adbPath = detectedPath;
    return this.adbPath;
  }

  /**
   * Get the base ADB command with optional device ID
   * @returns The base ADB command
   */
  async getBaseCommand(): Promise<string> {
    const deviceId = this.device?.deviceId;
    const adbPath = await this.ensureAdbPath();
    return deviceId ? `${adbPath} -s ${deviceId}` : adbPath;
  }

  /**
   * Set the target device ID
   * @param deviceId - Device identifier
   */
  setDevice(device: BootedDevice): void {
    this.device = device;
  }

  /**
   * Execute an ADB command
   * @param command - The ADB command to execute
   * @param timeoutMs - Optional timeout in milliseconds
   * @param maxBuffer - Optional maximum buffer size for command output
   * @returns Promise with command output
   */
  async executeCommand(command: string, timeoutMs?: number, maxBuffer?: number): Promise<ExecResult> {
    const startTime = Date.now();
    const result = await this.executeCommandImpl(command, timeoutMs, maxBuffer);
    const duration = Date.now() - startTime;

    // Only log longer commands or ones that take significant time
    if (duration > 10 || command.includes("screencap") || command.includes("uiautomator") || command.includes("getevent")) {
      const outputSize = result.stdout.length + result.stderr.length;
      logger.info(`[ADB] Command completed in ${duration}ms (output: ${outputSize} bytes): ${command.length > 50 ? command.substring(0, 50) + "..." : command}`);
    }

    return result;
  }

  /**
   * Internal implementation of command execution
   * @param command - The ADB command to execute
   * @param timeoutMs - Optional timeout in milliseconds
   * @param maxBuffer - Optional maximum buffer size for command output
   * @param attempt - Current attempt number at executing this command
   * @returns Promise with command output
   */
  private async executeCommandImpl(command: string, timeoutMs?: number, maxBuffer?: number, attempt: number = 0): Promise<ExecResult> {
    const baseCommand = await this.getBaseCommand();
    const fullCommand = `${baseCommand} ${command}`;
    const startTime = Date.now();

    logger.info(`[ADB] Executing command: ${fullCommand}`);

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
        const result = await Promise.race([this.execAsync(fullCommand, maxBuffer), timeoutPromise]);
        const duration = Date.now() - startTime;
        logger.info(`[ADB] Command completed in ${duration}ms: ${command}`);
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.warn(`[ADB] Command failed after ${duration}ms: ${command} - ${(error as Error).message}`);
        throw error;
      } finally {
        clearTimeout(timeoutId!);
      }
    }

    // No timeout specified
    try {
      const result = await this.execAsync(fullCommand, maxBuffer);
      const duration = Date.now() - startTime;
      logger.info(`[ADB] Command completed in ${duration}ms: ${command}`);
      return result;
    } catch (error) {
      if (attempt < AdbUtils.MAX_ADB_RETRIES) {
        return this.executeCommandImpl(command, timeoutMs, maxBuffer, attempt + 1);
      } else {
        const duration = Date.now() - startTime;
        logger.warn(`[ADB] Command failed after ${duration}ms: ${command} - ${(error as Error).message}`);
        throw error;
      }
    }
  }

  /**
   * Get the list of connected devices
   * @returns Promise with an array of device IDs
   */
  async getBootedEmulators(): Promise<BootedDevice[]> {
    // Check cache first
    if (AdbUtils.deviceListCache) {
      const cacheAge = Date.now() - AdbUtils.deviceListCache.timestamp;
      if (cacheAge < AdbUtils.DEVICE_LIST_CACHE_TTL) {
        logger.info(`Getting list of connected devices (cached, age: ${cacheAge}ms)`);
        return AdbUtils.deviceListCache.devices;
      }
    }

    logger.info("Getting list of connected devices");
    // Use raw ADB command without device ID since we're listing devices
    const baseCommand = await this.getBaseCommand();
    const result = await this.execAsync(`${baseCommand} devices`);
    const lines = result.stdout.split("\n").slice(1); // Skip the first line which is the header

    const devices = lines
      .filter(line => line.trim().length > 0)
      .map(line => {
        const parts = line.split("\t");
        return { name: parts[0], platform: "android", deviceId: parts[0] } as BootedDevice;
      });

    // Cache the result
    AdbUtils.deviceListCache = {
      devices,
      timestamp: Date.now()
    };

    return devices;
  }
}
