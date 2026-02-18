import fs from "fs-extra";
import { promisify } from "util";

// Promisified fs functions
export const readFileAsync = promisify(fs.readFile);
export const writeFileAsync = promisify(fs.writeFile);
export const statAsync = promisify(fs.stat);
export const readdirAsync = promisify(fs.readdir);

// Additional promisified fs functions
export const mkdirAsync = promisify(fs.mkdir);
export const renameAsync = promisify(fs.rename);

// Helper functions for common operations
export const ensureDirExists = async (dirPath: string): Promise<void> => {
  if (!fs.existsSync(dirPath)) {
    await mkdirAsync(dirPath, { recursive: true });
  }
};
