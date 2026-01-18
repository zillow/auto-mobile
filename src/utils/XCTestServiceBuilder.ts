import * as fs from "fs/promises";
import * as path from "path";
import os from "os";
import { logger } from "./logger";
import { NoOpPerformanceTracker, type PerformanceTracker } from "./PerformanceTracker";
import {
  XCTESTSERVICE_APP_HASH,
  XCTESTSERVICE_IPA_URL,
  XCTESTSERVICE_RELEASE_VERSION,
  XCTESTSERVICE_SHA256_CHECKSUM
} from "../constants/release";
import {
  DefaultXCTestServiceBundleDownloader,
  type XCTestServiceBundleDownloader
} from "./XCTestServiceBundleDownloader";
import { hashAppBundle } from "./ios-cmdline-tools/AppBundleHasher";

/**
 * Result of XCTestService download/install
 */
export interface XCTestServiceBuildResult {
  success: boolean;
  message: string;
  buildPath?: string;      // Path to build products
  xctestrunPath?: string;  // Path to .xctestrun file
  error?: string;
}

/**
 * XCTestService Build Configuration
 */
export interface XCTestServiceBuildConfig {
  projectRoot: string;
  derivedDataPath: string;
  scheme: string;
  destination: string;
  bundleCacheDir: string;
}

export interface XCTestServiceBuilderDependencies {
  downloader?: XCTestServiceBundleDownloader;
}

type XCTestServicePlatform = "simulator" | "device";

type XCTestServiceBundleMetadata = {
  checksum: string | null;
  version: string;
  extractedAt: string;
  appHashes?: Partial<Record<XCTestServicePlatform, string>>;
};

/**
 * XCTestService Builder
 * Handles release bundle download and extraction for XCTestService
 */
export class XCTestServiceBuilder {
  private static readonly DEFAULT_PROJECT_ROOT = process.cwd();
  private static readonly DEFAULT_DERIVED_DATA_PATH = "/tmp/automobile-xctestservice";
  private static readonly DEFAULT_SCHEME = "XCTestServiceApp";
  private static readonly DEFAULT_DESTINATION = "generic/platform=iOS Simulator";
  private static readonly DEFAULT_BUNDLE_CACHE_DIR = path.join(os.homedir(), ".automobile", "xctestservice");
  private static readonly DEFAULT_BUNDLE_FILENAME = "XCTestService.ipa";
  private static readonly METADATA_FILENAME = "xctestservice-bundle.json";
  private static readonly MIN_BUNDLE_SIZE_BYTES = 10000;

  // Build state
  private static prefetchPromise: Promise<XCTestServiceBuildResult | null> | null = null;
  private static prefetchResult: XCTestServiceBuildResult | null = null;
  private static prefetchError: Error | null = null;
  private static expectedChecksumOverride: string | null = null;

  // Singleton instances per configuration
  private static instances: Map<string, XCTestServiceBuilder> = new Map();

  private readonly config: XCTestServiceBuildConfig;
  private readonly downloader: XCTestServiceBundleDownloader;
  private cachedBuildProductsPath: Map<XCTestServicePlatform, string | null> = new Map();
  private cachedXctestrunPath: Map<string, string | null> = new Map();
  private cachedAppBundleHash: Map<XCTestServicePlatform, string | null> = new Map();

  private constructor(
    config: Partial<XCTestServiceBuildConfig> = {},
    dependencies: XCTestServiceBuilderDependencies = {}
  ) {
    this.config = {
      projectRoot: config.projectRoot || process.env.AUTOMOBILE_PROJECT_ROOT || XCTestServiceBuilder.DEFAULT_PROJECT_ROOT,
      derivedDataPath: config.derivedDataPath || process.env.AUTOMOBILE_XCTESTSERVICE_DERIVED_DATA || XCTestServiceBuilder.DEFAULT_DERIVED_DATA_PATH,
      scheme: config.scheme || XCTestServiceBuilder.DEFAULT_SCHEME,
      destination: config.destination || XCTestServiceBuilder.DEFAULT_DESTINATION,
      bundleCacheDir: config.bundleCacheDir || process.env.AUTOMOBILE_XCTESTSERVICE_CACHE_DIR || XCTestServiceBuilder.DEFAULT_BUNDLE_CACHE_DIR,
    };
    this.downloader = dependencies.downloader ?? new DefaultXCTestServiceBundleDownloader();
  }

