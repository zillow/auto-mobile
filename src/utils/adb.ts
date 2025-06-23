import { exec, spawn, ChildProcess } from "child_process";
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

export class AdbUtils {
  deviceId: string | null;
  execAsync: (command: string, maxBuffer?: number) => Promise<ExecResult>;
  spawnFn: typeof spawn;

  /**
   * Create an AdbUtils instance
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
   * Set the target device ID
   * @param deviceId - Device identifier
   */
  setDeviceId(deviceId: string): void {
    this.deviceId = deviceId;
  }

  /**
   * Get the base ADB command with optional device ID
   * @returns The base ADB command
   */
  getBaseCommand(): string {
    return this.deviceId ? `$ANDROID_HOME/platform-tools/adb -s ${this.deviceId}` : "$ANDROID_HOME/platform-tools/adb";
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
   * @returns Promise with command output
   */
  private async executeCommandImpl(command: string, timeoutMs?: number, maxBuffer?: number): Promise<ExecResult> {
    const fullCommand = `${this.getBaseCommand()} ${command}`;
    const startTime = Date.now();

    logger.info(`[ADB] Executing command: ${fullCommand}`);

    // Use Promise.race to implement timeout if specified
    if (timeoutMs) {
      let timeoutId: NodeJS.Timeout;

      const timeoutPromise = new Promise<ExecResult>((_, reject) => {
        timeoutId = setTimeout(() =>
          reject(new Error(`Command timed out after ${timeoutMs}ms: ${fullCommand}`)),
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
      const duration = Date.now() - startTime;
      logger.warn(`[ADB] Command failed after ${duration}ms: ${command} - ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Parse a command string into arguments, respecting quotes
   * @param command - The command string to parse
   * @returns Array of command arguments
   */
  private parseCommandArgs(command: string): string[] {
    const args: string[] = [];
    let current = "";
    let inQuotes = false;
    let escapeNext = false;

    for (let i = 0; i < command.length; i++) {
      const char = command[i];

      if (escapeNext) {
        current += char;
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        escapeNext = true;
        continue;
      }

      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
        continue;
      }

      if (char === " " && !inQuotes) {
        if (current) {
          args.push(current);
          current = "";
        }
        continue;
      }

      current += char;
    }

    if (current) {
      args.push(current);
    }

    return args;
  }

  /**
   * Spawn a long-running ADB command as a process
   * @param command - The command to execute
   * @returns The spawned child process
   */
  spawnCommand(command: string): ChildProcess {
    const parts = this.parseCommandArgs(command);
    const baseCommand = this.getBaseCommand().split(" ");

    // If we have a device specified, first parts will be ['adb', '-s', 'deviceId']
    // Otherwise just ['adb']
    const args = [...baseCommand.slice(1), ...parts];

    logger.info(`Spawning command: ${baseCommand[0]} ${args.join(" ")}`);
    return this.spawnFn(baseCommand[0], args);
  }

  /**
   * Get the list of connected devices
   * @returns Promise with an array of device IDs
   */
  async getDevices(): Promise<string[]> {
    logger.info("Getting list of connected devices");
    // Use raw ADB command without device ID since we're listing devices
    const result = await this.execAsync("$ANDROID_HOME/platform-tools/adb devices");
    const lines = result.stdout.split("\n").slice(1); // Skip the first line which is the header

    return lines
      .filter(line => line.trim().length > 0)
      .map(line => {
        const parts = line.split("\t");
        return parts[0];
      });
  }

  /**
   * Check if a specific device is connected
   * @param deviceId - The device ID to check
   * @returns Promise with boolean indicating if device is connected
   */
  async isDeviceConnected(deviceId: string): Promise<boolean> {
    const devices = await this.getDevices();
    return devices.includes(deviceId);
  }

  /**
   * Push a file from local path to remote path on the device
   * @param localPath - The local path of the file to push
   * @param remotePath - The remote path on the device to push the file to
   * @returns Promise with the command output
   */
  async pushFile(localPath: string, remotePath: string): Promise<ExecResult> {
    logger.info(`Pushing file from ${localPath} to ${remotePath}`);
    const command = `push "${localPath}" "${remotePath}"`;
    return this.executeCommand(command);
  }
}
