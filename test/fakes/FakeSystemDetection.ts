/**
 * Fake system detection implementation for testing
 * Allows full control over platform, environment, and file system behavior
 */
import { SystemDetection } from "../../src/utils/system/SystemDetection";

export class FakeSystemDetection implements SystemDetection {
  private currentPlatform: string = "linux";
  private currentHomeDir: string = "/home/testuser";
  private envVars: Map<string, string> = new Map();
  private existingFiles: Set<string> = new Set();
  private execResponses: Map<string, { stdout: string; stderr: string }> = new Map();
  private execErrors: Map<string, Error> = new Map();

  private normalizePath(value: string): string {
    return value.replace(/\\/g, "/");
  }

  /**
   * Set the platform to return
   */
  setPlatform(platform: string): void {
    this.currentPlatform = platform;
  }

  /**
   * Set the home directory to return
   */
  setHomeDir(homeDir: string): void {
    this.currentHomeDir = homeDir;
  }

  /**
   * Set an environment variable
   */
  setEnvVar(name: string, value: string): void {
    this.envVars.set(name, value);
  }

  /**
   * Remove an environment variable
   */
  removeEnvVar(name: string): void {
    this.envVars.delete(name);
  }

  /**
   * Clear all environment variables
   */
  clearEnvVars(): void {
    this.envVars.clear();
  }

  /**
   * Mark a file as existing
   */
  addExistingFile(path: string): void {
    this.existingFiles.add(this.normalizePath(path));
  }

  /**
   * Mark a file as not existing
   */
  removeExistingFile(path: string): void {
    this.existingFiles.delete(this.normalizePath(path));
  }

  /**
   * Clear all existing files
   */
  clearExistingFiles(): void {
    this.existingFiles.clear();
  }

  /**
   * Set the response for a command
   */
  setExecResponse(command: string, stdout: string, stderr: string = ""): void {
    this.execResponses.set(command, { stdout, stderr });
    this.execErrors.delete(command);
  }

  /**
   * Set an error to be thrown for a command
   */
  setExecError(command: string, error: Error): void {
    this.execErrors.set(command, error);
    this.execResponses.delete(command);
  }

  /**
   * Clear all exec responses and errors
   */
  clearExecResponses(): void {
    this.execResponses.clear();
    this.execErrors.clear();
  }

  /**
   * Reset to initial state
   */
  reset(): void {
    this.currentPlatform = "linux";
    this.currentHomeDir = "/home/testuser";
    this.clearEnvVars();
    this.clearExistingFiles();
    this.clearExecResponses();
  }

  // SystemDetection implementation

  getCurrentPlatform(): string {
    return this.currentPlatform;
  }

  getHomeDir(): string {
    return this.currentHomeDir;
  }

  getEnvVar(name: string): string | undefined {
    return this.envVars.get(name);
  }

  fileExistsSync(path: string): boolean {
    return this.existingFiles.has(this.normalizePath(path));
  }

  async fileExists(path: string): Promise<boolean> {
    return this.existingFiles.has(this.normalizePath(path));
  }

  async exec(command: string): Promise<{ stdout: string; stderr: string }> {
    const error = this.execErrors.get(command);
    if (error) {
      throw error;
    }

    const response = this.execResponses.get(command);
    if (response) {
      return response;
    }

    // Default: command not found
    throw new Error(`Command not found: ${command}`);
  }
}
