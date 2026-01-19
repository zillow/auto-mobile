import type { ExecResult } from "../models";

export function createExecResult(stdout: string, stderr: string): ExecResult {
  return {
    stdout,
    stderr,
    toString() {
      return this.stdout;
    },
    trim() {
      return this.stdout.trim();
    },
    includes(searchString: string) {
      return this.stdout.includes(searchString);
    }
  };
}
