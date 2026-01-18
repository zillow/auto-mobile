import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { ExecResult } from "../../models";
import { hashAppBundle } from "./AppBundleHasher";
import { logger } from "../logger";

export interface DeviceAppInspectorDependencies {
  platform: () => NodeJS.Platform;
  exec: (command: string) => Promise<ExecResult>;
  readFile: (path: string) => Promise<string>;
  mkdtemp: (prefix: string) => Promise<string>;
  rm: (path: string) => Promise<void>;
  readdir: (path: string) => Promise<string[]>;
  stat: (path: string) => Promise<{ isDirectory: () => boolean }>;
  tmpdir: () => string;
}

const defaultDependencies: DeviceAppInspectorDependencies = {
  platform: () => process.platform,
  exec: async command => {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const result = await promisify(exec)(command);
    const stdout = typeof result.stdout === "string" ? result.stdout : result.stdout.toString();
    const stderr = typeof result.stderr === "string" ? result.stderr : result.stderr.toString();
    return {
      stdout,
      stderr,
      toString() { return stdout; },
      trim() { return stdout.trim(); },
      includes(searchString: string) { return stdout.includes(searchString); }
    };
  },
  readFile: async path => fs.readFile(path, "utf-8"),
  mkdtemp: async prefix => fs.mkdtemp(prefix),
  rm: async path => fs.rm(path, { recursive: true, force: true }),
  readdir: async path => fs.readdir(path),
  stat: async path => fs.stat(path),
  tmpdir
};

const quoteShell = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;

const parseJsonOutputPath = (command: string): string | null => {
  const match = command.match(/--json-output\s+([^\s]+)/);
  if (match) {
    return match[1].replace(/^['"]|['"]$/g, "");
  }
  return null;
};

const normalizeDevicePath = (rawPath: string): string => {
  if (rawPath.startsWith("file://")) {
    try {
      return decodeURIComponent(new URL(rawPath).pathname);
    } catch {
      return rawPath.replace("file://", "");
    }
  }
  return rawPath;
};

const findBundleEntry = (data: unknown, bundleId: string): Record<string, unknown> | null => {
  if (!data || typeof data !== "object") {
    return null;
  }
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findBundleEntry(item, bundleId);
      if (found) {
        return found;
      }
    }
    return null;
  }

  const record = data as Record<string, unknown>;
  const idValue = record.bundleIdentifier ?? record.bundleID ?? record.bundleId ?? record.BUNDLE_IDENTIFIER;
  if (typeof idValue === "string" && idValue === bundleId) {
    return record;
  }

  for (const value of Object.values(record)) {
    const found = findBundleEntry(value, bundleId);
    if (found) {
      return found;
    }
  }
  return null;
};

const extractBundlePath = (entry: Record<string, unknown>): string | null => {
  const candidates = [
    entry.bundleURL,
    entry.bundlePath,
    entry.bundleURLString,
    entry.bundle_url,
    entry.bundle_path,
    entry.url,
    entry.path
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      return normalizeDevicePath(candidate);
    }
  }
  return null;
};

const findAppBundleInDir = async (
  root: string,
  deps: DeviceAppInspectorDependencies
): Promise<string | null> => {
  const entries = await deps.readdir(root);
  for (const entry of entries) {
    const fullPath = join(root, entry);
    const stats = await deps.stat(fullPath);
    if (stats.isDirectory()) {
      if (entry.endsWith(".app")) {
        return fullPath;
      }
      const nested = await findAppBundleInDir(fullPath, deps);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
};

export class DeviceAppInspector {
  private readonly deps: DeviceAppInspectorDependencies;

  constructor(deps: DeviceAppInspectorDependencies = defaultDependencies) {
    this.deps = deps;
  }

  public async getInstalledAppBundleHash(deviceUdid: string, bundleId: string): Promise<string | null> {
    if (this.deps.platform() !== "darwin") {
      return null;
    }

    const tempDir = await this.deps.mkdtemp(join(this.deps.tmpdir(), "automobile-devicectl-"));
    const jsonPath = join(tempDir, "apps.json");
    try {
      const infoCommand = [
        "xcrun",
        "devicectl",
        "device",
        "info",
        "apps",
        "--device", deviceUdid,
        "--bundle-id", bundleId,
        "--json-output", quoteShell(jsonPath),
        "--quiet"
      ].join(" ");
      await this.deps.exec(infoCommand);

      const raw = await this.deps.readFile(jsonPath);
      const data = JSON.parse(raw) as unknown;
      const entry = findBundleEntry(data, bundleId);
      if (!entry) {
        return null;
      }
      const bundlePath = extractBundlePath(entry);
      if (!bundlePath) {
        return null;
      }

      const copyDir = await this.deps.mkdtemp(join(this.deps.tmpdir(), "automobile-device-app-"));
      try {
        const copyCommand = [
          "xcrun",
          "devicectl",
          "device",
          "copy",
          "from",
          "--device", deviceUdid,
          "--source", quoteShell(bundlePath),
          "--destination", quoteShell(copyDir),
          "--quiet"
        ].join(" ");
        await this.deps.exec(copyCommand);

        const bundleOnDisk = await findAppBundleInDir(copyDir, this.deps);
        if (!bundleOnDisk) {
          return null;
        }
        return await hashAppBundle(bundleOnDisk);
      } finally {
        await this.deps.rm(copyDir);
      }
    } catch (error) {
      logger.warn(`[DeviceAppInspector] Failed to read installed app bundle for ${bundleId}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    } finally {
      await this.deps.rm(tempDir);
    }
  }

  public async uninstallApp(deviceUdid: string, bundleId: string): Promise<void> {
    if (this.deps.platform() !== "darwin") {
      return;
    }
    const command = [
      "xcrun",
      "devicectl",
      "device",
      "uninstall",
      "app",
      "--device", deviceUdid,
      quoteShell(bundleId),
      "--quiet"
    ].join(" ");
    await this.deps.exec(command);
  }
}

export const parseDevicectlJsonOutputPath = parseJsonOutputPath;
export const extractDevicectlBundlePath = extractBundlePath;
