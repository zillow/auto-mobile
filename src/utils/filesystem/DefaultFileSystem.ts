import fs from "fs";
import fsExtra from "fs-extra";
import { readFileAsync, readdirAsync } from "../io";

/**
 * Interface for file system operations
 */
export interface FileSystem {
  /**
   * Read file contents asynchronously
   * @param filePath - Path to the file to read
   * @param encoding - File encoding (default: "utf8")
   * @returns Promise resolving to file contents
   */
  readFile(filePath: string, encoding?: string): Promise<string>;

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
   * Write content to a file asynchronously
   * @param filePath - Path to the file to write
   * @param content - Content to write
   * @param encoding - File encoding (default: "utf8")
   * @returns Promise that resolves when write is complete
   */
  writeFile(filePath: string, content: string, encoding?: string): Promise<void>;

  /**
   * Ensure a directory exists, creating it if necessary
   * @param dirPath - Path to the directory
   * @returns Promise that resolves when directory is ensured
   */
  ensureDir(dirPath: string): Promise<void>;
}

/**
 * Default file system implementation
 */
export class DefaultFileSystem implements FileSystem {
  async readFile(filePath: string, encoding: string = "utf8"): Promise<string> {
    const result = await readFileAsync(filePath, { encoding } as any);
    return typeof result === "string" ? result : result.toString(encoding as any);
  }

  async readdir(dirPath: string): Promise<string[]> {
    return readdirAsync(dirPath);
  }

  existsSync(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  async writeFile(filePath: string, content: string, encoding: string = "utf8"): Promise<void> {
    return new Promise((resolve, reject) => {
      fsExtra.writeFile(filePath, content, { encoding } as any, err => {
        if (err) {reject(err);} else {resolve();}
      });
    });
  }

  async ensureDir(dirPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      fsExtra.ensureDir(dirPath, err => {
        if (err) {reject(err);} else {resolve();}
      });
    });
  }
}
