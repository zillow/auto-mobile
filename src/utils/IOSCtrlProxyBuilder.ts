import * as fs from "fs/promises";
import * as path from "path";
import os from "os";
import { logger } from "./logger";
import { defaultTimer, type Timer } from "./SystemTimer";
import { NoOpPerformanceTracker, type PerformanceTracker } from "./PerformanceTracker";
import {
  IOS_CTRL_PROXY_APP_HASH,
  IOS_CTRL_PROXY_IPA_URL,
  IOS_CTRL_PROXY_RELEASE_VERSION,
  IOS_CTRL_PROXY_RUNNER_SHA256,
  IOS_CTRL_PROXY_SHA256_CHECKSUM
} from "../constants/release";
import {
  DefaultIOSCtrlProxyBundleDownloader,
  type CtrlProxyIosBundleDownloader
} from "./IOSCtrlProxyBundleDownloader";
import { hashAppBundle } from "./ios-cmdline-tools/AppBundleHasher";

/**
 * Result of CtrlProxy download/install
 */
export interface CtrlProxyIosBuildResult {
  success: boolean;
  message: string;
  buildPath?: string;      // Path to build products
  xctestrunPath?: string;  // Path to .xctestrun file
  error?: string;
}

/**
 * CtrlProxy Build Configuration
 */
export interface CtrlProxyIosBuildConfig {
  projectRoot: string;
  derivedDataPath: string;
  scheme: string;
  destination: string;
  bundleCacheDir: string;
}

export interface CtrlProxyIosBuilderDependencies {
  downloader?: CtrlProxyIosBundleDownloader;
}

type IOSCtrlProxyPlatform = "simulator" | "device";

type IOSCtrlProxyBundleMetadata = {
  checksum: string | null;
  version: string;
  extractedAt: string;
  appHashes?: Partial<Record<IOSCtrlProxyPlatform, string>>;
};

/**
 * CtrlProxy Builder
 * Handles release bundle download and extraction for CtrlProxy
 */
export class IOSCtrlProxyBuilder {
  private static readonly DEFAULT_PROJECT_ROOT = process.cwd();
  private static readonly DEFAULT_DERIVED_DATA_PATH = "/tmp/automobile-ctrl-proxy";
  private static readonly DEFAULT_SCHEME = "CtrlProxyApp";
  private static readonly DEFAULT_DESTINATION = "generic/platform=iOS Simulator";
  private static readonly DEFAULT_BUNDLE_CACHE_DIR = path.join(os.homedir(), ".automobile", "ctrl-proxy-ios");
  private static readonly DEFAULT_BUNDLE_FILENAME = "control-proxy.ipa";
  private static readonly METADATA_FILENAME = "ctrl-proxy-ios-bundle.json";
  private static readonly MIN_BUNDLE_SIZE_BYTES = 10000;

  // Build state
  private static prefetchPromise: Promise<CtrlProxyIosBuildResult | null> | null = null;
  private static prefetchResult: CtrlProxyIosBuildResult | null = null;
  private static prefetchError: Error | null = null;
  private static expectedChecksumOverride: string | null = null;
  private static timer: Timer = defaultTimer;

  // Singleton instances per configuration
  private static instances: Map<string, IOSCtrlProxyBuilder> = new Map();

  private readonly config: CtrlProxyIosBuildConfig;
  private readonly downloader: CtrlProxyIosBundleDownloader;
  /**
   * NOT using TTLCache: file-existence validation via fs.access(), not time-based.
   * Cache is invalidated when files are re-extracted, not after a TTL.
   */
  private cachedBuildProductsPath: Map<IOSCtrlProxyPlatform, string | null> = new Map();
  /**
   * NOT using TTLCache: file-existence validation via fs.access(), not time-based.
   * Cache is invalidated when files are re-extracted, not after a TTL.
   */
  private cachedXctestrunPath: Map<string, string | null> = new Map();
  /**
   * NOT using TTLCache: file-existence validation via fs.access(), not time-based.
   * Hash is computed once per build and cached until next build/extraction.
   */
  private cachedAppBundleHash: Map<IOSCtrlProxyPlatform, string | null> = new Map();

