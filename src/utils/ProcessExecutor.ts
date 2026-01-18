import { exec, spawn, type ChildProcess, type SpawnOptions } from "child_process";
import { promisify } from "util";
import type { ExecResult } from "../models";

export interface ProcessExecOptions {
  timeoutMs?: number;
  maxBuffer?: number;
  cwd?: string;
}

export interface ProcessExecutor {
  exec(command: string, options?: ProcessExecOptions): Promise<ExecResult>;
  spawn(command: string, args: string[], options?: SpawnOptions): ChildProcess;
}

type ExecAsync = (
  command: string,
  options?: {
    timeout?: number;
    maxBuffer?: number;
    cwd?: string;
  }
) => Promise<{ stdout: string | Buffer; stderr: string | Buffer }>;

const execAsync: ExecAsync = promisify(exec);

const createExecResult = (stdout: string | Buffer, stderr: string | Buffer): ExecResult => {
  const stdoutText = typeof stdout === "string" ? stdout : stdout.toString();
  const stderrText = typeof stderr === "string" ? stderr : stderr.toString();
  return {
    stdout: stdoutText,
    stderr: stderrText,
    toString() { return stdoutText; },
    trim() { return stdoutText.trim(); },
    includes(searchString: string) { return stdoutText.includes(searchString); }
  };
};

export class DefaultProcessExecutor implements ProcessExecutor {
  async exec(command: string, options: ProcessExecOptions = {}): Promise<ExecResult> {
    const { stdout, stderr } = await execAsync(command, {
      timeout: options.timeoutMs,
      maxBuffer: options.maxBuffer,
      cwd: options.cwd
    });
    return createExecResult(stdout, stderr);
  }

  spawn(command: string, args: string[], options?: SpawnOptions): ChildProcess {
    return spawn(command, args, options);
  }
}
