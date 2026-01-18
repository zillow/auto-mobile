import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { XCTestServiceBuilder } from "../../src/utils/XCTestServiceBuilder";
import { FakeXCTestServiceBundleDownloader } from "../fakes/FakeXCTestServiceBundleDownloader";
import * as fs from "fs/promises";
import * as path from "path";
import os from "os";

describe("XCTestServiceBuilder", function() {
  let originalProjectRoot: string | undefined;
  let originalDerivedDataPath: string | undefined;
  let originalSkipBuild: string | undefined;
  let originalCacheDir: string | undefined;
  let tempDir: string;

  beforeEach(async function() {
    // Save original environment
    originalProjectRoot = process.env.AUTOMOBILE_PROJECT_ROOT;
    originalDerivedDataPath = process.env.AUTOMOBILE_XCTESTSERVICE_DERIVED_DATA;
    originalSkipBuild = process.env.AUTOMOBILE_SKIP_XCTESTSERVICE_BUILD;
    originalCacheDir = process.env.AUTOMOBILE_XCTESTSERVICE_CACHE_DIR;

    // Create temp directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xctestservice-builder-test-"));

    // Reset singleton instances
    XCTestServiceBuilder.resetInstances();
  });

  afterEach(async function() {
    // Restore original environment
    if (originalProjectRoot === undefined) {
      delete process.env.AUTOMOBILE_PROJECT_ROOT;
    } else {
      process.env.AUTOMOBILE_PROJECT_ROOT = originalProjectRoot;
    }

    if (originalDerivedDataPath === undefined) {
      delete process.env.AUTOMOBILE_XCTESTSERVICE_DERIVED_DATA;
    } else {
      process.env.AUTOMOBILE_XCTESTSERVICE_DERIVED_DATA = originalDerivedDataPath;
    }

    if (originalSkipBuild === undefined) {
      delete process.env.AUTOMOBILE_SKIP_XCTESTSERVICE_BUILD;
    } else {
      process.env.AUTOMOBILE_SKIP_XCTESTSERVICE_BUILD = originalSkipBuild;
    }

    if (originalCacheDir === undefined) {
      delete process.env.AUTOMOBILE_XCTESTSERVICE_CACHE_DIR;
    } else {
      process.env.AUTOMOBILE_XCTESTSERVICE_CACHE_DIR = originalCacheDir;
    }

    // Reset singleton instances
    XCTestServiceBuilder.resetInstances();

    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("getInstance", function() {
    test("should return same instance for same configuration", function() {
      const instance1 = XCTestServiceBuilder.getInstance();
      const instance2 = XCTestServiceBuilder.getInstance();

      expect(instance1).toBe(instance2);
    });

    test("should return different instances for different configurations", function() {
      const instance1 = XCTestServiceBuilder.getInstance();
      const instance2 = XCTestServiceBuilder.getInstance({ projectRoot: "/different/path" });

      expect(instance1).not.toBe(instance2);
    });
  });

  describe("getConfig", function() {
    test("should return default configuration when no overrides", function() {
      const builder = XCTestServiceBuilder.getInstance();
      const config = builder.getConfig();

      expect(config.scheme).toBe("XCTestServiceApp");
      expect(config.destination).toBe("generic/platform=iOS Simulator");
      expect(config.derivedDataPath).toBe("/tmp/automobile-xctestservice");
      expect(config.bundleCacheDir).toBe(path.join(os.homedir(), ".automobile", "xctestservice"));
    });

    test("should respect environment variable overrides", function() {
      process.env.AUTOMOBILE_XCTESTSERVICE_DERIVED_DATA = "/custom/derived/data";
      process.env.AUTOMOBILE_XCTESTSERVICE_CACHE_DIR = "/custom/cache";

      // Reset instances to pick up new env
      XCTestServiceBuilder.resetInstances();

      const builder = XCTestServiceBuilder.getInstance();
      const config = builder.getConfig();

      expect(config.derivedDataPath).toBe("/custom/derived/data");
      expect(config.bundleCacheDir).toBe("/custom/cache");
    });

    test("should respect constructor config overrides", function() {
      const builder = XCTestServiceBuilder.getInstance({
        derivedDataPath: "/override/path",
        scheme: "CustomScheme",
        bundleCacheDir: "/override/cache",
      });
      const config = builder.getConfig();

      expect(config.derivedDataPath).toBe("/override/path");
      expect(config.scheme).toBe("CustomScheme");
      expect(config.bundleCacheDir).toBe("/override/cache");
    });
  });

  describe("needsRebuild", function() {
    test("should return false when AUTOMOBILE_SKIP_XCTESTSERVICE_BUILD is true", async function() {
      process.env.AUTOMOBILE_SKIP_XCTESTSERVICE_BUILD = "true";

      // Reset instances to pick up new env
      XCTestServiceBuilder.resetInstances();

      const builder = XCTestServiceBuilder.getInstance();
      const result = await builder.needsRebuild();

      expect(result).toBe(false);
    });

    test("should return false when AUTOMOBILE_SKIP_XCTESTSERVICE_BUILD is 1", async function() {
      process.env.AUTOMOBILE_SKIP_XCTESTSERVICE_BUILD = "1";

      // Reset instances to pick up new env
      XCTestServiceBuilder.resetInstances();

      const builder = XCTestServiceBuilder.getInstance();
      const result = await builder.needsRebuild();

      expect(result).toBe(false);
    });

    test("should return true when build products don't exist", async function() {
      const builder = XCTestServiceBuilder.getInstance({
        derivedDataPath: path.join(tempDir, "nonexistent"),
        projectRoot: tempDir,
      });

      const result = await builder.needsRebuild();

      // Should return true because build products don't exist
      expect(result).toBe(true);
    });

    test("should return false when xctestrun and metadata match", async function() {
      const derivedDataPath = path.join(tempDir, "DerivedData");
      const productsDir = path.join(derivedDataPath, "Build", "Products");
      await fs.mkdir(productsDir, { recursive: true });
      await fs.writeFile(path.join(productsDir, "XCTestServiceApp_iphonesimulator.xctestrun"), "mock");

      const cacheDir = path.join(tempDir, "cache");
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(
        path.join(cacheDir, "xctestservice-bundle.json"),
        JSON.stringify({ checksum: "test-checksum", version: "latest", extractedAt: new Date().toISOString() })
      );

      XCTestServiceBuilder.setExpectedChecksumForTesting("test-checksum");
      const builder = XCTestServiceBuilder.getInstance({
        derivedDataPath,
        bundleCacheDir: cacheDir
      });

      const result = await builder.needsRebuild("simulator");
      expect(result).toBe(false);
    });
  });

  describe("getBuildProductsPath", function() {
    test("should return null when build products don't exist", async function() {
      const builder = XCTestServiceBuilder.getInstance({
        derivedDataPath: path.join(tempDir, "nonexistent"),
      });

      const result = await builder.getBuildProductsPath();

      expect(result).toBeNull();
    });

    test("should return path when build products exist", async function() {
      // Create fake build products directory
      const buildDir = path.join(tempDir, "Build", "Products", "Debug-iphonesimulator");
      await fs.mkdir(buildDir, { recursive: true });

      const builder = XCTestServiceBuilder.getInstance({
        derivedDataPath: tempDir,
      });

      const result = await builder.getBuildProductsPath();

      expect(result).toBe(buildDir);
    });
  });

  describe("getXctestrunPath", function() {
    test("should return null when xctestrun doesn't exist", async function() {
      const builder = XCTestServiceBuilder.getInstance({
        derivedDataPath: path.join(tempDir, "nonexistent"),
      });

      const result = await builder.getXctestrunPath();

      expect(result).toBeNull();
    });

    test("should return path when xctestrun exists", async function() {
      // Create fake build products directory and xctestrun file
      const productsDir = path.join(tempDir, "Build", "Products");
      const buildDir = path.join(productsDir, "Debug-iphonesimulator");
      await fs.mkdir(buildDir, { recursive: true });

      const xctestrunFile = path.join(productsDir, "XCTestServiceApp_iphonesimulator.xctestrun");
      await fs.writeFile(xctestrunFile, "mock xctestrun content");

      const builder = XCTestServiceBuilder.getInstance({
        derivedDataPath: tempDir,
      });

      const result = await builder.getXctestrunPath();

      expect(result).toBe(xctestrunFile);
    });
  });

  describe("cleanBuildArtifacts", function() {
    test("should remove derived data directory", async function() {
      // Create fake derived data
      const derivedDataPath = path.join(tempDir, "DerivedData");
      await fs.mkdir(derivedDataPath, { recursive: true });
      await fs.writeFile(path.join(derivedDataPath, "test.txt"), "test");

      const builder = XCTestServiceBuilder.getInstance({
        derivedDataPath,
      });

      await builder.cleanBuildArtifacts();

      // Verify directory was removed
      const exists = await fs.access(derivedDataPath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });
  });

  describe("static prefetch methods", function() {
    test("getPrefetchedResult should return null initially", function() {
      XCTestServiceBuilder.resetInstances();
      const result = XCTestServiceBuilder.getPrefetchedResult();
      expect(result).toBeNull();
    });

    test("getPrefetchError should return null initially", function() {
      XCTestServiceBuilder.resetInstances();
      const error = XCTestServiceBuilder.getPrefetchError();
      expect(error).toBeNull();
    });

    test("waitForPrefetch should return null when no prefetch started", async function() {
      XCTestServiceBuilder.resetInstances();
      const result = await XCTestServiceBuilder.waitForPrefetch();
      expect(result).toBeNull();
    });
  });

  describe("build", function() {
    test("should download and extract bundle using downloader", async function() {
      const derivedDataPath = path.join(tempDir, "DerivedData");
      const cacheDir = path.join(tempDir, "cache");
      const downloader = new FakeXCTestServiceBundleDownloader();
      downloader.checksum = "expected-checksum";

      XCTestServiceBuilder.setExpectedChecksumForTesting("expected-checksum");
      const builder = XCTestServiceBuilder.getInstance(
        {
          derivedDataPath,
          bundleCacheDir: cacheDir
        },
        { downloader }
      );

      const result = await builder.build("simulator");

      expect(result.success).toBe(true);
      expect(result.xctestrunPath).toBe(path.join(derivedDataPath, "Build", "Products", "XCTestServiceApp_iphonesimulator.xctestrun"));
      expect(downloader.downloadedUrls.length).toBe(1);
      expect(downloader.extractedPaths[0]).toBe(derivedDataPath);
    });

    test("should normalize nested bundle layouts", async function() {
      const derivedDataPath = path.join(tempDir, "DerivedData");
      const cacheDir = path.join(tempDir, "cache");
      const downloader = new FakeXCTestServiceBundleDownloader();
      downloader.checksum = "expected-checksum";
      downloader.extractedSubdir = "NestedRoot";

      XCTestServiceBuilder.setExpectedChecksumForTesting("expected-checksum");
      const builder = XCTestServiceBuilder.getInstance(
        {
          derivedDataPath,
          bundleCacheDir: cacheDir
        },
        { downloader }
      );

      const result = await builder.build("simulator");
      const buildProducts = await builder.getBuildProductsPath("simulator");

      expect(result.success).toBe(true);
      expect(buildProducts).toBe(path.join(derivedDataPath, "Build", "Products", "Debug-iphonesimulator"));
    });

    test("should redownload when version changes without checksum", async function() {
      const derivedDataPath = path.join(tempDir, "DerivedData");
      const cacheDir = path.join(tempDir, "cache");
      await fs.mkdir(cacheDir, { recursive: true });

      const existingBundle = path.join(cacheDir, "XCTestService.ipa");
      await fs.writeFile(existingBundle, "a".repeat(12000));
      await fs.writeFile(
        path.join(cacheDir, "xctestservice-bundle.json"),
        JSON.stringify({ checksum: null, version: "old", extractedAt: new Date().toISOString() })
      );

      const downloader = new FakeXCTestServiceBundleDownloader();
      XCTestServiceBuilder.setExpectedChecksumForTesting("");
      const builder = XCTestServiceBuilder.getInstance(
        {
          derivedDataPath,
          bundleCacheDir: cacheDir
        },
        { downloader }
      );

      const result = await builder.build("simulator");

      expect(result.success).toBe(true);
      expect(downloader.downloadedUrls.length).toBe(1);
    });
  });
});