  private constructor(
    config: Partial<CtrlProxyIosBuildConfig> = {},
    dependencies: CtrlProxyIosBuilderDependencies = {}
  ) {
    this.config = {
      projectRoot: config.projectRoot || process.env.AUTOMOBILE_PROJECT_ROOT || IOSCtrlProxyBuilder.DEFAULT_PROJECT_ROOT,
      derivedDataPath: config.derivedDataPath || process.env.AUTOMOBILE_CTRL_PROXY_IOS_DERIVED_DATA || IOSCtrlProxyBuilder.DEFAULT_DERIVED_DATA_PATH,
      scheme: config.scheme || IOSCtrlProxyBuilder.DEFAULT_SCHEME,
      destination: config.destination || IOSCtrlProxyBuilder.DEFAULT_DESTINATION,
      bundleCacheDir: config.bundleCacheDir || process.env.AUTOMOBILE_CTRL_PROXY_IOS_CACHE_DIR || IOSCtrlProxyBuilder.DEFAULT_BUNDLE_CACHE_DIR,
    };
    this.downloader = dependencies.downloader ?? new DefaultIOSCtrlProxyBundleDownloader();
  }

  /**
   * Get singleton instance for default configuration
   */
  public static getInstance(
    config?: Partial<CtrlProxyIosBuildConfig>,
    dependencies?: CtrlProxyIosBuilderDependencies
  ): IOSCtrlProxyBuilder {
    const key = JSON.stringify({
      config: config || {},
      deps: dependencies?.downloader ? "custom" : "default"
    });
    if (!IOSCtrlProxyBuilder.instances.has(key)) {
      IOSCtrlProxyBuilder.instances.set(key, new IOSCtrlProxyBuilder(config, dependencies));
    }
    return IOSCtrlProxyBuilder.instances.get(key)!;
  }

  /**
   * Reset all instances (for testing)
   */
  public static resetInstances(): void {
    IOSCtrlProxyBuilder.instances.clear();
    IOSCtrlProxyBuilder.prefetchPromise = null;
    IOSCtrlProxyBuilder.prefetchResult = null;
    IOSCtrlProxyBuilder.prefetchError = null;
    IOSCtrlProxyBuilder.expectedChecksumOverride = null;
    IOSCtrlProxyBuilder.timer = defaultTimer;
  }

  /**
   * Override the timer for testing
   */
  public static setTimerForTesting(timer: Timer): void {
    IOSCtrlProxyBuilder.timer = timer;
  }

  /**
   * Override checksum for tests
   */
  public static setExpectedChecksumForTesting(checksum: string | null): void {
    IOSCtrlProxyBuilder.expectedChecksumOverride = checksum;
  }

