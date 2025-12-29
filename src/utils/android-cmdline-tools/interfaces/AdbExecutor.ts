import { BootedDevice, ExecResult } from "../../../models";

/**
 * Interface for executing ADB commands
 * Enables dependency injection and testing with fakes
 */
export interface AdbExecutor {
  /**
   * Execute an ADB command
   * @param command - The ADB command to execute (without "adb -s <device>" prefix)
   * @param timeoutMs - Optional timeout in milliseconds
   * @param maxBuffer - Optional maximum buffer size for command output
   * @param noRetry - Optional flag to disable retry logic
   * @returns Promise with command output
   */
  executeCommand(
    command: string,
    timeoutMs?: number,
    maxBuffer?: number,
    noRetry?: boolean
  ): Promise<ExecResult>;

  /**
   * Get the list of booted Android devices
   * @returns Promise with array of booted devices
   */
  getBootedAndroidDevices(): Promise<BootedDevice[]>;

  /**
   * Check if the device screen is currently on
   * @returns Promise<boolean> - true if screen is on (Awake), false otherwise
   */
  isScreenOn(): Promise<boolean>;

  /**
   * Get the device wakefulness state
   * @returns Promise with wakefulness state: "Awake", "Asleep", "Dozing", or null if unknown
   */
  getWakefulness(): Promise<"Awake" | "Asleep" | "Dozing" | null>;
}
