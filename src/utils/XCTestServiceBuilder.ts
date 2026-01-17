import { logger } from "./logger";
import { NoOpPerformanceTracker, type PerformanceTracker } from "./PerformanceTracker";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import { glob } from "glob";

const execAsync = promisify(exec);

/**
 * Result of XCTestService build
 */
export interface XCTestServiceBuildResult {
  success: boolean;
  message: string;
  buildPath?: string;      // Path to built products
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
}

/**
 * XCTestService Builder
 * Handles build detection, project generation, and xcodebuild orchestration for XCTestService
 */
export class XCTestServiceBuilder {
  // Source paths to monitor for changes (relative to project root)
  private static readonly SOURCE_PATTERNS = [
    "ios/XCTestService/Sources/**/*.swift",
    "ios/XCTestService/Tests/**/*.swift",
    "ios/XCTestService/project.yml",
    "ios/XCTestService/XCTestServiceApp/**/*.swift",
  ];

  // Default paths
  private static readonly DEFAULT_PROJECT_ROOT = process.cwd();
  private static readonly DEFAULT_DERIVED_DATA_PATH = "/tmp/automobile-xctestservice";
  private static readonly DEFAULT_SCHEME = "XCTestServiceApp";
  private static readonly DEFAULT_DESTINATION = "generic/platform=iOS Simulator";

  // Build state
  private static prefetchPromise: Promise<XCTestServiceBuildResult | null> | null = null;
  private static prefetchResult: XCTestServiceBuildResult | null = null;
  private static prefetchError: Error | null = null;

  // Singleton instances per configuration
  private static instances: Map<string, XCTestServiceBuilder> = new Map();

  private readonly config: XCTestServiceBuildConfig;
  private cachedBuildProductsPath: string | null = null;
  private cachedXctestrunPath: string | null = null;

  private constructor(config: Partial<XCTestServiceBuildConfig> = {}) {
    this.config = {
      projectRoot: config.projectRoot || process.env.AUTOMOBILE_PROJECT_ROOT || XCTestServiceBuilder.DEFAULT_PROJECT_ROOT,
      derivedDataPath: config.derivedDataPath || process.env.AUTOMOBILE_XCTESTSERVICE_DERIVED_DATA || XCTestServiceBuilder.DEFAULT_DERIVED_DATA_PATH,
      scheme: config.scheme || XCTestServiceBuilder.DEFAULT_SCHEME,
      destination: config.destination || XCTestServiceBuilder.DEFAULT_DESTINATION,
    };
  }