  /**
   * Get the build products directory path
   */
  public async getBuildProductsPath(platform: IOSCtrlProxyPlatform = "simulator"): Promise<string | null> {
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
  public async getXctestrunPath(platform?: IOSCtrlProxyPlatform): Promise<string | null> {
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
  public async needsRebuild(platform?: IOSCtrlProxyPlatform): Promise<boolean> {
    if (process.env.AUTOMOBILE_SKIP_CTRL_PROXY_IOS_BUILD === "true" ||
        process.env.AUTOMOBILE_SKIP_CTRL_PROXY_IOS_BUILD === "1") {
      logger.info("[IOSCtrlProxyBuilder] Download skipped via AUTOMOBILE_SKIP_CTRL_PROXY_IOS_BUILD");
      return false;
    }

    const xctestrunPath = await this.getXctestrunPath(platform);
    if (!xctestrunPath) {
      logger.info("[IOSCtrlProxyBuilder] CtrlProxy artifacts missing, need download");
      return true;
    }

    const metadata = await this.readBundleMetadata();
    const expectedChecksum = this.getExpectedChecksum();
    if (expectedChecksum.length > 0) {
      if (!metadata || metadata.checksum?.toLowerCase() !== expectedChecksum.toLowerCase()) {
        logger.info("[IOSCtrlProxyBuilder] CtrlProxy checksum mismatch, need download");
        return true;
      }
    } else if (!metadata || metadata.version !== IOS_CTRL_PROXY_RELEASE_VERSION) {
      logger.info("[IOSCtrlProxyBuilder] CtrlProxy version mismatch, need download");
      return true;
    }

    if (platform) {
      const expectedAppHash = this.getExpectedAppHash(platform);
      if (expectedAppHash) {
        const localHash = await this.getAppBundleHash(platform);
        if (!localHash || localHash.toLowerCase() !== expectedAppHash.toLowerCase()) {
          logger.info("[IOSCtrlProxyBuilder] CtrlProxy app hash mismatch, need download");
          return true;
        }
        if (!metadata?.appHashes?.[platform]) {
          logger.info("[IOSCtrlProxyBuilder] CtrlProxy app hash missing from metadata, need download");
          return true;
        }
      }
    }

    logger.info("[IOSCtrlProxyBuilder] CtrlProxy artifacts are up to date");
    return false;
  }

  /**
   * Download and extract CtrlProxy release bundle
   */
  public async build(
    platform?: IOSCtrlProxyPlatform,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<CtrlProxyIosBuildResult> {
    perf.serial("xcTestServiceDownload");

    if (process.env.AUTOMOBILE_SKIP_CTRL_PROXY_IOS_BUILD === "true" ||
        process.env.AUTOMOBILE_SKIP_CTRL_PROXY_IOS_BUILD === "1") {
      perf.end();
      return {
        success: false,
        message: "CtrlProxy download skipped",
        error: "AUTOMOBILE_SKIP_CTRL_PROXY_IOS_BUILD is set"
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
          message: "Downloaded CtrlProxy bundle missing xctestrun",
          error: "No .xctestrun file found after extraction"
        };
      }

      perf.end();
      return {
        success: true,
        message: "CtrlProxy downloaded and extracted successfully",
        buildPath: buildPath || undefined,
        xctestrunPath: xctestrunPath || undefined,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error("[IOSCtrlProxyBuilder] Download failed:", errorMsg);

      perf.end();
      return {
        success: false,
        message: "CtrlProxy download failed",
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
      logger.info("[IOSCtrlProxyBuilder] Prefetch skipped (not macOS)");
      return;
    }

    if (IOSCtrlProxyBuilder.prefetchPromise !== null) {
      logger.info("[IOSCtrlProxyBuilder] Prefetch already initiated, skipping");
      return;
    }

    if (process.env.AUTOMOBILE_SKIP_CTRL_PROXY_IOS_BUILD === "true" ||
        process.env.AUTOMOBILE_SKIP_CTRL_PROXY_IOS_BUILD === "1") {
      logger.info("[IOSCtrlProxyBuilder] Prefetch skipped via environment variable");
      return;
    }

    logger.info("[IOSCtrlProxyBuilder] Starting download prefetch");
    const startTime = IOSCtrlProxyBuilder.timer.now();

    IOSCtrlProxyBuilder.prefetchPromise = IOSCtrlProxyBuilder.doPrefetch()
      .then(result => {
        const duration = IOSCtrlProxyBuilder.timer.now() - startTime;
        if (result && result.success) {
          IOSCtrlProxyBuilder.prefetchResult = result;
          logger.info(`[IOSCtrlProxyBuilder] Prefetch completed in ${duration}ms`, {
            buildPath: result.buildPath,
          });
        } else {
          logger.info(`[IOSCtrlProxyBuilder] Prefetch skipped or failed in ${duration}ms`, {
            message: result?.message,
          });
        }
        return result;
      })
      .catch(error => {
        const duration = IOSCtrlProxyBuilder.timer.now() - startTime;
        IOSCtrlProxyBuilder.prefetchError = error instanceof Error ? error : new Error(String(error));
        logger.warn(`[IOSCtrlProxyBuilder] Prefetch failed after ${duration}ms`, {
          error: IOSCtrlProxyBuilder.prefetchError.message,
        });
        return null;
      });
  }

  /**
   * Internal prefetch implementation
   */
  private static async doPrefetch(): Promise<CtrlProxyIosBuildResult | null> {
    const builder = IOSCtrlProxyBuilder.getInstance();
    const needsDownload = await builder.needsRebuild();
    if (!needsDownload) {
      const buildPath = await builder.getBuildProductsPath();
      const xctestrunPath = await builder.getXctestrunPath();
      return {
        success: true,
        message: "CtrlProxy artifacts are up to date",
        buildPath: buildPath || undefined,
        xctestrunPath: xctestrunPath || undefined,
      };
    }

    return builder.build();
  }

  /**
   * Wait for prefetch to complete
   */
  public static async waitForPrefetch(): Promise<CtrlProxyIosBuildResult | null> {
    if (IOSCtrlProxyBuilder.prefetchPromise === null) {
      return null;
    }

    try {
      await IOSCtrlProxyBuilder.prefetchPromise;
      return IOSCtrlProxyBuilder.prefetchResult;
    } catch {
      return null;
    }
  }

  /**
   * Get the prefetched build result (non-blocking)
   */
  public static getPrefetchedResult(): CtrlProxyIosBuildResult | null {
    return IOSCtrlProxyBuilder.prefetchResult;
  }

  /**
   * Check if prefetch had an error
   */
  public static getPrefetchError(): Error | null {
    return IOSCtrlProxyBuilder.prefetchError;
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
      logger.info("[IOSCtrlProxyBuilder] Build artifacts cleaned up");
    } catch (error) {
      logger.warn("[IOSCtrlProxyBuilder] Failed to clean build artifacts:", error);
    }
  }

  /**
   * Get configuration for inspection
   */
  public getConfig(): CtrlProxyIosBuildConfig {
    return { ...this.config };
  }

  public async getAppBundlePath(platform: IOSCtrlProxyPlatform = "simulator"): Promise<string | null> {
    const buildPath = await this.getBuildProductsPath(platform);
    if (!buildPath) {
      return null;
    }
    const appPath = path.join(buildPath, "CtrlProxyApp.app");
    try {
      await fs.access(appPath);
      return appPath;
    } catch {
      return null;
    }
  }

  public async getAppBundleHash(platform: IOSCtrlProxyPlatform = "simulator"): Promise<string | null> {
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

  /**
   * Get the runner binary path for simctl spawn
   * Returns: <buildPath>/CtrlProxyUITests-Runner.app/CtrlProxyUITests-Runner
   */
  public async getRunnerBinaryPath(platform: IOSCtrlProxyPlatform = "simulator"): Promise<string | null> {
    const buildPath = await this.getBuildProductsPath(platform);
    if (!buildPath) {
      return null;
    }
    const runnerBinaryPath = path.join(buildPath, "CtrlProxyUITests-Runner.app", "CtrlProxyUITests-Runner");
    try {
      await fs.access(runnerBinaryPath);
      return runnerBinaryPath;
    } catch {
      return null;
    }
  }

  private getBundlePath(): string {
    return path.join(this.config.bundleCacheDir, IOSCtrlProxyBuilder.DEFAULT_BUNDLE_FILENAME);
  }

  private getBundleUrl(): string {
    const override = process.env.AUTOMOBILE_CTRL_PROXY_IOS_BUNDLE_URL?.trim();
    if (override) {
      return override;
    }
    return IOS_CTRL_PROXY_IPA_URL;
  }

  private getBundlePathOverride(): string | null {
    const override = process.env.AUTOMOBILE_CTRL_PROXY_IOS_IPA_PATH?.trim()
      || process.env.AUTOMOBILE_CTRL_PROXY_IOS_BUNDLE_PATH?.trim();
    return override && override.length > 0 ? override : null;
  }

  private getExpectedChecksum(): string {
    const override = IOSCtrlProxyBuilder.expectedChecksumOverride;
    return override ?? IOS_CTRL_PROXY_SHA256_CHECKSUM ?? "";
  }

  public getExpectedAppHash(platform: IOSCtrlProxyPlatform): string {
    const envPlatform = platform.toUpperCase();
    // Check for platform-specific override first
    const platformOverride = process.env[`AUTOMOBILE_IOS_CTRL_PROXY_APP_HASH_${envPlatform}`];
    if (platformOverride && platformOverride.trim().length > 0) {
      return platformOverride.trim();
    }
    // For device platform, check generic overrides and the release constant (device build hash)
    if (platform === "device") {
      const genericOverride = process.env.AUTOMOBILE_IOS_CTRL_PROXY_APP_HASH
        ?? process.env.AUTOMOBILE_IOS_IOS_CTRL_PROXY_APP_HASH;
      if (genericOverride && genericOverride.trim().length > 0) {
        return genericOverride.trim();
      }
      // IOS_CTRL_PROXY_APP_HASH is documented as the device build hash
      return IOS_CTRL_PROXY_APP_HASH || "";
    }
    // For simulator, only use platform-specific override (already checked above)
    // Skip verification if no simulator-specific hash is provided
    return "";
  }

  private async ensureBundleDownloaded(): Promise<string> {
    await fs.mkdir(this.config.bundleCacheDir, { recursive: true });
    const bundlePath = this.getBundlePath();

    const overridePath = this.getBundlePathOverride();
    if (overridePath) {
      logger.info("[IOSCtrlProxyBuilder] Using local CtrlProxy bundle override", { path: overridePath });
      const stats = await fs.stat(overridePath);
      if (!stats.isFile()) {
        throw new Error(`CtrlProxy bundle override is not a file: ${overridePath}`);
      }
      await fs.copyFile(overridePath, bundlePath);
    } else {
      const expectedChecksum = this.getExpectedChecksum();
      const metadata = await this.readBundleMetadata();
      const versionMismatch = !metadata || metadata.version !== IOS_CTRL_PROXY_RELEASE_VERSION;
      const bundleReady = await this.isBundleValid(bundlePath, expectedChecksum);

      if (!bundleReady || (expectedChecksum.length === 0 && versionMismatch)) {
        logger.info("[IOSCtrlProxyBuilder] Downloading CtrlProxy bundle", {
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
      if (!stats.isFile() || stats.size < IOSCtrlProxyBuilder.MIN_BUNDLE_SIZE_BYTES) {
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
    if (stats.size < IOSCtrlProxyBuilder.MIN_BUNDLE_SIZE_BYTES) {
      throw new Error(`Downloaded bundle is too small (${stats.size} bytes), likely invalid`);
    }

    const expectedChecksum = this.getExpectedChecksum();
    if (expectedChecksum.length > 0) {
      const { checksum, source } = await this.downloader.computeFileSha256(bundlePath);
      if (checksum.toLowerCase() !== expectedChecksum.toLowerCase()) {
        throw new Error(`CtrlProxy checksum verification failed. Expected: ${expectedChecksum}, Got: ${checksum}`);
      }
      logger.info("[IOSCtrlProxyBuilder] Bundle checksum verified", { checksum, source });
    } else {
      logger.warn("[IOSCtrlProxyBuilder] Bundle checksum verification skipped (no checksum provided)");
    }
  }

  private async extractBundle(bundlePath: string): Promise<void> {
    await this.downloader.extractBundle(bundlePath, this.config.derivedDataPath);
    await this.normalizeExtractedBundle();
    await this.verifyExtractedArtifacts();

    const appHashes = await this.computeAppHashes();
    const metadata: IOSCtrlProxyBundleMetadata = {
      checksum: this.getExpectedChecksum() || null,
      version: IOS_CTRL_PROXY_RELEASE_VERSION,
      extractedAt: new Date().toISOString(),
      appHashes
    };
    await fs.writeFile(this.getMetadataPath(), JSON.stringify(metadata, null, 2), "utf-8");
  }

  private async readBundleMetadata(): Promise<IOSCtrlProxyBundleMetadata | null> {
    try {
      const raw = await fs.readFile(this.getMetadataPath(), "utf-8");
      return JSON.parse(raw) as IOSCtrlProxyBundleMetadata;
    } catch {
      return null;
    }
  }

  private getMetadataPath(): string {
    return path.join(this.config.bundleCacheDir, IOSCtrlProxyBuilder.METADATA_FILENAME);
  }

  private async normalizeExtractedBundle(): Promise<void> {
    const xctestrunFiles = await this.findXctestrunFiles(this.config.derivedDataPath);
    if (xctestrunFiles.length === 0) {
      throw new Error("No .xctestrun file found in extracted CtrlProxy bundle");
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
      throw new Error("Extracted CtrlProxy bundle missing .xctestrun file");
    }

    if (simXctestrun) {
      await this.verifyPlatformArtifacts("simulator");
    }

    if (deviceXctestrun) {
      await this.verifyPlatformArtifacts("device");
    }
  }

  private async verifyPlatformArtifacts(platform: IOSCtrlProxyPlatform): Promise<void> {
    const buildDir = await this.getBuildProductsPath(platform);
    if (!buildDir) {
      throw new Error(`CtrlProxy build products missing for ${platform}`);
    }

    const requiredPaths = [
      path.join(buildDir, "CtrlProxyApp.app"),
      path.join(buildDir, "CtrlProxyUITests-Runner.app"),
      path.join(buildDir, "CtrlProxyTests.xctest")
    ];

    for (const requiredPath of requiredPaths) {
      try {
        await fs.access(requiredPath);
      } catch {
        throw new Error(`CtrlProxy bundle missing required artifact: ${requiredPath}`);
      }
    }

    const expectedAppHash = this.getExpectedAppHash(platform);
    if (expectedAppHash) {
      const localHash = await this.getAppBundleHash(platform);
      if (!localHash) {
        throw new Error(`CtrlProxy app hash unavailable for ${platform}`);
      }
      if (localHash.toLowerCase() !== expectedAppHash.toLowerCase()) {
        throw new Error(`CtrlProxy app hash mismatch for ${platform}. Expected: ${expectedAppHash}, Got: ${localHash}`);
      }
      logger.info("[IOSCtrlProxyBuilder] App bundle hash verified", { platform, hash: localHash });
    } else {
      logger.warn(`[IOSCtrlProxyBuilder] App bundle hash verification skipped for ${platform} (no hash provided)`);
    }

    // Verify runner binary SHA256 for simulator (used by simctl spawn)
    if (platform === "simulator") {
      const expectedRunnerSha256 = IOS_CTRL_PROXY_RUNNER_SHA256;
      if (expectedRunnerSha256 && expectedRunnerSha256.length > 0) {
        const runnerBinaryPath = await this.getRunnerBinaryPath(platform);
        if (!runnerBinaryPath) {
          throw new Error(`CtrlProxy runner binary missing for ${platform}`);
        }
        const { checksum } = await this.downloader.computeFileSha256(runnerBinaryPath);
        if (checksum.toLowerCase() !== expectedRunnerSha256.toLowerCase()) {
          throw new Error(`CtrlProxy runner binary SHA256 mismatch for ${platform}. Expected: ${expectedRunnerSha256}, Got: ${checksum}`);
        }
        logger.info("[IOSCtrlProxyBuilder] Runner binary SHA256 verified", { platform, checksum });
      } else {
        logger.warn(`[IOSCtrlProxyBuilder] Runner binary SHA256 verification skipped for ${platform} (no hash provided)`);
      }
    }
  }

  private async computeAppHashes(): Promise<Partial<Record<IOSCtrlProxyPlatform, string>>> {
    const hashes: Partial<Record<IOSCtrlProxyPlatform, string>> = {};
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
