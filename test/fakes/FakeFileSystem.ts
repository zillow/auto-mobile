/**
 * Fake implementation of FileSystem for testing
 * Stores files in memory instead of interacting with the real file system
 */
import { FileSystem } from "../../src/utils/filesystem/DefaultFileSystem";

export class FakeFileSystem implements FileSystem {
  private files: Map<string, string> = new Map();
  private directories: Set<string> = new Set();
  private existsSync_shouldExist: Map<string, boolean> = new Map();

  private normalizePath(value: string): string {
    return value.replace(/\\/g, "/");
  }

  /**
   * Set up a file to be read
   * @param filePath - Path to the file
   * @param content - Content of the file
   */
  setFile(filePath: string, content: string): void {
    this.files.set(this.normalizePath(filePath), content);
  }

  /**
   * Set up a directory to exist
   * @param dirPath - Path to the directory
   */
  setDirectory(dirPath: string): void {
    this.directories.add(this.normalizePath(dirPath));
  }

  /**
   * Configure whether a path exists (for existsSync)
   * @param filePath - Path to configure
   * @param exists - Whether it should exist
   */
  setExists(filePath: string, exists: boolean): void {
    this.existsSync_shouldExist.set(this.normalizePath(filePath), exists);
  }

  /**
   * Get history of written files
   * @returns Map of written files
   */
  getWrittenFiles(): Map<string, string> {
    return new Map(this.files);
  }

  /**
   * Get history of created directories
   * @returns Set of created directories
   */
  getCreatedDirectories(): Set<string> {
    return new Set(this.directories);
  }

  /**
   * Clear all stored state
   */
  clear(): void {
    this.files.clear();
    this.directories.clear();
    this.existsSync_shouldExist.clear();
  }

  // Implementation of FileSystem interface

  async readFile(filePath: string, encoding: string = "utf8"): Promise<string> {
    const normalizedPath = this.normalizePath(filePath);
    const content = this.files.get(normalizedPath);
    if (content === undefined) {
      throw new Error(`File not found: ${normalizedPath}`);
    }
    return content;
  }

  async readdir(dirPath: string): Promise<string[]> {
    // Return files that are under this directory
    const normalizedDirPath = this.normalizePath(dirPath);
    const files: string[] = [];
    this.files.forEach((_, filePath) => {
      if (filePath.startsWith(normalizedDirPath)) {
        const relativePath = filePath.substring(normalizedDirPath.length + 1).split("/")[0];
        if (relativePath && !files.includes(relativePath)) {
          files.push(relativePath);
        }
      }
    });
    return files;
  }

  existsSync(filePath: string): boolean {
    const normalizedPath = this.normalizePath(filePath);
    // Check if explicitly configured
    if (this.existsSync_shouldExist.has(normalizedPath)) {
      return this.existsSync_shouldExist.get(normalizedPath) ?? false;
    }

    // Otherwise, check if file or directory exists
    return this.files.has(normalizedPath) || this.directories.has(normalizedPath);
  }

  async writeFile(filePath: string, content: string, encoding: string = "utf8"): Promise<void> {
    this.files.set(this.normalizePath(filePath), content);
  }

  async ensureDir(dirPath: string): Promise<void> {
    this.directories.add(this.normalizePath(dirPath));
  }
}
