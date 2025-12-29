import { BootedDevice, ExecResult } from "../../models";
import { ChildProcess } from "child_process";

/**
 * Options for command execution
 */
export interface ExecutorOptions {
  /** Maximum buffer size for output streams */
  maxBuffer?: number;

  /** Timeout in milliseconds for command execution */
  timeoutMs?: number;

  /** Disable retry logic for failed commands */
  noRetry?: boolean;

  /** Working directory for command execution */
  cwd?: string;

  /** Input data to send to the process stdin */
  input?: string | Buffer;
}

/**
 * Options for spawning a process
 */
export interface SpawnOptions extends ExecutorOptions {
  /** stdio configuration for the spawned process */
  stdio?: string | (string | NodeJS.WriteStream | NodeJS.ReadStream)[];
}

/**
 * Interface for executing platform-specific commands and managing device interaction
 * Enables dependency injection and testing with fakes
 */
export interface PlatformExecutor {
  /**
   * Execute a command and return the result synchronously
   * @param command - The command to execute (e.g., "adb shell getprop ro.build.version.release")
   * @param timeoutMs - Optional timeout in milliseconds
   * @param options - Optional execution options (maxBuffer, cwd, input, etc.)
   * @returns Promise with command output
   * @throws Error if command times out or fails
   *
   * @example
   * const result = await executor.executeCommand("adb shell getprop ro.build.version.release", 5000);
   * console.log(result.stdout); // e.g., "11"
   */
  executeCommand(
    command: string,
    timeoutMs?: number,
    options?: ExecutorOptions
  ): Promise<ExecResult>;

  /**
   * Spawn a process without waiting for completion
   * Useful for long-running processes or when you need full control over the ChildProcess
   * @param command - The command to execute (e.g., "adb")
   * @param args - Array of arguments to pass to the command
   * @param options - Optional spawn options (stdio, cwd, input, etc.)
   * @returns Promise with the spawned ChildProcess for direct interaction
   * @throws Error if process cannot be spawned
   *
   * @example
   * const process = await executor.spawnProcess("adb", ["logcat"], { stdio: "pipe" });
   * process.stdout.on("data", (data) => console.log(data.toString()));
   */
  spawnProcess(
    command: string,
    args: string[],
    options?: SpawnOptions
  ): Promise<ChildProcess>;

  /**
   * Set the device for this executor to operate on
   * @param device - The BootedDevice to set, or null to clear the device
   *
   * @example
   * executor.setDevice({ name: "Android Device", platform: "android", deviceId: "emulator-5554" });
   */
  setDevice(device: BootedDevice | null): void;

  /**
   * Get the currently set device
   * @returns The currently set BootedDevice or null if no device is set
   *
   * @example
   * const device = executor.getDevice();
   * if (device) {
   *   console.log(`Device: ${device.deviceId}`);
   * }
   */
  getDevice(): BootedDevice | null;

  /**
   * Check if this executor is available and functional
   * @returns Promise<boolean> - true if the executor can execute commands, false otherwise
   *
   * @example
   * const available = await executor.isAvailable();
   * if (!available) {
   *   console.log("Platform tools not installed or not in PATH");
   * }
   */
  isAvailable(): Promise<boolean>;
}
