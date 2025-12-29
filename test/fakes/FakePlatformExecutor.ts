import { BootedDevice, ExecResult } from "../../src/models";
import {
  PlatformExecutor,
  ExecutorOptions,
  SpawnOptions,
} from "../../src/utils/interfaces/PlatformExecutor";
import { ChildProcess } from "child_process";
import { EventEmitter } from "events";

/**
 * Fake implementation of PlatformExecutor for testing
 * Allows configuring responses for specific commands and asserting command execution
 * Simulates process spawning with mock ChildProcess instances
 */
export class FakePlatformExecutor implements PlatformExecutor {
  private commandResponses: Map<string, ExecResult> = new Map();
  private processResponses: Map<string, ChildProcess> = new Map();
  private defaultResponse: ExecResult = this.createDefaultResponse();
  private executedCommands: string[] = [];
  private spawnedProcesses: Array<{
    command: string;
    args: string[];
    process: ChildProcess;
  }> = [];
  private device: BootedDevice | null = null;
  private available: boolean = true;

  /**
   * Create a default ExecResult with all required methods
   */
  private createDefaultResponse(): ExecResult {
    return {
      stdout: "",
      stderr: "",
      toString: () => "",
      trim: () => "",
      includes: () => false,
    };
  }

  /**
   * Configure the response for a specific command pattern
   * @param commandPattern - Pattern to match against executed commands (substring match)
   * @param response - Response to return when pattern matches
   */
  setCommandResponse(commandPattern: string, response: ExecResult): void {
    this.commandResponses.set(commandPattern, response);
  }

  /**
   * Configure the response for a spawned process
   * @param commandPattern - Pattern to match against spawned command/args
   * @param childProcess - Mock ChildProcess to return when pattern matches
   */
  setProcessResponse(commandPattern: string, childProcess: ChildProcess): void {
    this.processResponses.set(commandPattern, childProcess);
  }

  /**
   * Set default response for commands without specific responses
   * @param response - Default response
   */
  setDefaultResponse(response: ExecResult): void {
    this.defaultResponse = response;
  }

  /**
   * Set whether this executor is available
   * @param available - Whether the executor should report as available
   */
  setAvailable(available: boolean): void {
    this.available = available;
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
   * Get history of spawned processes
   * @returns Array of spawned process information
   */
  getSpawnedProcesses(): Array<{
    command: string;
    args: string[];
    process: ChildProcess;
  }> {
    return [...this.spawnedProcesses];
  }

  /**
   * Clear command and process history
   */
  clearHistory(): void {
    this.executedCommands = [];
    this.spawnedProcesses = [];
  }

  // Implementation of PlatformExecutor interface

  async executeCommand(
    command: string,
    timeoutMs?: number,
    options?: ExecutorOptions
  ): Promise<ExecResult> {
    this.executedCommands.push(command);

    // Check for configured responses based on pattern matching
    let foundResponse: ExecResult | undefined;
    this.commandResponses.forEach((response, pattern) => {
      if (!foundResponse && command.includes(pattern)) {
        foundResponse = response;
      }
    });

    if (foundResponse) {
      return foundResponse;
    }

    // Return default response
    return this.defaultResponse;
  }

  async spawnProcess(
    command: string,
    args: string[],
    options?: SpawnOptions
  ): Promise<ChildProcess> {
    const commandString = `${command} ${args.join(" ")}`;

    // Check for configured responses based on pattern matching
    let foundProcess: ChildProcess | undefined;
    this.processResponses.forEach((process, pattern) => {
      if (!foundProcess && commandString.includes(pattern)) {
        foundProcess = process;
      }
    });

    if (foundProcess) {
      this.spawnedProcesses.push({ command, args, process: foundProcess });
      return foundProcess;
    }

    // Generate a mock ChildProcess if not configured
    const mockProcess = this.createMockChildProcess();
    this.spawnedProcesses.push({ command, args, process: mockProcess });
    return mockProcess;
  }

  setDevice(device: BootedDevice | null): void {
    this.device = device;
  }

  getDevice(): BootedDevice | null {
    return this.device;
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  /**
   * Create a mock ChildProcess for testing
   * Provides all necessary event emitter functionality and properties
   * @returns A mock ChildProcess instance
   */
  private createMockChildProcess(): ChildProcess {
    const eventEmitter = new EventEmitter();

    // Create a mock object with proper properties
    const mockProcess = {
      ...eventEmitter,
      pid: Math.floor(Math.random() * 10000) + 1000,
      killed: false,
      stdin: null,
      stdout: null,
      stderr: null,
      stdio: [null, null, null, null] as any,
      connected: true,
      kill: function(signal?: string | number): boolean {
        (this as any).killed = true;
        return true;
      },
      disconnect: function(): void {
        (this as any).connected = false;
      },
      send: function(
        message: any,
        sendHandle?: any,
        options?: any,
        callback?: any
      ): boolean {
        if (typeof sendHandle === "function") {
          sendHandle();
        } else if (typeof options === "function") {
          options();
        } else if (typeof callback === "function") {
          callback();
        }
        return true;
      },
      ref: function(): ChildProcess {
        return this as any;
      },
      unref: function(): ChildProcess {
        return this as any;
      },
      once: (eventEmitter as any).once.bind(eventEmitter),
      on: (eventEmitter as any).on.bind(eventEmitter),
      off: (eventEmitter as any).off.bind(eventEmitter),
      removeListener: (eventEmitter as any).removeListener.bind(eventEmitter),
      removeAllListeners: (eventEmitter as any).removeAllListeners.bind(
        eventEmitter
      ),
      listeners: (eventEmitter as any).listeners.bind(eventEmitter),
      addListener: (eventEmitter as any).addListener.bind(eventEmitter),
      emit: (eventEmitter as any).emit.bind(eventEmitter),
      listenerCount: (eventEmitter as any).listenerCount.bind(eventEmitter),
      prependListener: (eventEmitter as any).prependListener.bind(eventEmitter),
      prependOnceListener: (eventEmitter as any).prependOnceListener.bind(
        eventEmitter
      ),
    } as any;

    return mockProcess as ChildProcess;
  }
}
