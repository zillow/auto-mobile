import path from "node:path";
import { describe, expect, test } from "bun:test";
import {
  CmdlineToolsChecksumVerifier,
  CmdlineToolsDownloader,
  CmdlineToolsTempDirProvider,
  CmdlineToolsZipExtractor,
  DefaultCmdlineToolsInstaller
} from "../../../src/utils/android-cmdline-tools/cmdlineToolsInstaller";
import { FileSystem } from "../../../src/utils/filesystem/DefaultFileSystem";

class FakeCmdlineToolsFileSystem implements FileSystem {
  private existingPaths = new Set<string>();
  ensuredDirs: string[] = [];
  removedPaths: string[] = [];
  renamedPaths: Array<{ from: string; to: string }> = [];

  setExists(filePath: string): void {
    this.existingPaths.add(filePath);
  }

  existsSync(filePath: string): boolean {
    return this.existingPaths.has(filePath);
  }

  async pathExists(filePath: string): Promise<boolean> {
    return this.existingPaths.has(filePath);
  }

  async stat(_filePath: string): Promise<{ size: number; mtimeMs: number }> {
    return { size: 0, mtimeMs: 0 };
  }

  async readFile(_filePath: string): Promise<string> {
    return "";
  }

  async readFileBuffer(_filePath: string): Promise<Buffer> {
    return Buffer.alloc(0);
  }

  async readdir(_dirPath: string): Promise<string[]> {
    return [];
  }

  async writeFile(_filePath: string, _content: string): Promise<void> {}

  async writeFileBuffer(_filePath: string, _data: Buffer): Promise<void> {}

  async unlink(filePath: string): Promise<void> {
    this.existingPaths.delete(filePath);
  }

  async ensureDir(dirPath: string): Promise<void> {
    this.ensuredDirs.push(dirPath);
    this.existingPaths.add(dirPath);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    this.renamedPaths.push({ from: oldPath, to: newPath });
    const updated = new Set<string>();
    const prefix = oldPath.endsWith(path.sep) ? oldPath : `${oldPath}${path.sep}`;
    for (const existing of this.existingPaths) {
      if (existing === oldPath) {
        updated.add(newPath);
        continue;
      }
      if (existing.startsWith(prefix)) {
        updated.add(`${newPath}${existing.slice(oldPath.length)}`);
        continue;
      }
      updated.add(existing);
    }
    this.existingPaths = updated;
  }

  async remove(pathToRemove: string): Promise<void> {
    this.removedPaths.push(pathToRemove);
    const updated = new Set<string>();
    const prefix = pathToRemove.endsWith(path.sep) ? pathToRemove : `${pathToRemove}${path.sep}`;
    for (const existing of this.existingPaths) {
      if (existing === pathToRemove || existing.startsWith(prefix)) {
        continue;
      }
      updated.add(existing);
    }
    this.existingPaths = updated;
  }
}

class FakeCmdlineToolsDownloader implements CmdlineToolsDownloader {
  downloads: Array<{ url: string; destination: string }> = [];

  constructor(private fileSystem: FakeCmdlineToolsFileSystem) {}

  async download(url: string, destination: string): Promise<void> {
    this.downloads.push({ url, destination });
    this.fileSystem.setExists(destination);
  }
}

class FakeCmdlineToolsZipExtractor implements CmdlineToolsZipExtractor {
  extracts: Array<{ zipPath: string; destination: string }> = [];

  constructor(
    private fileSystem: FakeCmdlineToolsFileSystem,
    private tools: string[] = ["sdkmanager", "avdmanager"]
  ) {}

  async extract(zipPath: string, destination: string): Promise<void> {
    this.extracts.push({ zipPath, destination });
    const root = path.join(destination, "cmdline-tools");
    const binDir = path.join(root, "bin");
    this.fileSystem.setExists(root);
    this.fileSystem.setExists(binDir);
    this.tools.forEach(tool => {
      this.fileSystem.setExists(path.join(binDir, tool));
    });
  }
}

class FakeCmdlineToolsChecksumVerifier implements CmdlineToolsChecksumVerifier {
  calls: Array<{ filePath: string; expected: string }> = [];
  shouldFail = false;