  /**
   * Get singleton instance for default configuration
   */
  public static getInstance(config?: Partial<XCTestServiceBuildConfig>): XCTestServiceBuilder {
    const key = JSON.stringify(config || {});
    if (!XCTestServiceBuilder.instances.has(key)) {
      XCTestServiceBuilder.instances.set(key, new XCTestServiceBuilder(config));
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
  }

  /**
   * Check if Xcode is installed
   */
  private async checkXcodeInstalled(): Promise<boolean> {
    try {
      await execAsync("xcode-select -p");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the XCTestService project directory
   */
  private getProjectDir(): string {
    return path.join(this.config.projectRoot, "ios", "XCTestService");
  }

  /**
   * Get the newest mtime from source files
   */
  private async getNewestSourceMtime(): Promise<number> {
    let newestMtime = 0;

    for (const pattern of XCTestServiceBuilder.SOURCE_PATTERNS) {
      const fullPattern = path.join(this.config.projectRoot, pattern);
      try {
        const files = await glob(fullPattern);
        for (const file of files) {
          try {
            const stats = await fs.stat(file);
            if (stats.mtimeMs > newestMtime) {
              newestMtime = stats.mtimeMs;
            }
          } catch {
            // File might have been deleted, skip
          }
        }
      } catch {
        // Pattern might not match anything, skip
      }
    }

    return newestMtime;
  }

  /**
   * Get the build products directory path
   */
  public async getBuildProductsPath(): Promise<string | null> {
    if (this.cachedBuildProductsPath) {
      try {
        await fs.access(this.cachedBuildProductsPath);
        return this.cachedBuildProductsPath;
      } catch {
        this.cachedBuildProductsPath = null;
      }
    }

    const buildDir = path.join(
      this.config.derivedDataPath,
      "Build",
      "Products",
      "Debug-iphonesimulator"
    );

    try {
      await fs.access(buildDir);
      this.cachedBuildProductsPath = buildDir;
      return buildDir;
    } catch {
      return null;
    }
  }

  /**
   * Get the test runner app path
   */
  private async getTestRunnerAppPath(): Promise<string | null> {
    const buildDir = await this.getBuildProductsPath();
    if (!buildDir) {
      return null;
    }

    const runnerPath = path.join(buildDir, "XCTestServiceUITests-Runner.app");
    try {
      await fs.access(runnerPath);
      return runnerPath;
    } catch {
      return null;
    }
  }

  /**
   * Get the mtime of the build product
   */
  private async getBuildProductMtime(): Promise<number> {
    const runnerPath = await this.getTestRunnerAppPath();
    if (!runnerPath) {
      return 0;
    }

    try {
      const stats = await fs.stat(runnerPath);
      return stats.mtimeMs;
    } catch {
      return 0;
    }
  }

  /**
   * Get the .xctestrun file path
   */
  public async getXctestrunPath(): Promise<string | null> {
    if (this.cachedXctestrunPath) {
      try {
        await fs.access(this.cachedXctestrunPath);
        return this.cachedXctestrunPath;
      } catch {
        this.cachedXctestrunPath = null;
      }
    }

    const buildDir = await this.getBuildProductsPath();
    if (!buildDir) {
      return null;
    }

    // Look for .xctestrun files in the build products directory
    const productsDir = path.dirname(buildDir);
    try {
      const files = await fs.readdir(productsDir);
      const xctestrunFile = files.find(f => f.endsWith(".xctestrun"));
      if (xctestrunFile) {
        const fullPath = path.join(productsDir, xctestrunFile);
        this.cachedXctestrunPath = fullPath;
        return fullPath;
      }
    } catch {
      // Directory might not exist
    }

    return null;
  }

  /**
   * Check if project.yml is newer than the xcodeproj
   */
  private async needsProjectGeneration(): Promise<boolean> {
    const projectDir = this.getProjectDir();
    const projectYml = path.join(projectDir, "project.yml");
    const xcodeproj = path.join(projectDir, "XCTestService.xcodeproj", "project.pbxproj");

    try {
      const [ymlStats, projStats] = await Promise.all([
        fs.stat(projectYml),
        fs.stat(xcodeproj).catch(() => null),
      ]);

      // If xcodeproj doesn't exist, need generation
      if (!projStats) {
        return true;
      }

      // If project.yml is newer, need regeneration
      return ymlStats.mtimeMs > projStats.mtimeMs;
    } catch {
      // If project.yml doesn't exist, don't need generation (manual project)
      return false;
    }
  }

  /**
   * Check if xcodegen is available
   */
  private async isXcodegenAvailable(): Promise<boolean> {
    try {
      await execAsync("which xcodegen");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Run xcodegen to generate the Xcode project
   */
  private async runXcodegen(perf?: PerformanceTracker): Promise<boolean> {
    const projectDir = this.getProjectDir();
    const tracker = perf || new NoOpPerformanceTracker();

    logger.info("[XCTestServiceBuilder] Running xcodegen");

    try {
      await tracker.track("xcodegen", async () => {
        const { stdout, stderr } = await execAsync("xcodegen generate", {
          cwd: projectDir,
          timeout: 60000, // 1 minute timeout
        });
        if (stderr) {
          logger.warn("[XCTestServiceBuilder] xcodegen stderr:", stderr);
        }
        logger.info("[XCTestServiceBuilder] xcodegen output:", stdout);
      });
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error("[XCTestServiceBuilder] xcodegen failed:", errorMsg);
      return false;
    }
  }

  /**
   * Check if a rebuild is needed
   */
  public async needsRebuild(): Promise<boolean> {
    // Check if skip build is enabled
    if (process.env.AUTOMOBILE_SKIP_XCTESTSERVICE_BUILD === "true" ||
        process.env.AUTOMOBILE_SKIP_XCTESTSERVICE_BUILD === "1") {
      logger.info("[XCTestServiceBuilder] Build skipped via AUTOMOBILE_SKIP_XCTESTSERVICE_BUILD");
      return false;
    }

    // Check if build products exist
    const buildProductMtime = await this.getBuildProductMtime();
    if (buildProductMtime === 0) {
      logger.info("[XCTestServiceBuilder] Build products don't exist, need rebuild");
      return true;
    }

    // Check if source is newer than build products
    const sourceMtime = await this.getNewestSourceMtime();
    if (sourceMtime > buildProductMtime) {
      logger.info("[XCTestServiceBuilder] Source files are newer than build products, need rebuild");
      return true;
    }

    // Check if project needs regeneration
    if (await this.needsProjectGeneration()) {
      logger.info("[XCTestServiceBuilder] project.yml is newer than xcodeproj, need rebuild");
      return true;
    }

    logger.info("[XCTestServiceBuilder] Build products are up to date");
    return false;
  }

  /**
   * Build XCTestService using xcodebuild build-for-testing
   */
  public async build(perf: PerformanceTracker = new NoOpPerformanceTracker()): Promise<XCTestServiceBuildResult> {
    perf.serial("xcTestServiceBuild");

    // Check if Xcode is installed
    const xcodeInstalled = await perf.track("checkXcode", () => this.checkXcodeInstalled());
    if (!xcodeInstalled) {
      perf.end();
      return {
        success: false,
        message: "Xcode is not installed",
        error: "Xcode is required to build XCTestService. Install Xcode from the App Store or run 'xcode-select --install'.",
      };
    }

    // Check if project needs regeneration
    const needsRegen = await perf.track("checkProjectGen", () => this.needsProjectGeneration());
    if (needsRegen) {
      const xcodegenAvailable = await this.isXcodegenAvailable();
      if (xcodegenAvailable) {
        const regenSuccess = await this.runXcodegen(perf);
        if (!regenSuccess) {
          perf.end();
          return {
            success: false,
            message: "Failed to generate Xcode project",
            error: "xcodegen failed to generate the project from project.yml",
          };
        }
      } else {
        logger.warn("[XCTestServiceBuilder] xcodegen not available but project.yml is newer than xcodeproj");
      }
    }

    const projectDir = this.getProjectDir();

    // Build command
    const buildCommand = [
      "xcodebuild",
      "build-for-testing",
      `-scheme ${this.config.scheme}`,
      `-destination '${this.config.destination}'`,
      `-derivedDataPath '${this.config.derivedDataPath}'`,
      "-quiet",
    ].join(" ");

    logger.info("[XCTestServiceBuilder] Running build:", buildCommand);

    try {
      await perf.track("xcodebuild", async () => {
        const { stdout, stderr } = await execAsync(buildCommand, {
          cwd: projectDir,
          timeout: 300000, // 5 minute timeout
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        });

        if (stderr && !stderr.includes("Build Succeeded")) {
          logger.warn("[XCTestServiceBuilder] xcodebuild stderr:", stderr.slice(0, 1000));
        }
        if (stdout) {
          logger.info("[XCTestServiceBuilder] xcodebuild output:", stdout.slice(0, 500));
        }
      });

      // Clear cached paths to force rediscovery
      this.cachedBuildProductsPath = null;
      this.cachedXctestrunPath = null;

      const buildPath = await this.getBuildProductsPath();
      const xctestrunPath = await this.getXctestrunPath();

      perf.end();
      return {
        success: true,
        message: "XCTestService built successfully",
        buildPath: buildPath || undefined,
        xctestrunPath: xctestrunPath || undefined,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error("[XCTestServiceBuilder] Build failed:", errorMsg);

      perf.end();
      return {
        success: false,
        message: "XCTestService build failed",
        error: errorMsg,
      };
    }
  }

  /**
   * Prefetch build at startup (background, non-blocking)
   * This is similar to Android's APK prefetch pattern
   */
  public static prefetchBuild(): void {
    // Only run on macOS
    if (process.platform !== "darwin") {
      logger.info("[XCTestServiceBuilder] Prefetch skipped (not macOS)");
      return;
    }

    // Skip if already prefetching
    if (XCTestServiceBuilder.prefetchPromise !== null) {
      logger.info("[XCTestServiceBuilder] Prefetch already initiated, skipping");
      return;
    }

    // Skip if disabled
    if (process.env.AUTOMOBILE_SKIP_XCTESTSERVICE_BUILD === "true" ||
        process.env.AUTOMOBILE_SKIP_XCTESTSERVICE_BUILD === "1") {
      logger.info("[XCTestServiceBuilder] Prefetch skipped via environment variable");
      return;
    }

    logger.info("[XCTestServiceBuilder] Starting build prefetch");
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

    // Check if build is needed
    const needsBuild = await builder.needsRebuild();
    if (!needsBuild) {
      // Return existing build info
      const buildPath = await builder.getBuildProductsPath();
      const xctestrunPath = await builder.getXctestrunPath();
      return {
        success: true,
        message: "Build products are up to date",
        buildPath: buildPath || undefined,
        xctestrunPath: xctestrunPath || undefined,
      };
    }

    // Build in background
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
      this.cachedBuildProductsPath = null;
      this.cachedXctestrunPath = null;
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
}
