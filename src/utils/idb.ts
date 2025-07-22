import { exec, spawn } from "child_process";
import { promisify } from "util";
import { logger } from "./logger";
import { ExecResult } from "../models/ExecResult";

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

export class IdbUtils {
  deviceId: string | null;
  execAsync: (command: string, maxBuffer?: number) => Promise<ExecResult>;
  spawnFn: typeof spawn;

  // Static cache for device list
  private static deviceListCache: { devices: string[], timestamp: number } | null = null;
  private static readonly DEVICE_LIST_CACHE_TTL = 5000; // 5 seconds
  private static readonly MAX_IDB_RETRIES = 3;

  /**
   * Create an IdbUtils instance
   * @param deviceId - Optional device ID
   * @param execAsyncFn - promisified exec function (for testing)
   * @param spawnFn - spawn function (for testing)
   */
  constructor(
    deviceId: string | null = null,
    execAsyncFn: ((command: string, maxBuffer?: number) => Promise<ExecResult>) | null = null,
    spawnFn: typeof spawn | null = null
  ) {
    this.deviceId = deviceId;
    this.execAsync = execAsyncFn || execAsync;
    this.spawnFn = spawnFn || spawn;
  }

  /**
   * Get the base IDB command with optional device ID
   * @returns The base IDB command
   */
  getBaseCommand(): string {
    return this.deviceId ? `idb --udid ${this.deviceId}` : "idb";
  }

  /**
   * Execute an IDB command
   * @param command - The IDB command to execute
   * @param timeoutMs - Optional timeout in milliseconds
   * @param maxBuffer - Optional maximum buffer size for command output
   * @returns Promise with command output
   */
  async executeCommand(command: string, timeoutMs?: number, maxBuffer?: number): Promise<ExecResult> {
    const startTime = Date.now();
    const result = await this.executeCommandImpl(command, timeoutMs, maxBuffer);
    const duration = Date.now() - startTime;

    // Only log longer commands or ones that take significant time
    if (duration > 10 || command.includes("screenshot") || command.includes("ui describe")) {
      const outputSize = result.stdout.length + result.stderr.length;
      logger.info(`[IDB] Command completed in ${duration}ms (output: ${outputSize} bytes): ${command.length > 50 ? command.substring(0, 50) + "..." : command}`);
    }

    return result;
  }

  /**
   * Internal implementation of command execution
   * @param command - The IDB command to execute
   * @param timeoutMs - Optional timeout in milliseconds
   * @param maxBuffer - Optional maximum buffer size for command output
   * @returns Promise with command output
   */
  private async executeCommandImpl(command: string, timeoutMs?: number, maxBuffer?: number, attempt: number = 0): Promise<ExecResult> {
    const fullCommand = `${this.getBaseCommand()} ${command}`;
    const startTime = Date.now();

    logger.info(`[IDB] Executing command: ${fullCommand}`);

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
        logger.info(`[IDB] Command completed in ${duration}ms: ${command}`);
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.warn(`[IDB] Command failed after ${duration}ms: ${command} - ${(error as Error).message}`);
        throw error;
      } finally {
        clearTimeout(timeoutId!);
      }
    }

    // No timeout specified
    try {
      const result = await this.execAsync(fullCommand, maxBuffer);
      const duration = Date.now() - startTime;
      logger.info(`[IDB] Command completed in ${duration}ms: ${command}`);
      return result;
    } catch (error) {
      if (attempt < IdbUtils.MAX_IDB_RETRIES) {
        return this.executeCommandImpl(command, timeoutMs, maxBuffer, attempt + 1);
      } else {
        const duration = Date.now() - startTime;
        logger.warn(`[IDB] Command failed after ${duration}ms: ${command} - ${(error as Error).message}`);
        throw error;
      }
    }
  }

  /**
   * Get the list of connected iOS devices
   * @returns Promise with an array of device IDs
   */
  async getDevices(): Promise<string[]> {
    // Check cache first
    if (IdbUtils.deviceListCache) {
      const cacheAge = Date.now() - IdbUtils.deviceListCache.timestamp;
      if (cacheAge < IdbUtils.DEVICE_LIST_CACHE_TTL) {
        logger.info(`Getting list of connected iOS devices (cached, age: ${cacheAge}ms)`);
        return IdbUtils.deviceListCache.devices;
      }
    }

    logger.info("Getting list of connected iOS devices");
    const result = await this.execAsync("idb list-targets --json");
    
    try {
      const targets = JSON.parse(result.stdout);
      const devices = targets
        .filter((target: any) => target.state === 'Booted' || target.state === 'Shutdown')
        .map((target: any) => target.udid);

      // Cache the result
      IdbUtils.deviceListCache = {
        devices,
        timestamp: Date.now()
      };

      return devices;
    } catch (error) {
      logger.warn("Failed to parse idb list-targets output:", error);
      return [];
    }
  }
} 