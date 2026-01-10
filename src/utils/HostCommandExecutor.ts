import { execFile } from "child_process";
import { promisify } from "util";
import type { ExecResult } from "../models";

export interface HostCommandOptions {
  timeoutMs?: number;
  maxBuffer?: number;
  cwd?: string;
}

export interface HostCommandExecutor {
  executeCommand(
    file: string,
    args?: string[],
    options?: HostCommandOptions
  ): Promise<ExecResult>;
}

type ExecFileAsync = (
  file: string,
  args: string[],
  options?: {
    timeout?: number;
    maxBuffer?: number;
    cwd?: string;
  }
) => Promise<{ stdout: string | Buffer; stderr: string | Buffer }>;

const execFileAsync: ExecFileAsync = async (
  file: string,
  args: string[],
  options?: {
    timeout?: number;
    maxBuffer?: number;
    cwd?: string;
  }
): Promise<{ stdout: string | Buffer; stderr: string | Buffer }> => {
  return promisify(execFile)(file, args, options);
};

export class DefaultHostCommandExecutor implements HostCommandExecutor {
  private execAsync: ExecFileAsync;

  constructor(execAsyncFn: ExecFileAsync = execFileAsync) {
    this.execAsync = execAsyncFn;
  }

  async executeCommand(
    file: string,
    args: string[] = [],
    options: HostCommandOptions = {}
  ): Promise<ExecResult> {
    const execOptions = {
      timeout: options.timeoutMs,
      maxBuffer: options.maxBuffer,
      cwd: options.cwd
    };

    const result = await this.execAsync(file, args, execOptions);

    const stdout = typeof result.stdout === "string" ? result.stdout : result.stdout.toString();
    const stderr = typeof result.stderr === "string" ? result.stderr : result.stderr.toString();

    return {
      stdout,
      stderr,
      toString() { return stdout; },
      trim() { return stdout.trim(); },
      includes(searchString: string) { return stdout.includes(searchString); }
    };
  }
}
