/**
 * Fake implementation of FileSystem for testing
 * Stores files in memory instead of interacting with the real file system
 */
import { FileSystem } from "../../src/utils/filesystem/DefaultFileSystem";

export class FakeFileSystem implements FileSystem {
  private files: Map<string, string> = new Map();
  private directories: Set<string> = new Set();
  private existsSync_shouldExist: Map<string, boolean> = new Map();

  /**
   * Set up a file to be read
   * @param filePath - Path to the file
   * @param content - Content of the file
   */
  setFile(filePath: string, content: string): void {
    this.files.set(filePath, content);
  }

  /**
   * Set up a directory to exist
   * @param dirPath - Path to the directory
   */
  setDirectory(dirPath: string): void {
    this.directories.add(dirPath);
  }

  /**
   * Configure whether a path exists (for existsSync)
   * @param filePath - Path to configure
   * @param exists - Whether it should exist
   */
  setExists(filePath: string, exists: boolean): void {
    this.existsSync_shouldExist.set(filePath, exists);
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
    const content = this.files.get(filePath);
    if (content === undefined) {
      throw new Error(`File not found: ${filePath}`);
    }
    return content;
  }

  async readdir(dirPath: string): Promise<string[]> {
    // Return files that are under this directory
    const files: string[] = [];
    this.files.forEach((_, filePath) => {
      if (filePath.startsWith(dirPath)) {
        const relativePath = filePath.substring(dirPath.length + 1).split("/")[0];
        if (relativePath && !files.includes(relativePath)) {
          files.push(relativePath);
        }
      }
    });
    return files;
  }

  existsSync(filePath: string): boolean {
    // Check if explicitly configured
    if (this.existsSync_shouldExist.has(filePath)) {
      return this.existsSync_shouldExist.get(filePath) ?? false;
    }

    // Otherwise, check if file or directory exists
    return this.files.has(filePath) || this.directories.has(filePath);
  }

  async writeFile(filePath: string, content: string, encoding: string = "utf8"): Promise<void> {
    this.files.set(filePath, content);
  }

  async ensureDir(dirPath: string): Promise<void> {
    this.directories.add(dirPath);
  }
}
