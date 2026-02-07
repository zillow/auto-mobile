import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import AdmZip from "adm-zip";
import { logger } from "../logger";
import { CMDLINE_TOOLS_DOWNLOAD } from "./install";
import { FileSystem, DefaultFileSystem } from "../filesystem/DefaultFileSystem";

export interface CmdlineToolsInstaller {
  install(
    androidHome: string,
    options?: CmdlineToolsInstallOptions
  ): Promise<CmdlineToolsInstallResult>;
}

export interface CmdlineToolsInstallOptions {
  force?: boolean;
}

export interface CmdlineToolsInstallResult {
  success: boolean;
  message: string;
  path: string;
  version: string;
}

export interface CmdlineToolsDownloader {
  download(url: string, destination: string): Promise<void>;
}

export interface CmdlineToolsZipExtractor {
  extract(zipPath: string, destination: string): Promise<void>;
}

export interface CmdlineToolsChecksumVerifier {
  verifyFile(filePath: string, expectedChecksum: string): Promise<void>;
}

export interface CmdlineToolsTempDirProvider {
  createTempDir(prefix: string): Promise<string>;
}

/**
 * @deprecated Use FileSystem from utils/filesystem/DefaultFileSystem instead
 */
export type CmdlineToolsFileSystem = FileSystem;

export interface CmdlineToolsDownloadSpec {
  version: string;
  baseUrl: string;
  platforms: Record<"darwin" | "linux" | "win32", { filename: string; checksum: string }>;
}

export interface CmdlineToolsInstallerDependencies {
  fileSystem?: FileSystem;
  downloader?: CmdlineToolsDownloader;
  zipExtractor?: CmdlineToolsZipExtractor;
  checksumVerifier?: CmdlineToolsChecksumVerifier;
  tempDirProvider?: CmdlineToolsTempDirProvider;
  platform?: NodeJS.Platform;
  downloadSpec?: CmdlineToolsDownloadSpec;
}

const REQUIRED_TOOLS = ["sdkmanager", "avdmanager"];

// Uses canonical DefaultFileSystem from utils/filesystem/DefaultFileSystem

class HttpsCmdlineToolsDownloader implements CmdlineToolsDownloader {
  async download(url: string, destination: string): Promise<void> {
    await fsPromises.mkdir(path.dirname(destination), { recursive: true });
    await this.downloadWithRedirects(url, destination, 0);
  }

