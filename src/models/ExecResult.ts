/**
 * Result of executing a command
 */
export interface ExecResult {
  stdout: string;
  stderr: string;
  toString(): string;
  trim(): string;
  includes(searchString: string): boolean;
  error?: string;
}