  async verifyFile(filePath: string, expectedChecksum: string): Promise<void> {
    this.calls.push({ filePath, expected: expectedChecksum });
    if (this.shouldFail) {
      throw new Error("Checksum mismatch");
    }
  }
}

class FakeCmdlineToolsTempDirProvider implements CmdlineToolsTempDirProvider {
  tempDirs: string[] = [];

  async createTempDir(prefix: string): Promise<string> {
    const tempDir = path.join("/tmp", `${prefix}test`);
    this.tempDirs.push(tempDir);
    return tempDir;
  }
}

describe("DefaultCmdlineToolsInstaller", () => {
  test("skips download when tools already exist", async () => {
    const fileSystem = new FakeCmdlineToolsFileSystem();
    const downloader = new FakeCmdlineToolsDownloader(fileSystem);
    const extractor = new FakeCmdlineToolsZipExtractor(fileSystem);
    const checksumVerifier = new FakeCmdlineToolsChecksumVerifier();
    const tempDirProvider = new FakeCmdlineToolsTempDirProvider();

    const androidHome = "/android/sdk";
    const installPath = path.join(androidHome, "cmdline-tools", "latest");
    fileSystem.setExists(path.join(installPath, "bin", "sdkmanager"));
    fileSystem.setExists(path.join(installPath, "bin", "avdmanager"));

    const installer = new DefaultCmdlineToolsInstaller({
      fileSystem,
      downloader,
      zipExtractor: extractor,
      checksumVerifier,
      tempDirProvider,
      platform: "linux"
    });

    const result = await installer.install(androidHome);

    expect(result.success).toBe(true);
    expect(result.message).toContain("already installed");
    expect(result.path).toBe(installPath);
    expect(downloader.downloads).toHaveLength(0);
    expect(extractor.extracts).toHaveLength(0);
  });

  test("downloads, verifies, and installs tools when missing", async () => {
    const fileSystem = new FakeCmdlineToolsFileSystem();
    const downloader = new FakeCmdlineToolsDownloader(fileSystem);
    const extractor = new FakeCmdlineToolsZipExtractor(fileSystem);
    const checksumVerifier = new FakeCmdlineToolsChecksumVerifier();
    const tempDirProvider = new FakeCmdlineToolsTempDirProvider();

    const androidHome = "/android/sdk";
    const installPath = path.join(androidHome, "cmdline-tools", "latest");

    const installer = new DefaultCmdlineToolsInstaller({
      fileSystem,
      downloader,
      zipExtractor: extractor,
      checksumVerifier,
      tempDirProvider,
      platform: "linux"
    });

    const result = await installer.install(androidHome);

    expect(result.success).toBe(true);
    expect(result.path).toBe(installPath);
    expect(downloader.downloads).toHaveLength(1);
    expect(downloader.downloads[0].url).toContain("commandlinetools-linux-13114758_latest.zip");
    expect(checksumVerifier.calls).toHaveLength(1);
    expect(fileSystem.existsSync(path.join(installPath, "bin", "sdkmanager"))).toBe(true);
    expect(fileSystem.existsSync(path.join(installPath, "bin", "avdmanager"))).toBe(true);
  });

  test("fails when checksum verification fails", async () => {
    const fileSystem = new FakeCmdlineToolsFileSystem();
    const downloader = new FakeCmdlineToolsDownloader(fileSystem);
    const extractor = new FakeCmdlineToolsZipExtractor(fileSystem);
    const checksumVerifier = new FakeCmdlineToolsChecksumVerifier();
    const tempDirProvider = new FakeCmdlineToolsTempDirProvider();

    checksumVerifier.shouldFail = true;

    const installer = new DefaultCmdlineToolsInstaller({
      fileSystem,
      downloader,
      zipExtractor: extractor,
      checksumVerifier,
      tempDirProvider,
      platform: "linux"
    });

    await expect(installer.install("/android/sdk")).rejects.toThrow("Checksum mismatch");
    expect(extractor.extracts).toHaveLength(0);
  });
});
