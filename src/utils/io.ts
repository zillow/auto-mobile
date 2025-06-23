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
export const appendFileAsync = promisify(fs.appendFile);

// Helper functions for common operations
export const ensureDirExists = async (dirPath: string): Promise<void> => {
  if (!fs.existsSync(dirPath)) {
    await mkdirAsync(dirPath, { recursive: true });
  }
};

export const writeJsonToFile = async (filePath: string, data: any, pretty: boolean = false): Promise<void> => {
  const jsonString = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  await writeFileAsync(filePath, jsonString);
};