  /**
   * Get singleton instance for default configuration
   */
  public static getInstance(
    config?: Partial<XCTestServiceBuildConfig>,
    dependencies?: XCTestServiceBuilderDependencies
  ): XCTestServiceBuilder {
    const key = JSON.stringify({
      config: config || {},
      deps: dependencies?.downloader ? "custom" : "default"
    });
    if (!XCTestServiceBuilder.instances.has(key)) {
      XCTestServiceBuilder.instances.set(key, new XCTestServiceBuilder(config, dependencies));
    }
    return XCTestServiceBuilder.instances.get(key)!;
  }

  /**
   * Reset all instances (for testing)
   */
  public static resetInstances(): void {
    XCTestServiceBuilder.instances.clear();
    XCTestServiceBuilder.prefetchPromise = null;
    XCTestServiceBuilder.prefetchResult = null;
    XCTestServiceBuilder.prefetchError = null;
    XCTestServiceBuilder.expectedChecksumOverride = null;
  }

  /**
   * Override checksum for tests
   */
  public static setExpectedChecksumForTesting(checksum: string | null): void {
    XCTestServiceBuilder.expectedChecksumOverride = checksum;
  }

  /**
   * Get the build products directory path
   */
  public async getBuildProductsPath(platform: XCTestServicePlatform = "simulator"): Promise<string | null> {
    const cachedPath = this.cachedBuildProductsPath.get(platform);
    if (cachedPath) {
      try {
        await fs.access(cachedPath);
        return cachedPath;
      } catch {
        this.cachedBuildProductsPath.set(platform, null);
      }
    }

    const buildDir = path.join(
      this.config.derivedDataPath,
      "Build",
      "Products",
      platform === "device" ? "Debug-iphoneos" : "Debug-iphonesimulator"
    );

    try {
      await fs.access(buildDir);
      this.cachedBuildProductsPath.set(platform, buildDir);
      return buildDir;
    } catch {
      return null;
    }
  }

  /**
   * Get the .xctestrun file path
   */
  public async getXctestrunPath(platform?: XCTestServicePlatform): Promise<string | null> {
    const cacheKey = platform || "any";
    const cachedPath = this.cachedXctestrunPath.get(cacheKey);
    if (cachedPath) {
      try {
        await fs.access(cachedPath);
        return cachedPath;
      } catch {
        this.cachedXctestrunPath.set(cacheKey, null);
      }
    }

    const productsDir = path.join(this.config.derivedDataPath, "Build", "Products");
    try {
      const files = await fs.readdir(productsDir);
      const xctestrunFiles = files.filter(file => file.endsWith(".xctestrun"));
      if (xctestrunFiles.length === 0) {
        return null;
      }

      const match = platform
        ? xctestrunFiles.find(file => platform === "device"
          ? file.includes("iphoneos")
          : file.includes("iphonesimulator")
        )
        : null;

      const selected = platform ? match : xctestrunFiles[0];
      if (!selected) {
        return null;
      }

      const fullPath = path.join(productsDir, selected);
      this.cachedXctestrunPath.set(cacheKey, fullPath);
      return fullPath;
    } catch {
      return null;
    }
  }

  /**
   * Check if a download/extract is needed
   */
  public async needsRebuild(platform?: XCTestServicePlatform): Promise<boolean> {
    if (process.env.AUTOMOBILE_SKIP_XCTESTSERVICE_BUILD === "true" ||
        process.env.AUTOMOBILE_SKIP_XCTESTSERVICE_BUILD === "1") {
      logger.info("[XCTestServiceBuilder] Download skipped via AUTOMOBILE_SKIP_XCTESTSERVICE_BUILD");
      return false;
    }

    const xctestrunPath = await this.getXctestrunPath(platform);
    if (!xctestrunPath) {
      logger.info("[XCTestServiceBuilder] XCTestService artifacts missing, need download");
      return true;
    }

    const metadata = await this.readBundleMetadata();
    const expectedChecksum = this.getExpectedChecksum();
    if (expectedChecksum.length > 0) {
      if (!metadata || metadata.checksum?.toLowerCase() !== expectedChecksum.toLowerCase()) {
        logger.info("[XCTestServiceBuilder] XCTestService checksum mismatch, need download");
        return true;
      }
    } else if (!metadata || metadata.version !== XCTESTSERVICE_RELEASE_VERSION) {
      logger.info("[XCTestServiceBuilder] XCTestService version mismatch, need download");
      return true;
    }

    if (platform) {
      const expectedAppHash = this.getExpectedAppHash(platform);
      if (expectedAppHash) {
        const localHash = await this.getAppBundleHash(platform);
        if (!localHash || localHash.toLowerCase() !== expectedAppHash.toLowerCase()) {
          logger.info("[XCTestServiceBuilder] XCTestService app hash mismatch, need download");
          return true;
        }
        if (!metadata?.appHashes?.[platform]) {
          logger.info("[XCTestServiceBuilder] XCTestService app hash missing from metadata, need download");
          return true;
        }
      }
    }

    logger.info("[XCTestServiceBuilder] XCTestService artifacts are up to date");
    return false;
  }