  private async downloadWithRedirects(url: string, destination: string, redirectCount: number): Promise<void> {
    if (redirectCount > 5) {
      throw new Error(`Too many redirects while downloading ${url}`);
    }

    await new Promise<void>((resolve, reject) => {
      const request = https.get(url, response => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          const redirectedUrl = new URL(response.headers.location, url).toString();
          void this.downloadWithRedirects(redirectedUrl, destination, redirectCount + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Download failed with status ${response.statusCode} from ${url}`));
          return;
        }

        const fileStream = fs.createWriteStream(destination);
        response.pipe(fileStream);
        fileStream.on("finish", () => fileStream.close(() => resolve()));
        fileStream.on("error", err => {
          fileStream.close();
          reject(err);
        });
      });

      request.on("error", reject);
    });
  }
}

class AdmZipCmdlineToolsExtractor implements CmdlineToolsZipExtractor {
  async extract(zipPath: string, destination: string): Promise<void> {
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();
    const resolvedDestination = path.resolve(destination);

    for (const entry of entries) {
      const resolvedEntry = path.resolve(resolvedDestination, entry.entryName);
      if (!this.isSafeEntryPath(resolvedDestination, resolvedEntry)) {
        throw new Error(`Zip entry escapes extraction directory: ${entry.entryName}`);
      }
    }

    zip.extractAllTo(resolvedDestination, true);
  }

  private isSafeEntryPath(root: string, resolvedEntry: string): boolean {
    if (resolvedEntry === root) {
      return true;
    }
    return resolvedEntry.startsWith(`${root}${path.sep}`);
  }
}

class Sha256ChecksumVerifier implements CmdlineToolsChecksumVerifier {
  async verifyFile(filePath: string, expectedChecksum: string): Promise<void> {
    const actualChecksum = await this.computeChecksum(filePath);
    if (actualChecksum.toLowerCase() !== expectedChecksum.toLowerCase()) {
      throw new Error(`Checksum mismatch. Expected ${expectedChecksum}, got ${actualChecksum}`);
    }
  }

  private async computeChecksum(filePath: string): Promise<string> {
    const hash = crypto.createHash("sha256");
    await new Promise<void>((resolve, reject) => {
      const stream = fs.createReadStream(filePath);
      stream.on("data", chunk => hash.update(chunk));
      stream.on("error", reject);
      stream.on("end", () => resolve());
    });
    return hash.digest("hex");
  }
}

class NodeTempDirProvider implements CmdlineToolsTempDirProvider {
  async createTempDir(prefix: string): Promise<string> {
    return fsPromises.mkdtemp(path.join(os.tmpdir(), prefix));
  }
}

export class DefaultCmdlineToolsInstaller implements CmdlineToolsInstaller {
  private fileSystem: FileSystem;
  private downloader: CmdlineToolsDownloader;
  private zipExtractor: CmdlineToolsZipExtractor;
  private checksumVerifier: CmdlineToolsChecksumVerifier;
  private tempDirProvider: CmdlineToolsTempDirProvider;
  private platform: NodeJS.Platform;
  private downloadSpec: CmdlineToolsDownloadSpec;

  constructor(dependencies: CmdlineToolsInstallerDependencies = {}) {
    this.fileSystem = dependencies.fileSystem ?? new DefaultFileSystem();
    this.downloader = dependencies.downloader ?? new HttpsCmdlineToolsDownloader();
    this.zipExtractor = dependencies.zipExtractor ?? new AdmZipCmdlineToolsExtractor();
    this.checksumVerifier = dependencies.checksumVerifier ?? new Sha256ChecksumVerifier();
    this.tempDirProvider = dependencies.tempDirProvider ?? new NodeTempDirProvider();
    this.platform = dependencies.platform ?? process.platform;
    this.downloadSpec = dependencies.downloadSpec ?? CMDLINE_TOOLS_DOWNLOAD;
  }

  async install(
    androidHome: string,
    options: CmdlineToolsInstallOptions = {}
  ): Promise<CmdlineToolsInstallResult> {
    if (!androidHome || androidHome.trim().length === 0) {
      throw new Error("ANDROID_HOME is not set. Set ANDROID_HOME before installing cmdline-tools.");
    }

    const platformInfo = this.resolvePlatformInfo(this.platform, this.downloadSpec);
    const installRoot = path.join(androidHome, "cmdline-tools");
    const targetPath = path.join(installRoot, "latest");

    if (!options.force && this.hasRequiredTools(targetPath, this.platform)) {
      return {
        success: true,
        message: "Android SDK command-line tools already installed",
        path: targetPath,
        version: this.downloadSpec.version
      };
    }

    logger.info("Installing Android SDK command-line tools", { androidHome, platform: this.platform });

    await this.fileSystem.ensureDir(installRoot);
    const tempDir = await this.tempDirProvider.createTempDir("auto-mobile-cmdline-tools-");
    const zipPath = path.join(tempDir, "commandlinetools.zip");
    const downloadUrl = `${this.downloadSpec.baseUrl}/${platformInfo.filename}`;
    const extractedPath = path.join(installRoot, "cmdline-tools");

    try {
      if (this.fileSystem.existsSync(targetPath)) {
        await this.fileSystem.remove(targetPath);
      }
      if (this.fileSystem.existsSync(extractedPath)) {
        await this.fileSystem.remove(extractedPath);
      }

      await this.downloader.download(downloadUrl, zipPath);
      await this.checksumVerifier.verifyFile(zipPath, platformInfo.checksum);
      await this.zipExtractor.extract(zipPath, installRoot);
      await this.fileSystem.rename(extractedPath, targetPath);

      if (!this.hasRequiredTools(targetPath, this.platform)) {
        throw new Error("Installation verification failed: required tools not found");
      }

      return {
        success: true,
        message: `Installed Android SDK command-line tools ${this.downloadSpec.version}`,
        path: targetPath,
        version: this.downloadSpec.version
      };
    } catch (error) {
      if (this.fileSystem.existsSync(targetPath)) {
        await this.fileSystem.remove(targetPath);
      }
      throw error;
    } finally {
      await this.fileSystem.remove(tempDir);
    }
  }

  private resolvePlatformInfo(
    platform: NodeJS.Platform,
    downloadSpec: CmdlineToolsDownloadSpec
  ): { filename: string; checksum: string } {
    if (platform === "darwin" || platform === "linux" || platform === "win32") {
      return downloadSpec.platforms[platform];
    }
    throw new Error(`Unsupported platform for cmdline-tools installation: ${platform}`);
  }

  private hasRequiredTools(installPath: string, platform: NodeJS.Platform): boolean {
    const binDir = path.join(installPath, "bin");
    return REQUIRED_TOOLS.every(tool => {
      return this.getToolCandidates(tool, platform).some(candidate =>
        this.fileSystem.existsSync(path.join(binDir, candidate))
      );
    });
  }

  private getToolCandidates(toolName: string, platform: NodeJS.Platform): string[] {
    if (platform === "win32") {
      return [`${toolName}.bat`, `${toolName}.cmd`, `${toolName}.exe`];
    }
    return [toolName];
  }
}
