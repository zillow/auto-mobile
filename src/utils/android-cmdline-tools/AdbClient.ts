import { execFile, spawn, type ChildProcess } from "child_process";
import { promisify } from "util";
import { logger } from "../logger";
import { BootedDevice, ExecResult, AndroidUser } from "../../models";
import { detectAndroidCommandLineTools, getBestAndroidToolsLocation } from "./detection";
import { AdbExecutor } from "./interfaces/AdbExecutor";
import { getAbortSignal } from "../AbortContext";
import { OPERATION_CANCELLED_MESSAGE } from "../constants";

type ExecFileAsync = (file: string, args: string[], maxBuffer?: number) => Promise<ExecResult>;

// Enhance the standard execFileAsync result to implement the ExecResult interface
const execFileAsync: ExecFileAsync = async (
  file: string,
  args: string[],
  maxBuffer?: number
): Promise<ExecResult> => {
  // Debug: Log when real exec is called (helps trace daemon startup in tests)
  if (process.env.DEBUG_ADB_EXEC) {
    console.warn(`[DEBUG_ADB_EXEC] Real execFileAsync called: ${file} ${args.join(" ")}`);
    console.warn(`[DEBUG_ADB_EXEC] Stack trace:`, new Error().stack);
  }
  const options = maxBuffer ? { maxBuffer } : undefined;
  const result = await promisify(execFile)(file, args, options);

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

export class AdbClient implements AdbExecutor {
  device: BootedDevice | null;
  execAsync: ExecFileAsync;
  spawnFn: typeof spawn;
  private adbPath: string;
  private isTestMode: boolean;
  private activeProcesses: Set<ChildProcess> = new Set();
  private apiLevelCache: number | null | undefined;

  // Static cache for device list
  private static deviceListCache: { devices: BootedDevice[], timestamp: number } | null = null;
  private static readonly DEVICE_LIST_CACHE_TTL = 5000; // 5 seconds
  private static readonly DEVICE_LIST_TIMEOUT_MS = 5000;
  private static readonly MAX_ADB_RETRIES = 3;

  // Static cache for ADB path detection (shared across instances)
  private static adbPathCache: { path: string, timestamp: number } | null = null;
  private static readonly ADB_PATH_CACHE_TTL = 60000; // 1 minute - ADB path rarely changes

  /**
   * Create an AdbClient instance
   * @param device - Optional device
   * @param execAsyncFn - promisified exec function (for testing)
   * @param spawnFn - spawn function (for testing)
   */
  constructor(
    device: BootedDevice | null = null,
    execAsyncFn: ((command: string, maxBuffer?: number) => Promise<ExecResult>) | ExecFileAsync | null = null,
    spawnFn: typeof spawn | null = null
  ) {
    this.device = device;
    this.execAsync = execAsyncFn
      ? this.wrapExecAsync(execAsyncFn)
      : execFileAsync;
    this.spawnFn = spawnFn || spawn;
    this.isTestMode = execAsyncFn !== null; // If custom execAsync provided, we're in test mode
    // Initialize with fallback, will be updated lazily
    this.adbPath = this.getFallbackAdbPath();

    // Debug: Log when a real (non-test) AdbClient is created
    if (process.env.DEBUG_ADB_EXEC && !this.isTestMode) {
      console.warn(`[DEBUG_ADB_EXEC] Real AdbClient created (not test mode)`);
      console.warn(`[DEBUG_ADB_EXEC] Stack trace:`, new Error().stack);
    }
  }

  private wrapExecAsync(
    execAsyncFn: ((command: string, maxBuffer?: number) => Promise<ExecResult>) | ExecFileAsync
  ): ExecFileAsync {
    if (execAsyncFn.length >= 3) {
      return execAsyncFn as ExecFileAsync;
    }
    return async (file: string, args: string[], maxBuffer?: number) => {
      const command = [file, ...args].join(" ");
      return (execAsyncFn as (command: string, maxBuffer?: number) => Promise<ExecResult>)(command, maxBuffer);
    };
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
    // 1. Try environment variables first (fastest path)
    const envPath = this.getFallbackAdbPath();
    if (envPath !== "adb") {
      // We got a path from environment variables, verify it exists
      try {
        await this.execAsync(envPath, ["version"]);
        logger.debug(`Using ADB from environment: ${envPath}`);
        return envPath;
      } catch {
        logger.debug(`ADB path from environment not working: ${envPath}`);
      }
    }

    // 2. Try to find via `which adb` (works in CI environments where adb is in PATH)
    try {
      const whichResult = await this.execAsync("which", ["adb"]);
      const adbFromPath = whichResult.stdout.trim();
      if (adbFromPath) {
        logger.debug(`Found ADB via which: ${adbFromPath}`);
        return adbFromPath;
      }
    } catch {
      logger.debug("ADB not found via 'which adb'");
    }

    // 3. Try Android command line tools detection (slower, more comprehensive)
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

    // 4. Final fallback - just use "adb" and hope it's in PATH
    logger.debug("Using fallback ADB path: adb");
    return "adb";
  }

  /**
   * Ensure ADB path is properly detected and cached
   */
  private async ensureAdbPath(): Promise<string> {
    // In test mode, skip detection and use fallback (usually "adb")
    if (this.isTestMode) {
      return this.adbPath;
    }

    // Check static cache first
    if (AdbClient.adbPathCache) {
      const cacheAge = Date.now() - AdbClient.adbPathCache.timestamp;
      if (cacheAge < AdbClient.ADB_PATH_CACHE_TTL) {
        this.adbPath = AdbClient.adbPathCache.path;
        return this.adbPath;
      }
    }

    // Detect and cache the path
    const detectedPath = await this.getAdbPath();
    AdbClient.adbPathCache = {
      path: detectedPath,
      timestamp: Date.now()
    };
    this.adbPath = detectedPath;
    return this.adbPath;
  }

  /**
   * Get the base ADB command with optional device ID
   * @returns The base ADB command
   */
  async getBaseCommand(): Promise<string> {
    const { adbPath, baseArgs } = await this.getBaseCommandParts();
    return [adbPath, ...baseArgs].join(" ");
  }

  async getBaseCommandParts(): Promise<{ adbPath: string; baseArgs: string[] }> {
    const deviceId = this.device?.deviceId;
    const adbPath = await this.ensureAdbPath();
    const baseArgs: string[] = [];

    // Support remote ADB server connection (for Docker containers connecting to host)
    const adbServerHost = process.env.AUTOMOBILE_ADB_SERVER_HOST;
    const adbServerPort = process.env.AUTOMOBILE_ADB_SERVER_PORT;
    if (adbServerHost) {
      baseArgs.push("-H", adbServerHost);
      if (adbServerPort) {
        baseArgs.push("-P", adbServerPort);
      }
    }

    if (deviceId) {
      baseArgs.push("-s", deviceId);
    }

    return { adbPath, baseArgs };
  }

  async getAdbPathOnly(): Promise<string> {
    return this.ensureAdbPath();
  }

  /**
   * Set the target device ID
   * @param deviceId - Device identifier
   */
  setDevice(device: BootedDevice): void {
    this.device = device;
    this.apiLevelCache = undefined;
  }

  /**
   * Execute an ADB command
   * @param command - The ADB command to execute
   * @param timeoutMs - Optional timeout in milliseconds
   * @param maxBuffer - Optional maximum buffer size for command output
   * @param noRetry - Optional flag to disable retry logic for commands expected to fail
   * @returns Promise with command output
   */
  async executeCommand(
    command: string,
    timeoutMs?: number,
    maxBuffer?: number,
    noRetry?: boolean,
    signal?: AbortSignal
  ): Promise<ExecResult> {
    const startTime = Date.now();
    const result = await this.executeCommandImpl(command, timeoutMs, maxBuffer, 0, noRetry, signal);
    const duration = Date.now() - startTime;

    // Only log longer commands or ones that take significant time
    if (duration > 10 || command.includes("screencap") || command.includes("uiautomator") || command.includes("getevent")) {
      const outputSize = result.stdout.length + result.stderr.length;
      logger.info(`[ADB] Command completed in ${duration}ms (output: ${outputSize} bytes): ${command.length > 50 ? command.substring(0, 50) + "..." : command}`);
    }

    return result;
  }

  /**
   * Get device time in milliseconds since epoch.
   * Falls back to host time if the device timestamp cannot be retrieved.
   */
  async getDeviceTimestampMs(): Promise<number> {
    try {
      const result = await this.executeCommand("shell date +%s%3N");
      const trimmed = result.stdout.trim();
      const parsed = parseInt(trimmed, 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    } catch (error) {
      logger.debug(`[ADB] Failed to read device time with ms precision: ${error}`);
    }

    try {
      const result = await this.executeCommand("shell date +%s");
      const trimmed = result.stdout.trim();
      const parsed = parseInt(trimmed, 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        return parsed * 1000;
      }
    } catch (error) {
      logger.debug(`[ADB] Failed to read device time in seconds: ${error}`);
    }

    logger.debug("[ADB] Falling back to host time for device timestamp");
    return Date.now();
  }

  /**
   * Get the Android API level for the connected device.
   */
  async getAndroidApiLevel(): Promise<number | null> {
    if (this.apiLevelCache !== undefined) {
      return this.apiLevelCache;
    }

    try {
      const result = await this.executeCommand(
        "shell getprop ro.build.version.sdk",
        undefined,
        undefined,
        true
      );
      const parsed = Number.parseInt(result.stdout.trim(), 10);
      this.apiLevelCache = Number.isNaN(parsed) ? null : parsed;
      return this.apiLevelCache;
    } catch (error) {
      logger.warn(`[ADB] Failed to read API level: ${error}`);
      this.apiLevelCache = null;
      return null;
    }
  }

  /**
   * Internal implementation of command execution
   * @param command - The ADB command to execute
   * @param timeoutMs - Optional timeout in milliseconds
   * @param maxBuffer - Optional maximum buffer size for command output
   * @param attempt - Current attempt number at executing this command
   * @param noRetry - Optional flag to disable retry logic for commands expected to fail
   * @returns Promise with command output
   */
  private async executeCommandImpl(
    command: string,
    timeoutMs?: number,
    maxBuffer?: number,
    attempt: number = 0,
    noRetry?: boolean,
    signal?: AbortSignal
  ): Promise<ExecResult> {
    const { adbPath, baseArgs } = await this.getBaseCommandParts();
    const commandArgs = this.parseCommandArgs(command);
    const fullArgs = [...baseArgs, ...commandArgs];
    const startTime = Date.now();
    const resolvedSignal = signal ?? getAbortSignal();

    // Log which device is receiving this command for parallel execution debugging
    const deviceInfo = this.device ? `[DEVICE:${this.device.deviceId}]` : "[NO-DEVICE]";
    logger.info(`[ADB] ${deviceInfo} Executing: ${command.length > 80 ? command.substring(0, 80) + "..." : command}`);

    try {
      const result = await this.execWithSignal(adbPath, fullArgs, maxBuffer, timeoutMs, resolvedSignal);
      const duration = Date.now() - startTime;
      logger.info(`[ADB] Command completed in ${duration}ms: ${command}`);
      return result;
    } catch (error) {
      if (resolvedSignal?.aborted) {
        throw new Error(OPERATION_CANCELLED_MESSAGE);
      }
      if (!noRetry && attempt < AdbClient.MAX_ADB_RETRIES) {
        return this.executeCommandImpl(command, timeoutMs, maxBuffer, attempt + 1, noRetry, resolvedSignal);
      }
      const duration = Date.now() - startTime;
      logger.warn(`[ADB] Command failed after ${duration}ms: ${command} - ${(error as Error).message}`);
      throw error;
    }
  }

  private async execWithSignal(
    file: string,
    args: string[],
    maxBuffer?: number,
    timeoutMs?: number,
    signal?: AbortSignal
  ): Promise<ExecResult> {
    if (signal?.aborted) {
      throw new Error(OPERATION_CANCELLED_MESSAGE);
    }

    if (this.isTestMode) {
      return this.execAsync(file, args, maxBuffer);
    }

    return new Promise<ExecResult>((resolve, reject) => {
      let settled = false;
      const options = maxBuffer ? { maxBuffer } : undefined;
      const child = execFile(file, args, options, (error, stdout, stderr) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        if (error) {
          reject(error);
          return;
        }
        resolve({
          stdout: typeof stdout === "string" ? stdout : stdout.toString(),
          stderr: typeof stderr === "string" ? stderr : stderr.toString(),
          toString() { return this.stdout; },
          trim() { return this.stdout.trim(); },
          includes(searchString: string) { return this.stdout.includes(searchString); }
        });
      });

      this.activeProcesses.add(child);

      const onAbort = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        child.kill("SIGTERM");
        reject(new Error(OPERATION_CANCELLED_MESSAGE));
      };

      const onExit = () => {
        this.activeProcesses.delete(child);
      };

      const cleanup = () => {
        this.activeProcesses.delete(child);
        child.off("exit", onExit);
        if (signal) {
          signal.removeEventListener("abort", onAbort);
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };

      let timeoutId: NodeJS.Timeout | undefined;
      if (timeoutMs) {
        timeoutId = setTimeout(() => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          child.kill("SIGTERM");
          reject(new Error(`Command timed out after ${timeoutMs}ms: ${file} ${args.join(" ")}`));
        }, timeoutMs);
      }

      child.on("exit", onExit);

      if (signal) {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    });
  }

  private parseCommandArgs(command: string): string[] {
    const trimmed = command.trim();
    const isWindows = process.platform === "win32";
    if (trimmed.startsWith("shell ")) {
      let shellCommand = trimmed.slice(6).trim();
      if (
        (shellCommand.startsWith("\"") && shellCommand.endsWith("\"")) ||
        (shellCommand.startsWith("'") && shellCommand.endsWith("'"))
      ) {
        shellCommand = shellCommand.slice(1, -1);
      }
      return ["shell", shellCommand];
    }

    const args: string[] = [];
    let current = "";
    let inSingle = false;
    let inDouble = false;
    let escape = false;

    for (const char of trimmed) {
      if (escape) {
        current += char;
        escape = false;
        continue;
      }

      if (!isWindows && char === "\\" && !inSingle) {
        escape = true;
        continue;
      }

      if (char === "'" && !inDouble) {
        inSingle = !inSingle;
        continue;
      }

      if (char === "\"" && !inSingle) {
        inDouble = !inDouble;
        continue;
      }

      if (!inSingle && !inDouble && /\s/.test(char)) {
        if (current.length > 0) {
          args.push(current);
          current = "";
        }
        continue;
      }

      current += char;
    }

    if (current.length > 0) {
      args.push(current);
    }

    return args;
  }

  /**
   * Get the list of connected devices
   * @returns Promise with an array of device IDs
   */
  async getBootedAndroidDevices(): Promise<BootedDevice[]> {
    // Check cache first
    if (AdbClient.deviceListCache) {
      const cacheAge = Date.now() - AdbClient.deviceListCache.timestamp;
      if (cacheAge < AdbClient.DEVICE_LIST_CACHE_TTL) {
        logger.info(`Getting list of connected devices (cached, age: ${cacheAge}ms)`);
        return AdbClient.deviceListCache.devices;
      }
    }

    logger.info("Getting list of connected devices");
    const result = await this.executeCommand(
      "devices",
      AdbClient.DEVICE_LIST_TIMEOUT_MS,
      undefined,
      true
    );
    const lines = result.stdout.split("\n").slice(1); // Skip the first line which is the header

    const devices = lines
      .filter(line => line.trim().length > 0)
      .map(line => {
        const parts = line.split("\t");
        return { name: parts[0], platform: "android", deviceId: parts[0] } as BootedDevice;
      });

    // Cache the result
    AdbClient.deviceListCache = {
      devices,
      timestamp: Date.now()
    };

    return devices;
  }

  /**
   * Check if the device screen is currently on
   * Uses dumpsys power to check mWakefulness state
   * @returns Promise<boolean> - true if screen is on (Awake), false if off (Asleep/Dozing)
   */
  async isScreenOn(signal?: AbortSignal): Promise<boolean> {
    const wakefulness = await this.getWakefulness(signal);
    return wakefulness === "Awake";
  }

  /**
   * Get the device wakefulness state
   * Uses dumpsys power to check mWakefulness state
   * @returns Promise with wakefulness state: "Awake", "Asleep", "Dozing", or null if unknown
   */
  async getWakefulness(signal?: AbortSignal): Promise<"Awake" | "Asleep" | "Dozing" | null> {
    try {
      const result = await this.executeCommand("shell dumpsys power | grep mWakefulness=", undefined, undefined, true, signal);
      const match = result.stdout.match(/mWakefulness=(\w+)/);
      if (match) {
        const state = match[1];
        if (state === "Awake" || state === "Asleep" || state === "Dozing") {
          return state;
        }
      }
      return null;
    } catch {
      logger.debug("[ADB] Failed to get wakefulness state");
      return null;
    }
  }

  /**
   * List all Android users on the device (personal, work profiles, etc.)
   * Uses dumpsys user for structured output parsing
   * Falls back to pm list users if dumpsys fails
   * @returns Promise with array of Android users
   */
  async listUsers(signal?: AbortSignal): Promise<AndroidUser[]> {
    try {
      // Try dumpsys user first - provides more structured output
      const result = await this.executeCommand("shell dumpsys user", undefined, undefined, true, signal);
      const users = this.parseUsersFromDumpsys(result.stdout);

      if (users.length > 0) {
        logger.info(`[ADB] Found ${users.length} user(s) via dumpsys: ${users.map(u => `${u.userId}:${u.name}`).join(", ")}`);
        return users;
      }

      // If dumpsys parsing failed, fall back to pm list users
      logger.debug("[ADB] dumpsys user parsing returned no users, falling back to pm list users");
      return await this.listUsersLegacy(signal);
    } catch (error) {
      logger.debug(`[ADB] dumpsys user failed: ${(error as Error).message}, falling back to pm list users`);
      return await this.listUsersLegacy(signal);
    }
  }

  /**
   * Parse user information from dumpsys user output
   * Example line: "  UserInfo{0:null:4c13} serialNo=0 isPrimary=true"
   * Followed by: "    State: RUNNING_UNLOCKED" or "    State: SHUTDOWN"
   * @param output - Raw dumpsys user output
   * @returns Array of parsed Android users
   */
  private parseUsersFromDumpsys(output: string): AndroidUser[] {
    const users: AndroidUser[] = [];
    const lines = output.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Match UserInfo line: UserInfo{userId:name:flags} ...
      // Note: name can be "null" in dumpsys output, and flags are hexadecimal
      const userMatch = line.match(/UserInfo\{(\d+):([^:]+):([0-9a-fA-F]+)\}/);
      if (userMatch) {
        const userId = parseInt(userMatch[1], 10);
        let userName = userMatch[2];
        const flags = parseInt(userMatch[3], 16); // Parse as hexadecimal

        // Look for the State line in the next few lines
        let running = false;
        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
          const stateLine = lines[j];

          // If we hit another UserInfo, stop searching
          if (stateLine.match(/UserInfo\{/)) {
            break;
          }

          // Check for State: RUNNING_UNLOCKED or RUNNING_LOCKED
          if (stateLine.match(/State:\s+(RUNNING_UNLOCKED|RUNNING_LOCKED)/)) {
            running = true;
            break;
          }

          // If we see State: SHUTDOWN, mark as not running
          if (stateLine.match(/State:\s+SHUTDOWN/)) {
            running = false;
            break;
          }
        }

        // If name is "null" in dumpsys, try to get the real name from "Owner name:" line
        if (userName === "null") {
          // For user 0, look for "Owner name:" line
          const ownerMatch = output.match(/Owner name:\s+(.+)/);
          if (ownerMatch && userId === 0) {
            userName = ownerMatch[1].trim();
          } else {
            userName = `User ${userId}`;
          }
        }

        users.push({
          userId,
          name: userName,
          flags,
          running
        });
      }
    }

    return users;
  }

  /**
   * Legacy method to list users using pm list users command
   * Used as fallback when dumpsys user is not available or fails
   * Example output:
   *   Users:
   *     UserInfo{0:Owner:4c13} running
   *     UserInfo{10:Work profile:30} running
   * @returns Promise with array of Android users
   */
  private async listUsersLegacy(signal?: AbortSignal): Promise<AndroidUser[]> {
    try {
      const result = await this.executeCommand("shell pm list users", undefined, undefined, true, signal);
      const lines = result.stdout.split("\n");
      const users: AndroidUser[] = [];

      for (const line of lines) {
        // Match pattern: UserInfo{userId:name:flags} [running]
        // Note: flags are hexadecimal (e.g., "4c13")
        const match = line.match(/UserInfo\{(\d+):([^:]+):([0-9a-fA-F]+)\}\s*(running)?/);
        if (match) {
          users.push({
            userId: parseInt(match[1], 10),
            name: match[2],
            flags: parseInt(match[3], 16), // Parse as hexadecimal
            running: match[4] === "running"
          });
        }
      }

      if (users.length > 0) {
        logger.info(`[ADB] Found ${users.length} user(s) via pm: ${users.map(u => `${u.userId}:${u.name}`).join(", ")}`);
        return users;
      }

      // If still no users found, log the raw output for debugging
      logger.warn(`[ADB] Failed to parse users from pm list users. Raw output: ${result.stdout.substring(0, 200)}`);

      // Return primary user as last resort fallback
      return [{
        userId: 0,
        name: "Owner",
        flags: 0x13,
        running: true
      }];
    } catch (error) {
      logger.warn(`[ADB] Failed to list users via pm: ${(error as Error).message}`);
      // Return primary user as fallback
      return [{
        userId: 0,
        name: "Owner",
        flags: 0x13,
        running: true
      }];
    }
  }

  /**
   * Get the current foreground app package name and user ID
   * Uses dumpsys activity to find the resumed/focused activity
   * @returns Promise with { packageName: string, userId: number } or null if no app in foreground
   */
  async getForegroundApp(signal?: AbortSignal): Promise<{ packageName: string; userId: number } | null> {
    try {
      const result = await this.executeCommand(
        'shell dumpsys activity activities | grep -E "(mResumedActivity|mFocusedActivity|topResumedActivity)" | head -1',
        undefined,
        undefined,
        true,
        signal
      );

      // Parse output to extract package name and user ID
      // Example patterns:
      //   mResumedActivity: ActivityRecord{abc1234 u0 com.example.app/.MainActivity t123}
      //   mFocusedActivity: ActivityRecord{abc1234 u10 com.example.app/.MainActivity t123}
      //   topResumedActivity=ActivityRecord{abc1234 u0 com.example.app/.MainActivity t123}

      const match = result.stdout.match(/u(\d+)\s+([^\s/]+)\//);
      if (match) {
        const userId = parseInt(match[1], 10);
        const packageName = match[2];
        logger.info(`[ADB] Foreground app: ${packageName} (user ${userId})`);
        return { packageName, userId };
      }

      logger.debug("[ADB] No foreground app detected");
      return null;
    } catch (error) {
      logger.debug(`[ADB] Failed to get foreground app: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Kill the ADB server daemon.
   * Useful for cleanup after tests to prevent orphan processes.
   */
  static async killServer(): Promise<void> {
    try {
      const { execFile } = await import("child_process");
      const { promisify } = await import("util");
      const execFileAsync = promisify(execFile);
      await execFileAsync("adb", ["kill-server"]);
      logger.debug("[ADB] Server killed successfully");
    } catch {
      // Ignore errors - server may not be running
      logger.debug("[ADB] Server kill failed or server not running");
    }
  }
}

// Backward compatibility export
export const AdbUtils = AdbClient;
