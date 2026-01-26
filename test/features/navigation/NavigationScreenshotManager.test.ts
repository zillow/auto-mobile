import { expect, describe, test, beforeEach, afterEach } from "bun:test";
import {
  NavigationScreenshotManager,
  FileSystem,
} from "../../../src/features/navigation/NavigationScreenshotManager";
import { FakeTimer } from "../../fakes/FakeTimer";

/**
 * Fake file system implementation for testing.
 */
class FakeFileSystem implements FileSystem {
  private files: Map<string, { data: Buffer; mtimeMs: number }> = new Map();
  private directories: Set<string> = new Set();

  async ensureDir(dir: string): Promise<void> {
    this.directories.add(dir);
  }

  async pathExists(path: string): Promise<boolean> {
    return this.files.has(path) || this.directories.has(path);
  }

  async readdir(dir: string): Promise<string[]> {
    const result: string[] = [];
    for (const path of this.files.keys()) {
      if (path.startsWith(dir + "/")) {
        const filename = path.slice(dir.length + 1);
        if (!filename.includes("/")) {
          result.push(filename);
        }
      }
    }
    return result;
  }

  async stat(path: string): Promise<{ size: number; mtimeMs: number }> {
    const file = this.files.get(path);
    if (!file) {
      throw new Error(`File not found: ${path}`);
    }
    return { size: file.data.length, mtimeMs: file.mtimeMs };
  }

  async readFile(path: string): Promise<Buffer> {
    const file = this.files.get(path);
    if (!file) {
      throw new Error(`File not found: ${path}`);
    }
    return file.data;
  }

  async writeFile(path: string, data: Buffer): Promise<void> {
    this.files.set(path, { data, mtimeMs: Date.now() });
  }

  async unlink(path: string): Promise<void> {
    this.files.delete(path);
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }

  // Test helpers
  setFile(path: string, data: Buffer, mtimeMs?: number): void {
    this.files.set(path, { data, mtimeMs: mtimeMs ?? Date.now() });
  }

  getFile(path: string): Buffer | undefined {
    return this.files.get(path)?.data;
  }

  getFileCount(): number {
    return this.files.size;
  }

  getTotalSize(): number {
    let total = 0;
    for (const file of this.files.values()) {
      total += file.data.length;
    }
    return total;
  }

  setFileMtime(path: string, mtimeMs: number): void {
    const file = this.files.get(path);
    if (file) {
      file.mtimeMs = mtimeMs;
    }
  }
}

