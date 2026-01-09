/**
 * Fake implementation of AdbClient for testing
 * Captures commands executed without actually running ADB
 */
export class FakeAdbClient {
  private commands: string[] = [];
  private commandResults: Map<string, { stdout: string; stderr: string }> = new Map();

  /**
   * Record a command execution
   */
  async executeCommand(
    command: string,
    _options?: any,
    _timeout?: number,
    _encoding?: string,
    _signal?: AbortSignal
  ): Promise<{ stdout: string; stderr: string }> {
    this.commands.push(command);

    // Return configured result or default success
    const result = this.commandResults.get(command) || { stdout: "", stderr: "" };
    return result;
  }

  /**
   * Configure the result for a specific command
   */
  setCommandResult(command: string, stdout: string, stderr: string = ""): void {
    this.commandResults.set(command, { stdout, stderr });
  }

  /**
   * Get the last command executed
   */
  getLastCommand(): string {
    return this.commands[this.commands.length - 1] || "";
  }

  /**
   * Get all commands executed
   */
  getAllCommands(): string[] {
    return [...this.commands];
  }

  /**
   * Clear recorded commands
   */
  clearCommands(): void {
    this.commands = [];
  }

  /**
   * Reset fake state
   */
  reset(): void {
    this.commands = [];
    this.commandResults.clear();
  }

  /**
   * Check if a command was executed
   */
  wasCommandExecuted(commandPattern: string | RegExp): boolean {
    if (typeof commandPattern === "string") {
      return this.commands.some(cmd => cmd.includes(commandPattern));
    }
    return this.commands.some(cmd => commandPattern.test(cmd));
  }

  /**
   * Get count of commands matching a pattern
   */
  getCommandCount(commandPattern: string | RegExp): number {
    if (typeof commandPattern === "string") {
      return this.commands.filter(cmd => cmd.includes(commandPattern)).length;
    }
    return this.commands.filter(cmd => commandPattern.test(cmd)).length;
  }
}
