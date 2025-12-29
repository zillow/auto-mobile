import { existsSync } from "fs";
import { homedir, platform } from "os";
import { exec } from "child_process";
import { promisify } from "util";

/**
 * Interface for system detection operations
 * Provides methods for detecting platform, environment, and file system information
 */
export interface SystemDetection {
  /**
   * Get the current platform
   */
  getCurrentPlatform(): string;

  /**
   * Get the home directory
   */
  getHomeDir(): string;

  /**
   * Get an environment variable value
   */
  getEnvVar(name: string): string | undefined;

  /**
   * Check if a file exists synchronously
   */
  fileExistsSync(path: string): boolean;

  /**
   * Check if a file exists asynchronously
   */
  fileExists(path: string): Promise<boolean>;

  /**
   * Execute a command and get the result
   */
  exec(command: string): Promise<{ stdout: string; stderr: string }>;
}

/**
 * Default system detection implementation using Node.js built-ins
 */
export class DefaultSystemDetection implements SystemDetection {
  getCurrentPlatform(): string {
    return platform();
  }

  getHomeDir(): string {
    return homedir();
  }

  getEnvVar(name: string): string | undefined {
    return process.env[name];
  }

  fileExistsSync(path: string): boolean {
    return existsSync(path);
  }

  async fileExists(path: string): Promise<boolean> {
    return existsSync(path);
  }

  async exec(command: string): Promise<{ stdout: string; stderr: string }> {
    const execAsync = promisify(exec);
    return execAsync(command) as Promise<{ stdout: string; stderr: string }>;
  }
}
