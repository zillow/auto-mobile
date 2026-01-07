import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

let cachedVersion: string | null = null;

const findPackageJson = (startDir: string): string | null => {
  let currentDir = startDir;
  for (let depth = 0; depth < 6; depth++) {
    const candidate = path.join(currentDir, "package.json");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }
  return null;
};

export const getMcpServerVersion = (): string => {
  if (cachedVersion) {
    return cachedVersion;
  }

  const envVersion = process.env.MCP_SERVER_VERSION || process.env.npm_package_version;
  if (envVersion) {
    cachedVersion = envVersion;
    return envVersion;
  }

  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const packagePath = findPackageJson(moduleDir) ?? findPackageJson(process.cwd());
  if (packagePath) {
    try {
      const raw = fs.readFileSync(packagePath, "utf-8");
      const parsed = JSON.parse(raw) as { version?: string };
      if (parsed.version) {
        cachedVersion = parsed.version;
        return parsed.version;
      }
    } catch {
      // Fall through to unknown
    }
  }

  cachedVersion = "unknown";
  return cachedVersion;
};
