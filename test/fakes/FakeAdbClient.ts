/**
 * Fake implementation of AdbClient for testing
 * Captures commands executed without actually running ADB
 */
export class FakeAdbClient {
  private commandCalls: Array<{
    command: string;
    timeoutMs?: number;
    maxBuffer?: number;
    noRetry?: boolean;
    signal?: AbortSignal;
  }> = [];
  private commandResults: Map<string, { stdout: string; stderr: string }> = new Map();
  private commandErrors: Map<string, Error> = new Map();
  private foregroundApp: { packageName: string; userId: number } | null = null;
  private users: Array<{ userId: number; name: string; flags?: number; running?: boolean }> = [];

  /**
   * Record a command execution
   */
  async executeCommand(
    command: string,
    timeoutMs?: number,
    maxBuffer?: number,
    noRetry?: boolean,
    signal?: AbortSignal
  ): Promise<{ stdout: string; stderr: string; toString: () => string; trim: () => string; includes: (search: string) => boolean }> {
    this.commandCalls.push({ command, timeoutMs, maxBuffer, noRetry, signal });

    const error = this.commandErrors.get(command);
    if (error) {
      throw error;
    }

    // Return configured result or default success
    const result = this.commandResults.get(command) || { stdout: "", stderr: "" };
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      toString: () => result.stdout,
      trim: () => result.stdout.trim(),
      includes: (search: string) => result.stdout.includes(search)
    };
  }

  /**
   * Configure the result for a specific command
   */
  setCommandResult(command: string, stdout: string, stderr: string = ""): void {
    this.commandResults.set(command, { stdout, stderr });
  }

  /**
   * Configure a command to throw an error
   */
  setCommandError(command: string, error: Error): void {
    this.commandErrors.set(command, error);
  }

  /**
   * Configure the current foreground app
   */
  setForegroundApp(app: { packageName: string; userId: number } | null): void {
    this.foregroundApp = app;
  }

  /**
   * Configure the list of users
   */
  setUsers(users: Array<{ userId: number; name: string; flags?: number; running?: boolean }>): void {
    this.users = [...users];
  }

  /**
   * Return the current foreground app
   */
  async getForegroundApp(): Promise<{ packageName: string; userId: number } | null> {
    return this.foregroundApp;
  }

  /**
   * Return the list of users
   */
  async listUsers(): Promise<Array<{ userId: number; name: string; flags?: number; running?: boolean }>> {
    return [...this.users];
  }

  /**
   * Get all recorded command calls
   */
  getCommandCalls(): Array<{
    command: string;
    timeoutMs?: number;
    maxBuffer?: number;
    noRetry?: boolean;
    signal?: AbortSignal;
  }> {
    return [...this.commandCalls];
  }

  /**
   * Get the last command call details
   */
  getLastCommandCall(): {
    command: string;
    timeoutMs?: number;
    maxBuffer?: number;
    noRetry?: boolean;
    signal?: AbortSignal;
  } | undefined {
    return this.commandCalls[this.commandCalls.length - 1];
  }

  /**
   * Get the last command executed
   */
  getLastCommand(): string {
    return this.commandCalls[this.commandCalls.length - 1]?.command || "";
  }

  /**
   * Get all commands executed
   */
  getAllCommands(): string[] {
    return this.commandCalls.map(call => call.command);
  }

  /**
   * Clear recorded commands
   */
  clearCommands(): void {
    this.commandCalls = [];
  }

  /**
   * Reset fake state
   */
  reset(): void {
    this.commandCalls = [];
    this.commandResults.clear();
    this.commandErrors.clear();
  }

  /**
   * Check if a command was executed
   */
  wasCommandExecuted(commandPattern: string | RegExp): boolean {
    if (typeof commandPattern === "string") {
      return this.commandCalls.some(call => call.command.includes(commandPattern));
    }
    return this.commandCalls.some(call => commandPattern.test(call.command));
  }

  /**
   * Get count of commands matching a pattern
   */
  getCommandCount(commandPattern: string | RegExp): number {
    if (typeof commandPattern === "string") {
      return this.commandCalls.filter(call => call.command.includes(commandPattern)).length;
    }
    return this.commandCalls.filter(call => commandPattern.test(call.command)).length;
  }
}