  /**
   * Download and extract XCTestService release bundle
   */
  public async build(
    platform?: XCTestServicePlatform,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<XCTestServiceBuildResult> {
    perf.serial("xcTestServiceDownload");

    if (process.env.AUTOMOBILE_SKIP_XCTESTSERVICE_BUILD === "true" ||
        process.env.AUTOMOBILE_SKIP_XCTESTSERVICE_BUILD === "1") {
      perf.end();
      return {
        success: false,
        message: "XCTestService download skipped",
        error: "AUTOMOBILE_SKIP_XCTESTSERVICE_BUILD is set"
      };
    }

    try {
      const bundlePath = await perf.track("downloadBundle", () => this.ensureBundleDownloaded());
      await perf.track("extractBundle", () => this.extractBundle(bundlePath));

      // Clear cached paths to force rediscovery
      this.cachedBuildProductsPath.clear();
      this.cachedXctestrunPath.clear();
      this.cachedAppBundleHash.clear();

      const buildPath = await this.getBuildProductsPath(platform ?? "simulator");
      const xctestrunPath = await this.getXctestrunPath(platform);

      if (!xctestrunPath) {
        perf.end();
        return {
          success: false,
          message: "Downloaded XCTestService bundle missing xctestrun",
          error: "No .xctestrun file found after extraction"
        };
      }

      perf.end();
      return {
        success: true,
        message: "XCTestService downloaded and extracted successfully",
        buildPath: buildPath || undefined,
        xctestrunPath: xctestrunPath || undefined,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error("[XCTestServiceBuilder] Download failed:", errorMsg);

      perf.end();
      return {
        success: false,
        message: "XCTestService download failed",
        error: errorMsg,
      };
    }
  }

  /**
   * Prefetch download at startup (background, non-blocking)
   */
  public static prefetchBuild(): void {
    // Only run on macOS
    if (process.platform !== "darwin") {
      logger.info("[XCTestServiceBuilder] Prefetch skipped (not macOS)");
      return;
    }

    if (XCTestServiceBuilder.prefetchPromise !== null) {
      logger.info("[XCTestServiceBuilder] Prefetch already initiated, skipping");
      return;
    }

    if (process.env.AUTOMOBILE_SKIP_XCTESTSERVICE_BUILD === "true" ||
        process.env.AUTOMOBILE_SKIP_XCTESTSERVICE_BUILD === "1") {
      logger.info("[XCTestServiceBuilder] Prefetch skipped via environment variable");
      return;
    }

    logger.info("[XCTestServiceBuilder] Starting download prefetch");
    const startTime = Date.now();

    XCTestServiceBuilder.prefetchPromise = XCTestServiceBuilder.doPrefetch()
      .then(result => {
        const duration = Date.now() - startTime;
        if (result && result.success) {
          XCTestServiceBuilder.prefetchResult = result;
          logger.info(`[XCTestServiceBuilder] Prefetch completed in ${duration}ms`, {
            buildPath: result.buildPath,
          });
        } else {
          logger.info(`[XCTestServiceBuilder] Prefetch skipped or failed in ${duration}ms`, {
            message: result?.message,
          });
        }
        return result;
      })
      .catch(error => {
        const duration = Date.now() - startTime;
        XCTestServiceBuilder.prefetchError = error instanceof Error ? error : new Error(String(error));
        logger.warn(`[XCTestServiceBuilder] Prefetch failed after ${duration}ms`, {
          error: XCTestServiceBuilder.prefetchError.message,
        });
        return null;
      });
  }

  /**
   * Internal prefetch implementation
   */
  private static async doPrefetch(): Promise<XCTestServiceBuildResult | null> {
    const builder = XCTestServiceBuilder.getInstance();
    const needsDownload = await builder.needsRebuild();
    if (!needsDownload) {
      const buildPath = await builder.getBuildProductsPath();
      const xctestrunPath = await builder.getXctestrunPath();
      return {
        success: true,
        message: "XCTestService artifacts are up to date",
        buildPath: buildPath || undefined,
        xctestrunPath: xctestrunPath || undefined,
      };
    }

    return builder.build();
  }

  /**
   * Wait for prefetch to complete
   */
  public static async waitForPrefetch(): Promise<XCTestServiceBuildResult | null> {
    if (XCTestServiceBuilder.prefetchPromise === null) {
      return null;
    }

    try {
      await XCTestServiceBuilder.prefetchPromise;
      return XCTestServiceBuilder.prefetchResult;
    } catch {
      return null;
    }
  }

  /**
   * Get the prefetched build result (non-blocking)
   */
  public static getPrefetchedResult(): XCTestServiceBuildResult | null {
    return XCTestServiceBuilder.prefetchResult;
  }

  /**
   * Check if prefetch had an error
   */
  public static getPrefetchError(): Error | null {
    return XCTestServiceBuilder.prefetchError;
  }

  /**
   * Clean up build artifacts
   */
  public async cleanBuildArtifacts(): Promise<void> {
    try {
      await fs.rm(this.config.derivedDataPath, { recursive: true, force: true });
      this.cachedBuildProductsPath.clear();
      this.cachedXctestrunPath.clear();
      this.cachedAppBundleHash.clear();
      logger.info("[XCTestServiceBuilder] Build artifacts cleaned up");
    } catch (error) {
      logger.warn("[XCTestServiceBuilder] Failed to clean build artifacts:", error);
    }
  }

  /**
   * Get configuration for inspection
   */
  public getConfig(): XCTestServiceBuildConfig {
    return { ...this.config };
  }

  public async getAppBundlePath(platform: XCTestServicePlatform = "simulator"): Promise<string | null> {
    const buildPath = await this.getBuildProductsPath(platform);
    if (!buildPath) {
      return null;
    }
    const appPath = path.join(buildPath, "XCTestServiceApp.app");
    try {
      await fs.access(appPath);
      return appPath;
    } catch {
      return null;
    }
  }

  public async getAppBundleHash(platform: XCTestServicePlatform = "simulator"): Promise<string | null> {
    const cached = this.cachedAppBundleHash.get(platform);
    if (cached) {
      return cached;
    }
    const appPath = await this.getAppBundlePath(platform);
    if (!appPath) {
      return null;
    }
    try {
      const hash = await hashAppBundle(appPath);
      this.cachedAppBundleHash.set(platform, hash);
      return hash;
    } catch {
      return null;
    }
  }

  private getBundlePath(): string {
    return path.join(this.config.bundleCacheDir, XCTestServiceBuilder.DEFAULT_BUNDLE_FILENAME);
  }

  private getBundleUrl(): string {
    const override = process.env.AUTOMOBILE_XCTESTSERVICE_BUNDLE_URL?.trim();
    if (override) {
      return override;
    }
    return XCTESTSERVICE_IPA_URL;
  }

  private getBundlePathOverride(): string | null {
    const override = process.env.AUTOMOBILE_XCTESTSERVICE_IPA_PATH?.trim()
      || process.env.AUTOMOBILE_XCTESTSERVICE_BUNDLE_PATH?.trim();
    return override && override.length > 0 ? override : null;
  }

  private getExpectedChecksum(): string {
    const override = XCTestServiceBuilder.expectedChecksumOverride;
    return override ?? XCTESTSERVICE_SHA256_CHECKSUM ?? "";
  }

  public getExpectedAppHash(platform: XCTestServicePlatform): string {
    const envPlatform = platform.toUpperCase();
    const override = process.env[`AUTOMOBILE_XCTESTSERVICE_APP_HASH_${envPlatform}`]
      ?? process.env.AUTOMOBILE_XCTESTSERVICE_APP_HASH
      ?? process.env.AUTOMOBILE_IOS_XCTESTSERVICE_APP_HASH;
    if (override && override.trim().length > 0) {
      return override.trim();
    }
    return XCTESTSERVICE_APP_HASH ?? "";
  }

  private async ensureBundleDownloaded(): Promise<string> {
    await fs.mkdir(this.config.bundleCacheDir, { recursive: true });
    const bundlePath = this.getBundlePath();

    const overridePath = this.getBundlePathOverride();
    if (overridePath) {
      logger.info("[XCTestServiceBuilder] Using local XCTestService bundle override", { path: overridePath });
      const stats = await fs.stat(overridePath);
      if (!stats.isFile()) {
        throw new Error(`XCTestService bundle override is not a file: ${overridePath}`);
      }
      await fs.copyFile(overridePath, bundlePath);
    } else {
      const expectedChecksum = this.getExpectedChecksum();
      const metadata = await this.readBundleMetadata();
      const versionMismatch = !metadata || metadata.version !== XCTESTSERVICE_RELEASE_VERSION;
      const bundleReady = await this.isBundleValid(bundlePath, expectedChecksum);

      if (!bundleReady || (expectedChecksum.length === 0 && versionMismatch)) {
        logger.info("[XCTestServiceBuilder] Downloading XCTestService bundle", {
          url: this.getBundleUrl(),
          destination: bundlePath,
          reason: bundleReady ? "version-mismatch" : "missing-or-invalid"
        });
        await this.downloader.download(this.getBundleUrl(), bundlePath);
      }
    }

    await this.verifyBundle(bundlePath);
    return bundlePath;
  }

  private async isBundleValid(bundlePath: string, expectedChecksum: string): Promise<boolean> {
    try {
      const stats = await fs.stat(bundlePath);
      if (!stats.isFile() || stats.size < XCTestServiceBuilder.MIN_BUNDLE_SIZE_BYTES) {
        return false;
      }
    } catch {
      return false;
    }

    if (!expectedChecksum) {
      return true;
    }

    const { checksum } = await this.downloader.computeFileSha256(bundlePath);
    return checksum.toLowerCase() === expectedChecksum.toLowerCase();
  }

  private async verifyBundle(bundlePath: string): Promise<void> {
    const stats = await fs.stat(bundlePath);
    if (stats.size < XCTestServiceBuilder.MIN_BUNDLE_SIZE_BYTES) {
      throw new Error(`Downloaded bundle is too small (${stats.size} bytes), likely invalid`);
    }

    const expectedChecksum = this.getExpectedChecksum();
    if (expectedChecksum.length > 0) {
      const { checksum, source } = await this.downloader.computeFileSha256(bundlePath);
      if (checksum.toLowerCase() !== expectedChecksum.toLowerCase()) {
        throw new Error(`XCTestService checksum verification failed. Expected: ${expectedChecksum}, Got: ${checksum}`);
      }
      logger.info("[XCTestServiceBuilder] Bundle checksum verified", { checksum, source });
    } else {
      logger.warn("[XCTestServiceBuilder] Bundle checksum verification skipped (no checksum provided)");
    }
  }

  private async extractBundle(bundlePath: string): Promise<void> {
    await this.downloader.extractBundle(bundlePath, this.config.derivedDataPath);
    await this.normalizeExtractedBundle();
    await this.verifyExtractedArtifacts();

    const appHashes = await this.computeAppHashes();
    const metadata: XCTestServiceBundleMetadata = {
      checksum: this.getExpectedChecksum() || null,
      version: XCTESTSERVICE_RELEASE_VERSION,
      extractedAt: new Date().toISOString(),
      appHashes
    };
    await fs.writeFile(this.getMetadataPath(), JSON.stringify(metadata, null, 2), "utf-8");
  }

  private async readBundleMetadata(): Promise<XCTestServiceBundleMetadata | null> {
    try {
      const raw = await fs.readFile(this.getMetadataPath(), "utf-8");
      return JSON.parse(raw) as XCTestServiceBundleMetadata;
    } catch {
      return null;
    }
  }

  private getMetadataPath(): string {
    return path.join(this.config.bundleCacheDir, XCTestServiceBuilder.METADATA_FILENAME);
  }

  private async normalizeExtractedBundle(): Promise<void> {
    const xctestrunFiles = await this.findXctestrunFiles(this.config.derivedDataPath);
    if (xctestrunFiles.length === 0) {
      throw new Error("No .xctestrun file found in extracted XCTestService bundle");
    }

    const derivedRoot = this.resolveDerivedDataRoot(xctestrunFiles[0]);
    if (!derivedRoot) {
      return;
    }

    if (derivedRoot === this.config.derivedDataPath) {
      return;
    }

    const sourceBuildDir = path.join(derivedRoot, "Build");
    const targetBuildDir = path.join(this.config.derivedDataPath, "Build");

    await fs.rm(targetBuildDir, { recursive: true, force: true });
    await fs.mkdir(this.config.derivedDataPath, { recursive: true });

    try {
      await fs.rename(sourceBuildDir, targetBuildDir);
    } catch {
      await fs.cp(sourceBuildDir, targetBuildDir, { recursive: true });
      await fs.rm(sourceBuildDir, { recursive: true, force: true });
    }
  }

  private async verifyExtractedArtifacts(): Promise<void> {
    const simXctestrun = await this.getXctestrunPath("simulator");
    const deviceXctestrun = await this.getXctestrunPath("device");

    if (!simXctestrun && !deviceXctestrun) {
      throw new Error("Extracted XCTestService bundle missing .xctestrun file");
    }

    if (simXctestrun) {
      await this.verifyPlatformArtifacts("simulator");
    }

    if (deviceXctestrun) {
      await this.verifyPlatformArtifacts("device");
    }
  }

  private async verifyPlatformArtifacts(platform: XCTestServicePlatform): Promise<void> {
    const buildDir = await this.getBuildProductsPath(platform);
    if (!buildDir) {
      throw new Error(`XCTestService build products missing for ${platform}`);
    }

    const requiredPaths = [
      path.join(buildDir, "XCTestServiceApp.app"),
      path.join(buildDir, "XCTestServiceUITests-Runner.app"),
      path.join(buildDir, "XCTestServiceTests.xctest")
    ];

    for (const requiredPath of requiredPaths) {
      try {
        await fs.access(requiredPath);
      } catch {
        throw new Error(`XCTestService bundle missing required artifact: ${requiredPath}`);
      }
    }

    const expectedAppHash = this.getExpectedAppHash(platform);
    if (expectedAppHash) {
      const localHash = await this.getAppBundleHash(platform);
      if (!localHash) {
        throw new Error(`XCTestService app hash unavailable for ${platform}`);
      }
      if (localHash.toLowerCase() !== expectedAppHash.toLowerCase()) {
        throw new Error(`XCTestService app hash mismatch for ${platform}. Expected: ${expectedAppHash}, Got: ${localHash}`);
      }
      logger.info("[XCTestServiceBuilder] App bundle hash verified", { platform, hash: localHash });
    } else {
      logger.warn(`[XCTestServiceBuilder] App bundle hash verification skipped for ${platform} (no hash provided)`);
    }
  }

  private async computeAppHashes(): Promise<Partial<Record<XCTestServicePlatform, string>>> {
    const hashes: Partial<Record<XCTestServicePlatform, string>> = {};
    const simulatorHash = await this.getAppBundleHash("simulator");
    if (simulatorHash) {
      hashes.simulator = simulatorHash;
    }
    const deviceHash = await this.getAppBundleHash("device");
    if (deviceHash) {
      hashes.device = deviceHash;
    }
    return hashes;
  }

  private resolveDerivedDataRoot(xctestrunPath: string): string | null {
    const segments = path.resolve(xctestrunPath).split(path.sep);
    for (let i = 0; i < segments.length - 1; i++) {
      if (segments[i] === "Build" && segments[i + 1] === "Products") {
        return segments.slice(0, i).join(path.sep);
      }
    }
    return null;
  }

  private async findXctestrunFiles(root: string): Promise<string[]> {
    const results: string[] = [];
    const stack: string[] = [root];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) {
        continue;
      }
      let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
      try {
        entries = await fs.readdir(current, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".xctestrun")) {
          results.push(fullPath);
        }
      }
    }

    return results;
  }
}