describe("NavigationScreenshotManager", () => {
  let manager: NavigationScreenshotManager;
  let fakeFs: FakeFileSystem;
  let fakeTimer: FakeTimer;
  const screenshotDir = "/tmp/test-screenshots";

  beforeEach(() => {
    NavigationScreenshotManager.resetInstance();
    fakeFs = new FakeFileSystem();
    fakeTimer = new FakeTimer();
    fakeTimer.setManualMode(); // Use manual mode for controlled time

    manager = NavigationScreenshotManager.createForTesting({
      screenshotDir,
      maxCacheSizeBytes: 1024 * 1024, // 1MB for testing
      fileSystem: fakeFs,
      timer: fakeTimer,
    });
  });

  afterEach(() => {
    NavigationScreenshotManager.resetInstance();
  });

  describe("singleton pattern", () => {
    test("should return the same instance", () => {
      const instance1 = NavigationScreenshotManager.getInstance();
      const instance2 = NavigationScreenshotManager.getInstance();
      expect(instance1).toBe(instance2);
    });

    test("should reset instance correctly", () => {
      const instance1 = NavigationScreenshotManager.getInstance();
      NavigationScreenshotManager.resetInstance();
      const instance2 = NavigationScreenshotManager.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe("generateFilename", () => {
    test("should generate unique filename with hash and timestamp", () => {
      const filename = manager.generateFilename("com.test.app", "HomeScreen");

      expect(filename).toMatch(/^[a-f0-9]+_\d+\.webp$/);
      expect(filename).toContain("0"); // timestamp from fake timer starts at 0
    });

    test("should generate consistent hash for same app/screen", () => {
      const filename1 = manager.generateFilename("com.test.app", "HomeScreen");
      fakeTimer.advanceTime(1000);
      const filename2 = manager.generateFilename("com.test.app", "HomeScreen");

      // Hash should be the same, but timestamp different
      const hash1 = filename1.split("_")[0];
      const hash2 = filename2.split("_")[0];
      expect(hash1).toBe(hash2);

      // Timestamps should be different
      const ts1 = filename1.split("_")[1]?.split(".")[0];
      const ts2 = filename2.split("_")[1]?.split(".")[0];
      expect(ts1).not.toBe(ts2);
    });

    test("should generate different hash for different screens", () => {
      const filename1 = manager.generateFilename("com.test.app", "HomeScreen");
      const filename2 = manager.generateFilename("com.test.app", "SettingsScreen");

      const hash1 = filename1.split("_")[0];
      const hash2 = filename2.split("_")[0];
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("findExistingScreenshot", () => {
    test("should return null when no screenshots exist", async () => {
      const result = await manager.findExistingScreenshot("com.test.app", "HomeScreen");
      expect(result).toBeNull();
    });

    test("should find existing screenshot", async () => {
      // Generate a filename and create it in the fake FS
      const filename = manager.generateFilename("com.test.app", "HomeScreen");
      const path = `${screenshotDir}/${filename}`;
      fakeFs.setFile(path, Buffer.from("test"));

      const result = await manager.findExistingScreenshot("com.test.app", "HomeScreen");
      expect(result).toBe(path);
    });

    test("should return most recent screenshot when multiple exist", async () => {
      const hash = manager.generateFilename("com.test.app", "HomeScreen").split("_")[0];

      // Create multiple screenshots with different timestamps
      const oldFile = `${screenshotDir}/${hash}_1000.webp`;
      const newFile = `${screenshotDir}/${hash}_2000.webp`;

      fakeFs.setFile(oldFile, Buffer.from("old"));
      fakeFs.setFile(newFile, Buffer.from("new"));

      const result = await manager.findExistingScreenshot("com.test.app", "HomeScreen");
      expect(result).toBe(newFile);
    });
  });

  describe("readScreenshot", () => {
    test("should return null for non-existent file", async () => {
      const result = await manager.readScreenshot("/nonexistent/file.webp");
      expect(result).toBeNull();
    });

    test("should return buffer for existing file", async () => {
      const path = `${screenshotDir}/test.webp`;
      const data = Buffer.from("test image data");
      fakeFs.setFile(path, data);

      const result = await manager.readScreenshot(path);
      expect(result).toEqual(data);
    });
  });

  describe("cleanupLRU", () => {
    test("should not delete files when under limit", async () => {
      // Create files totaling 500KB (under 1MB limit)
      const file1 = `${screenshotDir}/file1.webp`;
      const file2 = `${screenshotDir}/file2.webp`;
      fakeFs.setFile(file1, Buffer.alloc(250 * 1024));
      fakeFs.setFile(file2, Buffer.alloc(250 * 1024));

      await manager.cleanupLRU();

      expect(fakeFs.getFileCount()).toBe(2);
    });

    test("should delete oldest files when over limit", async () => {
      // Create files totaling 1.5MB (over 1MB limit)
      const oldFile = `${screenshotDir}/old.webp`;
      const newFile = `${screenshotDir}/new.webp`;

      fakeFs.setFile(oldFile, Buffer.alloc(800 * 1024), 1000);
      fakeFs.setFile(newFile, Buffer.alloc(800 * 1024), 2000);

      await manager.cleanupLRU();

      // Old file should be deleted
      expect(await fakeFs.pathExists(oldFile)).toBe(false);
      expect(await fakeFs.pathExists(newFile)).toBe(true);
    });

    test("should continue deleting until under limit", async () => {
      // Create 5 files, each 400KB (2MB total, over 1MB limit)
      for (let i = 0; i < 5; i++) {
        const file = `${screenshotDir}/file${i}.webp`;
        fakeFs.setFile(file, Buffer.alloc(400 * 1024), 1000 + i);
      }

      await manager.cleanupLRU();

      // Should delete oldest files until under 1MB
      // Need to delete at least 3 files to get under 1MB
      expect(fakeFs.getFileCount()).toBeLessThanOrEqual(2);
      expect(fakeFs.getTotalSize()).toBeLessThanOrEqual(1024 * 1024);
    });
  });

  describe("getScreenshotDir", () => {
    test("should return configured directory", () => {
      expect(manager.getScreenshotDir()).toBe(screenshotDir);
    });
  });
});
