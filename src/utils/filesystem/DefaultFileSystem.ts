import fs from "fs";
import fsExtra from "fs-extra";
import { readFileAsync, readdirAsync } from "../io";

/**
 * Interface for file system operations
 */
export interface FileSystem {
  /**
   * Read file contents asynchronously as a string
   * @param filePath - Path to the file to read
   * @param encoding - File encoding (default: "utf8")
   * @returns Promise resolving to file contents
   */
  readFile(filePath: string, encoding?: string): Promise<string>;

  /**
   * Read file contents asynchronously as a Buffer
   * @param filePath - Path to the file to read
   * @returns Promise resolving to file contents as Buffer
   */
  readFileBuffer(filePath: string): Promise<Buffer>;

  /**
   * Read directory contents asynchronously
   * @param dirPath - Path to the directory to read
   * @returns Promise resolving to array of file names
   */
  readdir(dirPath: string): Promise<string[]>;

  /**
   * Check if a file or directory exists synchronously
   * @param filePath - Path to check
   * @returns true if the file/directory exists
   */
  existsSync(filePath: string): boolean;

  /**
   * Check if a file or directory exists asynchronously
   * @param filePath - Path to check
   * @returns Promise resolving to true if the file/directory exists
   */
  pathExists(filePath: string): Promise<boolean>;

  /**
   * Get file stats
   * @param filePath - Path to the file
   * @returns Promise resolving to file stats
   */
  stat(filePath: string): Promise<{ size: number; mtimeMs: number }>;

  /**
   * Write string content to a file asynchronously
   * @param filePath - Path to the file to write
   * @param content - Content to write
   * @param encoding - File encoding (default: "utf8")
   * @returns Promise that resolves when write is complete
   */
  writeFile(filePath: string, content: string, encoding?: string): Promise<void>;

  /**
   * Write binary content to a file asynchronously
   * @param filePath - Path to the file to write
   * @param data - Buffer to write
   * @returns Promise that resolves when write is complete
   */
  writeFileBuffer(filePath: string, data: Buffer): Promise<void>;

  /**
   * Ensure a directory exists, creating it if necessary
   * @param dirPath - Path to the directory
   * @returns Promise that resolves when directory is ensured
   */
  ensureDir(dirPath: string): Promise<void>;

  /**
   * Delete a file
   * @param filePath - Path to the file to delete
   * @returns Promise that resolves when the file is deleted
   */
  unlink(filePath: string): Promise<void>;

  /**
   * Remove a file or directory recursively
   * @param filePath - Path to remove
   * @returns Promise that resolves when removed
   */
  remove(filePath: string): Promise<void>;

  /**
   * Rename/move a file or directory
   * @param oldPath - Current path
   * @param newPath - New path
   * @returns Promise that resolves when renamed
   */
  rename(oldPath: string, newPath: string): Promise<void>;
}

/**
 * Default file system implementation
 */
export class DefaultFileSystem implements FileSystem {
  async readFile(filePath: string, encoding: string = "utf8"): Promise<string> {
    const result = await readFileAsync(filePath, { encoding } as any);
    return typeof result === "string" ? result : result.toString(encoding as any);
  }

  async readFileBuffer(filePath: string): Promise<Buffer> {
    return fsExtra.readFile(filePath);
  }

  async readdir(dirPath: string): Promise<string[]> {
    return readdirAsync(dirPath);
  }

  existsSync(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  async pathExists(filePath: string): Promise<boolean> {
    return fsExtra.pathExists(filePath);
  }

  async stat(filePath: string): Promise<{ size: number; mtimeMs: number }> {
    const stats = await fsExtra.stat(filePath);
    return { size: stats.size, mtimeMs: stats.mtimeMs };
  }

  async writeFile(filePath: string, content: string, encoding: string = "utf8"): Promise<void> {
    return new Promise((resolve, reject) => {
      fsExtra.writeFile(filePath, content, { encoding } as any, err => {
        if (err) {reject(err);} else {resolve();}
      });
    });
  }

  async writeFileBuffer(filePath: string, data: Buffer): Promise<void> {
    await fs.promises.writeFile(filePath, data, { mode: 0o600 });
  }

  async ensureDir(dirPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      fsExtra.ensureDir(dirPath, err => {
        if (err) {reject(err);} else {resolve();}
      });
    });
  }

  async unlink(filePath: string): Promise<void> {
    await fsExtra.unlink(filePath);
  }

  async remove(filePath: string): Promise<void> {
    await fsExtra.remove(filePath);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await fsExtra.rename(oldPath, newPath);
  }
}
