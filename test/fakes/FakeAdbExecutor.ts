import { AdbExecutor } from "../../src/utils/android-cmdline-tools/interfaces/AdbExecutor";
import { BootedDevice, ExecResult, AndroidUser } from "../../src/models";

/**
 * Fake implementation of AdbExecutor for testing
 * Allows configuring responses for specific commands and asserting command execution
 */
export class FakeAdbExecutor implements AdbExecutor {
  private commandResponses: Map<string, ExecResult> = new Map();
  private commandErrors: Map<string, Error> = new Map();
  private defaultResponse: ExecResult = this.createExecResult("", "");
  private defaultError: Error | null = null;
  private executedCommands: string[] = [];

  // Configurable state
  private screenOn: boolean = true;
  private wakefulness: "Awake" | "Asleep" | "Dozing" | null = "Awake";
  private devices: BootedDevice[] = [];
  private users: AndroidUser[] = [{ userId: 0, name: "Owner", flags: 13, running: true }];
  private foregroundApp: { packageName: string; userId: number } | null = null;
  private deviceTimestampMs: number | null = null;
  private androidApiLevel: number | null = null;

  /**
   * Create a proper ExecResult with all required methods
   */
  private createExecResult(stdout: string, stderr: string): ExecResult {
    return {
      stdout,
      stderr,
      toString: () => stdout,
      trim: () => stdout.trim(),
      includes: (searchString: string) => stdout.includes(searchString)
    };
  }

  /**
   * Ensure ExecResult has all required methods, using provided or default implementations
   */
  private ensureExecResultMethods(response: ExecResult): ExecResult {
    // Use provided methods if they exist, otherwise use default implementations based on stdout
    const stdout = response.stdout;
    const stderr = response.stderr;

    return {
      stdout,
      stderr,
      toString: typeof response.toString === "function" && response.toString !== Object.prototype.toString ? response.toString.bind(response) : () => stdout,
      trim: typeof response.trim === "function" && response.trim !== String.prototype.trim ? response.trim.bind(response) : () => stdout.trim(),
      includes: typeof response.includes === "function" && response.includes !== String.prototype.includes ? response.includes.bind(response) : (searchString: string) => stdout.includes(searchString)
    };
  }

  /**
   * Configure the response for a specific command pattern
   * @param commandPattern - Pattern to match against executed commands (substring match)
   * @param response - Response to return when pattern matches
   */
  setCommandResponse(commandPattern: string, response: ExecResult): void {
    // If response already has the required methods, use it as-is; otherwise enhance it
    const enhancedResponse = this.ensureExecResultMethods(response);
    this.commandResponses.set(commandPattern, enhancedResponse);
  }

  /**
   * Configure screen state and wakefulness
   * @param isOn - Whether screen is on
   * @param wakefulness - Optional wakefulness state (defaults based on isOn)
   */
  setScreenState(isOn: boolean, wakefulness?: "Awake" | "Asleep" | "Dozing"): void {
    this.screenOn = isOn;
    this.wakefulness = wakefulness ?? (isOn ? "Awake" : "Asleep");
  }

  /**
   * Configure available devices
   * @param devices - Array of booted devices
   */
  setDevices(devices: BootedDevice[]): void {
    this.devices = devices;
  }

  /**
   * Configure Android users (for work profile testing)
   * @param users - Array of Android users
   */
  setUsers(users: AndroidUser[]): void {
    this.users = users;
  }

  /**
   * Configure foreground app
   * @param app - Foreground app info or null
   */
  setForegroundApp(app: { packageName: string; userId: number } | null): void {
    this.foregroundApp = app;
  }

  /**
   * Configure device timestamp for tests that rely on device time.
   * @param timestampMs - Timestamp in milliseconds (or null to use real time)
   */
  setDeviceTimestampMs(timestampMs: number | null): void {
    this.deviceTimestampMs = timestampMs;
  }

  /**
   * Configure Android API level for tests that depend on API level branching.
   * @param level - API level (or null to simulate unknown)
   */
  setAndroidApiLevel(level: number | null): void {
    this.androidApiLevel = level;
  }

  async getAndroidApiLevel(): Promise<number | null> {
    return this.androidApiLevel;
  }

  /**
   * Get history of executed commands (for test assertions)
   * @returns Array of command strings that were executed
   */
  getExecutedCommands(): string[] {
    return [...this.executedCommands];
  }

  /**
   * Check if a specific command pattern was executed
   * @param pattern - Pattern to search for in command history
   * @returns true if any executed command contains the pattern
   */
  wasCommandExecuted(pattern: string): boolean {
    return this.executedCommands.some(cmd => cmd.includes(pattern));
  }

  /**
   * Clear command history
   */
  clearHistory(): void {
    this.executedCommands = [];
  }

  /**
   * Set default response for commands without specific responses
   * @param response - Default response
   */
  setDefaultResponse(response: ExecResult): void {
    this.defaultResponse = this.ensureExecResultMethods(response);
  }

  /**
   * Set an error to throw for commands matching a specific pattern
   * @param commandPattern - Pattern to match against executed commands (substring match)
   * @param error - Error to throw when pattern matches
   */
  setCommandError(commandPattern: string, error: Error): void {
    this.commandErrors.set(commandPattern, error);
  }

  /**
   * Set default error to throw for all commands
   * @param error - Error to throw
   */
  setDefaultError(error: Error): void {
    this.defaultError = error;
  }

  // Implementation of AdbExecutor interface

  async executeCommand(
    command: string,
    timeoutMs?: number,
    maxBuffer?: number,
    noRetry?: boolean,
    _signal?: AbortSignal
  ): Promise<ExecResult> {
    this.executedCommands.push(command);

    // Check for per-command errors based on pattern matching
    for (const [pattern, error] of this.commandErrors.entries()) {
      if (command.includes(pattern)) {
        throw error;
      }
    }

    // If a default error is configured, throw it
    if (this.defaultError) {
      throw this.defaultError;
    }

    // Check for configured responses based on pattern matching
    for (const [pattern, response] of this.commandResponses.entries()) {
      if (command.includes(pattern)) {
        return response;
      }
    }

    // Return default response
    return this.defaultResponse;
  }

  async getBootedAndroidDevices(): Promise<BootedDevice[]> {
    return this.devices;
  }

  async isScreenOn(): Promise<boolean> {
    return this.screenOn;
  }

  async getWakefulness(): Promise<"Awake" | "Asleep" | "Dozing" | null> {
    return this.wakefulness;
  }

  async listUsers(): Promise<AndroidUser[]> {
    return this.users;
  }

  async getForegroundApp(): Promise<{ packageName: string; userId: number } | null> {
    return this.foregroundApp;
  }

  async getDeviceTimestampMs(): Promise<number> {
    return this.deviceTimestampMs ?? Date.now();
  }
}
