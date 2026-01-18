import { createHash } from "crypto";
import { promises as fs } from "fs";
import { join, relative } from "path";

export interface AppBundleHasherDependencies {
  readDir: (path: string) => Promise<string[]>;
  stat: (path: string) => Promise<{ isDirectory: () => boolean; isFile: () => boolean }>;
  readFile: (path: string) => Promise<Buffer>;
}

const defaultDependencies: AppBundleHasherDependencies = {
  readDir: async path => fs.readdir(path),
  stat: async path => fs.stat(path),
  readFile: async path => fs.readFile(path)
};

const skipPathSegment = (segment: string): boolean => (
  segment === "_CodeSignature" ||
  segment === "SC_Info"
);

const skipFileName = (name: string): boolean => (
  name === "embedded.mobileprovision" ||
  name === "PkgInfo" ||
  name.endsWith(".xcent")
);

const shouldSkipPath = (relativePath: string): boolean => {
  const segments = relativePath.split("/").filter(Boolean);
  if (segments.some(segment => skipPathSegment(segment))) {
    return true;
  }
  const fileName = segments[segments.length - 1] ?? "";
  return skipFileName(fileName);
};

const collectPaths = async (
  root: string,
  current: string,
  deps: AppBundleHasherDependencies,
  output: string[]
): Promise<void> => {
  const entries = await deps.readDir(current);
  entries.sort();
  for (const entry of entries) {
    const fullPath = join(current, entry);
    const stats = await deps.stat(fullPath);
    const relPath = relative(root, fullPath).replace(/\\/g, "/");
    if (shouldSkipPath(relPath)) {
      continue;
    }
    if (stats.isDirectory()) {
      await collectPaths(root, fullPath, deps, output);
    } else if (stats.isFile()) {
      output.push(relPath);
    }
  }
};

export const hashAppBundle = async (
  bundlePath: string,
  deps: AppBundleHasherDependencies = defaultDependencies
): Promise<string> => {
  const hash = createHash("sha256");
  const files: string[] = [];
  await collectPaths(bundlePath, bundlePath, deps, files);
  files.sort();
  for (const relativePath of files) {
    const fullPath = join(bundlePath, relativePath);
    hash.update(relativePath);
    hash.update("\0");
    const contents = await deps.readFile(fullPath);
    hash.update(contents);
    hash.update("\0");
  }
  return hash.digest("hex");
};
