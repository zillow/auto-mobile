import type { ChildProcess, SpawnOptions } from "child_process";
import type { ExecResult } from "../../src/models";
import type { ProcessExecOptions, ProcessExecutor } from "../../src/utils/ProcessExecutor";
import { FakeChildProcess } from "./FakeChildProcess";

/**
 * Fake ProcessExecutor for testing command execution and process spawning.
 */
export class FakeProcessExecutor implements ProcessExecutor {
  private commandResponses: Map<string, ExecResult> = new Map();
  private defaultResponse: ExecResult = this.createExecResult("", "");
  private executedCommands: string[] = [];
  private spawnResponses: Array<{ command: string; args: string[]; options?: SpawnOptions; process: ChildProcess }> = [];
  private nextSpawnProcess: ChildProcess | null = null;

  setCommandResponse(commandPattern: string, response: ExecResult): void {
    this.commandResponses.set(commandPattern, this.ensureExecResultMethods(response));
  }

  setDefaultResponse(response: ExecResult): void {
    this.defaultResponse = this.ensureExecResultMethods(response);
  }

  getExecutedCommands(): string[] {
    return [...this.executedCommands];
  }

  wasCommandExecuted(pattern: string): boolean {
    return this.executedCommands.some(command => command.includes(pattern));
  }

  setNextSpawnProcess(process: ChildProcess): void {
    this.nextSpawnProcess = process;
  }

  getSpawnedProcesses(): Array<{ command: string; args: string[]; options?: SpawnOptions; process: ChildProcess }> {
    return [...this.spawnResponses];
  }

  async exec(command: string, _options?: ProcessExecOptions): Promise<ExecResult> {
    this.executedCommands.push(command);
    for (const [pattern, response] of this.commandResponses.entries()) {
      if (command.includes(pattern)) {
        return response;
      }
    }
    return this.defaultResponse;
  }

  spawn(command: string, args: string[], options?: SpawnOptions): ChildProcess {
    const process = this.nextSpawnProcess ?? new FakeChildProcess();
    this.nextSpawnProcess = null;
    this.spawnResponses.push({ command, args, options, process });
    return process;
  }

  private createExecResult(stdout: string, stderr: string): ExecResult {
    return {
      stdout,
      stderr,
      toString: () => stdout,
      trim: () => stdout.trim(),
      includes: (searchString: string) => stdout.includes(searchString)
    };
  }

  private ensureExecResultMethods(response: ExecResult): ExecResult {
    const stdout = response.stdout ?? "";
    const stderr = response.stderr ?? "";

    return {
      stdout,
      stderr,
      toString: typeof response.toString === "function" ? response.toString.bind(response) : () => stdout,
      trim: typeof response.trim === "function" ? response.trim.bind(response) : () => stdout.trim(),
      includes: typeof response.includes === "function" ? response.includes.bind(response) : (searchString: string) => stdout.includes(searchString)
    };
  }
}
