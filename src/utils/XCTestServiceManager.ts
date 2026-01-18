import { logger } from "./logger";
import { BootedDevice } from "../models";
import { NoOpPerformanceTracker, type PerformanceTracker } from "./PerformanceTracker";
import { Timer, defaultTimer } from "./SystemTimer";
import { XCTestServiceBuilder, type XCTestServiceBuildResult } from "./XCTestServiceBuilder";
import { exec, type ChildProcess } from "child_process";
import { PortManager } from "./PortManager";
import { DefaultProcessExecutor, type ProcessExecutor } from "./ProcessExecutor";
import { XcodeSigningManager } from "./ios-cmdline-tools/XcodeSigning";
import { DeviceAppInspector } from "./ios-cmdline-tools/DeviceAppInspector";

/**
 * Result of XCTestService setup
 */
export interface XCTestServiceSetupResult {
  success: boolean;
  message: string;
  error?: string;
  buildResult?: XCTestServiceBuildResult;
  perfTiming?: ReturnType<PerformanceTracker["getTimings"]>;
}

/**
 * Interface for XCTestService management
 */
export interface XCTestServiceManager {
  setup(force?: boolean, perf?: PerformanceTracker): Promise<XCTestServiceSetupResult>;
  isInstalled(): Promise<boolean>;
  isRunning(): Promise<boolean>;
  isAvailable(): Promise<boolean>;
  start(): Promise<void>;
  stop(): Promise<void>;
  getServicePort(): number;
}

/**
 * Capabilities of the iOS device for XCTestService
 */
export interface XCTestServiceCapabilities {
  supportsXCTest: boolean;
  deviceType: "simulator" | "physical";
  iosVersion: string | null;
  reason?: string;
}

/**
 * iOS XCTestService Manager
 * Manages the lifecycle of XCTestService running on iOS simulator or device
 */
export class IOSXCTestServiceManager implements XCTestServiceManager {
  private readonly device: BootedDevice;
  private readonly timer: Timer;
  private servicePort: number;
  private readonly builder: XCTestServiceBuilder;
  private readonly processExecutor: ProcessExecutor;
  private readonly signingManager: XcodeSigningManager;
  private readonly appInspector: DeviceAppInspector;

  // Singleton instances per device
  private static instances: Map<string, IOSXCTestServiceManager> = new Map();

  // Cache for status checks
  private cachedAvailability: { isAvailable: boolean; timestamp: number } | null = null;
  private cachedRunning: { isRunning: boolean; timestamp: number } | null = null;
  private static readonly AVAILABILITY_CACHE_TTL = 60 * 60 * 1000; // 1 hour
  private static readonly STATUS_CACHE_TTL = 30 * 1000; // 30 seconds

  // Setup state tracking
  private attemptedSetup: boolean = false;

  // XCUITest process state
  private xcTestProcessId: number | null = null;
  private xcTestProcess: ChildProcess | null = null;

  // Process monitoring
  private processMonitorInterval: ReturnType<typeof setInterval> | null = null;
  private lastHealthCheckSuccess: boolean = false;

  // iproxy tunnel state (physical devices)
  private iproxyProcessId: number | null = null;
  private iproxyProcess: ChildProcess | null = null;
  private iproxyMonitorInterval: ReturnType<typeof setInterval> | null = null;
  private iproxyRestartTimeout: ReturnType<Timer["setTimeout"]> | null = null;
  private iproxyHealthFailures: number = 0;
  private iproxyRestartAttempts: number = 0;
  private isStopping: boolean = false;

  public static readonly DEFAULT_PORT = 8765;
  public static readonly BUNDLE_ID = "dev.jasonpearson.automobile.XCTestService";
  public static readonly APP_BUNDLE_ID = "dev.jasonpearson.automobile.XCTestServiceApp";
  private static readonly IPROXY_HEALTH_CHECK_INTERVAL_MS = 5000;
  private static readonly IPROXY_MAX_HEALTH_FAILURES = 2;
  private static readonly IPROXY_RESTART_BASE_DELAY_MS = 1000;
  private static readonly IPROXY_RESTART_MAX_DELAY_MS = 15000;
  private static readonly DEFAULT_IPROXY_START_TIMEOUT_MS = 5000;

  private constructor(
    device: BootedDevice,
    timer: Timer = defaultTimer,
    builder?: XCTestServiceBuilder,
    processExecutor: ProcessExecutor = new DefaultProcessExecutor(),
    signingManager: XcodeSigningManager = new XcodeSigningManager(),
    appInspector: DeviceAppInspector = new DeviceAppInspector()
  ) {
    this.device = device;
    this.timer = timer;
    this.servicePort = PortManager.allocate(device.deviceId);
    this.builder = builder || XCTestServiceBuilder.getInstance();
    this.processExecutor = processExecutor;
    this.signingManager = signingManager;
    this.appInspector = appInspector;
  }

  /**
   * Get singleton instance for a device
   */
  public static getInstance(device: BootedDevice, timer?: Timer): IOSXCTestServiceManager {
    if (!IOSXCTestServiceManager.instances.has(device.deviceId)) {
      IOSXCTestServiceManager.instances.set(
        device.deviceId,
        new IOSXCTestServiceManager(device, timer)
      );
    }
    return IOSXCTestServiceManager.instances.get(device.deviceId)!;
  }

  /**
   * Create instance for testing with injected dependencies
   */
  public static createForTesting(device: BootedDevice, timer: Timer, builder?: XCTestServiceBuilder): IOSXCTestServiceManager {
    return new IOSXCTestServiceManager(device, timer, builder);
  }

  /**
   * Create instance for testing with injected dependencies
   */
  public static createForTestingWithDeps(
    device: BootedDevice,
    timer: Timer,
    builder: XCTestServiceBuilder | undefined,
    processExecutor: ProcessExecutor,
    signingManager?: XcodeSigningManager,
    appInspector?: DeviceAppInspector
  ): IOSXCTestServiceManager {
    return new IOSXCTestServiceManager(device, timer, builder, processExecutor, signingManager, appInspector);
  }

  /**
   * Reset all instances (for testing)
   */
  public static resetInstances(): void {
    IOSXCTestServiceManager.instances.clear();
  }

  /**
   * Stop all active instances (for shutdown)
   */
  public static async shutdownAll(): Promise<void> {
    const instances = Array.from(IOSXCTestServiceManager.instances.values());
    await Promise.all(instances.map(instance => instance.stop()));
    IOSXCTestServiceManager.instances.clear();
  }

  /**
   * Get the port the service is running on
   */
  public getServicePort(): number {
    return this.servicePort;
  }

  /**
   * Clear all caches
   */
  public clearCaches(): void {
    this.cachedAvailability = null;
    this.cachedRunning = null;
    logger.info("[XCTestServiceManager] Cleared all caches");
  }

  /**
   * Reset setup state to allow fresh setup
   */
  public resetSetupState(): void {
    this.attemptedSetup = false;
    this.clearCaches();
    logger.info("[XCTestServiceManager] Reset setup state");
  }

  // MARK: - Status Checks

  /**
   * Check if the XCTestService is installed on the device
   * For simulators, this checks if the test bundle can be found
   */
  public async isInstalled(): Promise<boolean> {
    try {
      logger.info("[XCTestServiceManager] Checking if XCTestService is installed");

      // Check if we're on a simulator
      if (this.isSimulator()) {
        // For simulators, check if we can find the test bundle
        // The test bundle would be installed via xcodebuild test
        // For now, we assume it's available if we can communicate with it
        return true;
      } else {
        // For physical devices, check if the test app is installed
        const { stdout } = await this.processExecutor.exec(
          `ideviceinstaller -u ${this.device.deviceId} -l 2>/dev/null | grep ${IOSXCTestServiceManager.BUNDLE_ID}`
        );
        return stdout.includes(IOSXCTestServiceManager.BUNDLE_ID);
      }
    } catch (error) {
      logger.warn(`[XCTestServiceManager] Error checking installation: ${error}`);
      return false;
    }
  }

  /**
   * Check if the XCTestService is currently running
   */
  public async isRunning(): Promise<boolean> {
    // Check cache first
    if (this.cachedRunning) {
      const cacheAge = this.timer.now() - this.cachedRunning.timestamp;
      if (cacheAge < IOSXCTestServiceManager.STATUS_CACHE_TTL) {
        return this.cachedRunning.isRunning;
      }
    }

    try {
      logger.info("[XCTestServiceManager] Checking if XCTestService is running");

      // Check if the WebSocket server is responding
      const isRunning = await this.checkHealthEndpoint();

      // Cache the result
      this.cachedRunning = {
        isRunning,
        timestamp: this.timer.now()
      };

      return isRunning;
    } catch (error) {
      logger.warn(`[XCTestServiceManager] Error checking running status: ${error}`);
      return false;
    }
  }

  /**
   * Check if the service is available (installed and running)
   */
  public async isAvailable(): Promise<boolean> {
    // Check cache first
    if (this.cachedAvailability && this.cachedAvailability.isAvailable) {
      const cacheAge = this.timer.now() - this.cachedAvailability.timestamp;
      if (cacheAge < IOSXCTestServiceManager.AVAILABILITY_CACHE_TTL) {
        return this.cachedAvailability.isAvailable;
      }
    }

    const [installed, running] = await Promise.all([
      this.isInstalled(),
      this.isRunning()
    ]);

    const available = installed && running;

    this.cachedAvailability = {
      isAvailable: available,
      timestamp: this.timer.now()
    };

    return available;
  }

  // MARK: - Service Control

  /**
   * Start the XCTestService
   */
  public async start(): Promise<void> {
    logger.info("[XCTestServiceManager] Starting XCTestService");
    this.isStopping = false;

    if (await this.isRunning()) {
      logger.info("[XCTestServiceManager] Service is already running");
      return;
    }

    if (this.isSimulator()) {
      await this.startOnSimulator();
    } else {
      await this.startOnDevice();
    }

    // Wait for HTTP health endpoint to be ready
    // XCUITest can take 10+ seconds to fully initialize after xcodebuild starts
    const maxAttempts = 30;
    const delayMs = 500;

    for (let i = 0; i < maxAttempts; i++) {
      if (await this.checkHealthEndpoint()) {
        logger.info("[XCTestServiceManager] HTTP health endpoint is ready");
        this.clearCaches();

        // Wait additional time for WebSocket server to be ready
        // The HTTP server can respond before WebSocket is fully initialized
        logger.info("[XCTestServiceManager] Waiting for WebSocket server initialization");
        await this.timer.sleep(500);

        if (!this.isSimulator()) {
          this.startIproxyMonitoring();
        }
        return;
      }
      if (i > 0 && i % 10 === 0) {
        logger.info(`[XCTestServiceManager] Still waiting for service... (attempt ${i}/${maxAttempts})`);
      }
      await this.timer.sleep(delayMs);
    }

    throw new Error("XCTestService failed to start within timeout (15s)");
  }

  /**
   * Stop the XCTestService
   */
  public async stop(): Promise<void> {
    logger.info("[XCTestServiceManager] Stopping XCTestService");
    this.isStopping = true;

    // Stop process monitoring first
    this.stopProcessMonitoring();

    // Stop iproxy tunnel if running
    await this.stopIproxyTunnel();

    if (this.xcTestProcessId) {
      try {
        process.kill(this.xcTestProcessId);
      } catch {
        // Process may have already exited
      }
      this.xcTestProcessId = null;
      this.xcTestProcess = null;
    }

    // Also try to kill any lingering xcodebuild test processes
    try {
      await this.processExecutor.exec("pkill -f 'xcodebuild.*XCTestServiceUITests'");
    } catch {
      // Ignore errors if no process found
    }

    this.clearCaches();
    PortManager.release(this.device.deviceId);
    this.isStopping = false;
    logger.info("[XCTestServiceManager] Service stopped");
  }

  /**
   * Complete setup process for XCTestService
   * Includes automatic build detection and prefetch integration
   */
  public async setup(
    force: boolean = false,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<XCTestServiceSetupResult> {
    perf.serial("xcTestServiceSetup");

    if (this.attemptedSetup && !force) {
      const isAvail = await this.isAvailable();
      if (isAvail) {
        perf.end();
        return {
          success: true,
          message: "XCTestService was already running",
          perfTiming: perf.getTimings()
        };
      }
      perf.end();
      return {
        success: false,
        message: "Setup already attempted",
        perfTiming: perf.getTimings()
      };
    }

    try {
      this.attemptedSetup = true;

      // Check if already running
      const isRunning = await perf.track("checkRunning", () => this.isRunning());
      if (!force && isRunning) {
        perf.end();
        return {
          success: true,
          message: "XCTestService was already running",
          perfTiming: perf.getTimings()
        };
      }

      // Check if build is needed
      const needsBuild = await perf.track("checkBuild", () => this.builder.needsRebuild(this.isSimulator() ? "simulator" : "device"));

      let buildResult: XCTestServiceBuildResult | null = null;
      if (needsBuild) {
        // Check for prefetched result first
        const prefetchedResult = XCTestServiceBuilder.getPrefetchedResult();
        if (prefetchedResult && prefetchedResult.success) {
          logger.info("[XCTestServiceManager] Using prefetched build result");
          buildResult = prefetchedResult;
        } else {
          // Wait for prefetch if in progress
          const waitedResult = await perf.track("waitForPrefetch", () => XCTestServiceBuilder.waitForPrefetch());
          if (waitedResult && waitedResult.success) {
            logger.info("[XCTestServiceManager] Using completed prefetch build result");
            buildResult = waitedResult;
          } else {
            // Build synchronously
            logger.info("[XCTestServiceManager] Downloading XCTestService bundle");
            buildResult = await perf.track("build", () => this.builder.build(this.isSimulator() ? "simulator" : "device", perf));
            if (!buildResult.success) {
              perf.end();
              return {
                success: false,
                message: buildResult.message,
                error: buildResult.error,
                buildResult,
                perfTiming: perf.getTimings()
              };
            }
          }
        }
      }

      // Start the service
      await perf.track("startService", () => this.start());

      perf.end();
      return {
        success: true,
        message: needsBuild ? "XCTestService downloaded and started successfully" : "XCTestService started successfully",
        buildResult: buildResult || undefined,
        perfTiming: perf.getTimings()
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      perf.end();
      return {
        success: false,
        message: "Failed to setup XCTestService",
        error: errorMsg,
        perfTiming: perf.getTimings()
      };
    }
  }

  // MARK: - Private Helpers

  private isSimulator(): boolean {
    // Simulators have UUIDs like "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
    // Physical devices have serial numbers (alphanumeric without dashes in UUID format)
    const uuidPattern = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;
    return uuidPattern.test(this.device.deviceId);
  }

  private async startOnSimulator(): Promise<void> {
    logger.info("[XCTestServiceManager] Starting XCTestService on simulator");

    // Try to get xctestrun path for faster test-without-building
    const xctestrunPath = await this.builder.getXctestrunPath("simulator");

    let command: string;
    if (xctestrunPath) {
      // Use test-without-building for faster startup
      logger.info("[XCTestServiceManager] Using test-without-building with xctestrun file");
      command = [
        "xcodebuild",
        "test-without-building",
        `-xctestrun "${xctestrunPath}"`,
        `-destination "id=${this.device.deviceId}"`,
        `-only-testing:XCTestServiceUITests/XCTestServiceUITests/testRunService`,
        `XCTESTSERVICE_PORT=${this.servicePort}`,
        "2>&1"
      ].join(" ");
    } else {
      throw new Error("XCTestService xctestrun not found. Download the XCTestService bundle before starting.");
    }

    // Start in background
    const child = exec(command, error => {
      if (error) {
        logger.warn(`[XCTestServiceManager] xcodebuild test exited: ${error.message}`);
        this.handleProcessExit();
      }
    });

    if (child.pid) {
      this.xcTestProcessId = child.pid;
      this.xcTestProcess = child;
      logger.info(`[XCTestServiceManager] Started xcodebuild test with PID ${child.pid}`);

      // Start process monitoring
      this.startProcessMonitoring();

      // Capture output for debugging
      this.captureProcessOutput(child);
    }
  }

  /**
   * Capture process output for debugging
   */
  private captureProcessOutput(child: ChildProcess): void {
    if (child.stdout) {
      child.stdout.on("data", (data: Buffer | string) => {
        const output = data.toString().trim();
        if (output) {
          logger.info(`[XCTestService stdout] ${output.slice(0, 500)}`);
        }
      });
    }

    if (child.stderr) {
      child.stderr.on("data", (data: Buffer | string) => {
        const output = data.toString().trim();
        if (output && !output.includes("Build Succeeded")) {
          logger.warn(`[XCTestService stderr] ${output.slice(0, 500)}`);
        }
      });
    }
  }

  /**
   * Start process health monitoring
   */
  private startProcessMonitoring(): void {
    // Clear any existing monitor
    this.stopProcessMonitoring();

    // Check every 30 seconds
    this.processMonitorInterval = setInterval(async () => {
      try {
        const isHealthy = await this.checkHealthEndpoint();
        this.lastHealthCheckSuccess = isHealthy;

        if (!isHealthy && this.xcTestProcessId) {
          // Check if process is still running
          const processRunning = await this.isProcessRunning(this.xcTestProcessId);
          if (!processRunning) {
            logger.warn("[XCTestServiceManager] XCTest process crashed, health endpoint not responding");
            // Don't auto-restart here - let the next setup() call handle it
            this.handleProcessExit();
          }
        }
      } catch {
        // Ignore monitoring errors
      }
    }, 30000);
  }

  /**
   * Stop process monitoring
   */
  private stopProcessMonitoring(): void {
    if (this.processMonitorInterval) {
      clearInterval(this.processMonitorInterval);
      this.processMonitorInterval = null;
    }
  }

  /**
   * Handle process exit
   */
  private handleProcessExit(): void {
    this.xcTestProcessId = null;
    this.xcTestProcess = null;
    this.stopProcessMonitoring();
    this.clearCaches();
  }

  /**
   * Check if a process is still running
   */
  private async isProcessRunning(pid: number): Promise<boolean> {
    try {
      // On macOS/Linux, kill -0 checks if process exists without actually killing it
      await this.processExecutor.exec(`kill -0 ${pid} 2>/dev/null`);
      return true;
    } catch {
      return false;
    }
  }

  private async startOnDevice(): Promise<void> {
    logger.info("[XCTestServiceManager] Starting XCTestService on physical device");

    // For physical devices, we need to use iproxy for port forwarding
    // and run the XCUITest via xcodebuild with device destination
    const xctestrunPath = await this.builder.getXctestrunPath("device");
    if (!xctestrunPath) {
      throw new Error("XCTestService xctestrun not found for device. Download the XCTestService bundle before starting.");
    }

    await this.startIproxyTunnel();
    await this.verifyInstalledAppBundle();

    const signing = await this.signingManager.resolveSigningForDevice(this.device.deviceId);
    signing.warnings.forEach(warning => logger.warn(`[XCTestServiceManager] ${warning}`));

    const signingArgs = [...signing.buildSettings];
    if (signing.allowProvisioningUpdates) {
      signingArgs.unshift("-allowProvisioningUpdates");
    }

    const command = [
      "xcodebuild",
      "test-without-building",
      `-xctestrun "${xctestrunPath}"`,
      "-destination", `id=${this.device.deviceId}`,
      "-only-testing:XCTestServiceUITests/XCTestServiceUITests/testRunService",
      `XCTESTSERVICE_PORT=${this.servicePort}`,
      ...signingArgs,
      "2>&1"
    ].join(" ");

    // Start in background
    const child = exec(command, error => {
      if (error) {
        logger.warn(`[XCTestServiceManager] xcodebuild test exited: ${error.message}`);
      }
    });

    if (child.pid) {
      this.xcTestProcessId = child.pid;
      this.xcTestProcess = child;
      logger.info(`[XCTestServiceManager] Started xcodebuild test with PID ${child.pid}`);

      // Start process monitoring
      this.startProcessMonitoring();

      // Capture output for debugging
      this.captureProcessOutput(child);
    }
  }

  private async verifyInstalledAppBundle(): Promise<void> {
    if (process.env.AUTOMOBILE_IOS_SKIP_XCTESTSERVICE_APP_HASH === "true" ||
        process.env.AUTOMOBILE_IOS_SKIP_XCTESTSERVICE_APP_HASH === "1") {
      return;
    }

    const expectedHash = this.builder.getExpectedAppHash("device");
    if (!expectedHash) {
      logger.warn("[XCTestServiceManager] XCTestService app hash verification skipped (no expected hash configured)");
      return;
    }

    const deviceHash = await this.appInspector.getInstalledAppBundleHash(
      this.device.deviceId,
      IOSXCTestServiceManager.APP_BUNDLE_ID
    );
    if (!deviceHash) {
      logger.warn("[XCTestServiceManager] Unable to read installed XCTestService app hash from device");
      return;
    }

    if (deviceHash.toLowerCase() !== expectedHash.toLowerCase()) {
      logger.warn("[XCTestServiceManager] Installed XCTestService app hash mismatch", {
        deviceHash,
        expectedHash
      });
      try {
        await this.appInspector.uninstallApp(this.device.deviceId, IOSXCTestServiceManager.APP_BUNDLE_ID);
        logger.info("[XCTestServiceManager] Uninstalled XCTestService app to force reinstall");
      } catch (error) {
        logger.warn(`[XCTestServiceManager] Failed to uninstall XCTestService app: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }

    logger.info("[XCTestServiceManager] Installed XCTestService app hash matches expected bundle");
  }

  private async checkHealthEndpoint(): Promise<boolean> {
    try {
      // Use curl to check the health endpoint
      const { stdout } = await this.processExecutor.exec(
        `curl -s --max-time 2 http://localhost:${this.servicePort}/health`
      );
      return stdout.includes("ok") || stdout.includes("healthy");
    } catch {
      return false;
    }
  }

  private getIproxyStartTimeoutMs(): number {
    const envValue = process.env.AUTOMOBILE_IPROXY_START_TIMEOUT_MS ??
      process.env.AUTO_MOBILE_IPROXY_START_TIMEOUT_MS;
    if (!envValue) {
      return IOSXCTestServiceManager.DEFAULT_IPROXY_START_TIMEOUT_MS;
    }
    const parsed = Number.parseInt(envValue, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      logger.warn(`[XCTestServiceManager] Invalid iproxy timeout '${envValue}', using default ${IOSXCTestServiceManager.DEFAULT_IPROXY_START_TIMEOUT_MS}ms`);
      return IOSXCTestServiceManager.DEFAULT_IPROXY_START_TIMEOUT_MS;
    }
    return parsed;
  }

  private async startIproxyTunnel(): Promise<void> {
    if (this.isSimulator()) {
      return;
    }

    if (this.iproxyProcessId && await this.isProcessRunning(this.iproxyProcessId)) {
      return;
    }

    await this.stopIproxyTunnel();

    logger.info(`[XCTestServiceManager] Starting iproxy tunnel (localhost:${this.servicePort} -> device:${this.servicePort})`);
    const child = this.processExecutor.spawn(
      "iproxy",
      [String(this.servicePort), String(this.servicePort), this.device.deviceId],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    if (!child.pid) {
      throw new Error("Failed to start iproxy tunnel (no PID)");
    }

    this.iproxyProcessId = child.pid;
    this.iproxyProcess = child;
    this.iproxyHealthFailures = 0;
    this.captureIproxyOutput(child);

    child.on("exit", () => {
      if (!this.isStopping) {
        logger.warn("[XCTestServiceManager] iproxy exited unexpectedly");
        this.iproxyProcessId = null;
        this.iproxyProcess = null;
        this.scheduleIproxyRestart();
      }
    });

    child.on("error", error => {
      if (!this.isStopping) {
        logger.warn(`[XCTestServiceManager] iproxy error: ${error.message}`);
        this.iproxyProcessId = null;
        this.iproxyProcess = null;
        this.scheduleIproxyRestart();
      }
    });

    await this.waitForIproxyStartup();
  }

  private async stopIproxyTunnel(): Promise<void> {
    this.stopIproxyMonitoring();

    if (this.iproxyRestartTimeout) {
      this.timer.clearTimeout(this.iproxyRestartTimeout);
      this.iproxyRestartTimeout = null;
    }

    if (this.iproxyProcess && typeof this.iproxyProcess.kill === "function") {
      try {
        this.iproxyProcess.kill();
      } catch {
        // Ignore errors if already exited
      }
    } else if (this.iproxyProcessId) {
      try {
        process.kill(this.iproxyProcessId);
      } catch {
        // Ignore errors if already exited
      }
    }

    this.iproxyProcessId = null;
    this.iproxyProcess = null;
    this.iproxyRestartAttempts = 0;
    this.iproxyHealthFailures = 0;
  }

  private async waitForIproxyStartup(): Promise<void> {
    const timeoutMs = this.getIproxyStartTimeoutMs();
    const deadline = this.timer.now() + timeoutMs;

    while (this.timer.now() < deadline) {
      if (this.iproxyProcessId && await this.isProcessRunning(this.iproxyProcessId)) {
        return;
      }
      await this.timer.sleep(100);
    }

    throw new Error(`iproxy failed to stay running within ${timeoutMs}ms`);
  }

  private scheduleIproxyRestart(): void {
    if (this.iproxyRestartTimeout || this.isStopping) {
      return;
    }

    this.iproxyRestartAttempts++;
    const delay = Math.min(
      IOSXCTestServiceManager.IPROXY_RESTART_BASE_DELAY_MS * Math.pow(2, this.iproxyRestartAttempts - 1),
      IOSXCTestServiceManager.IPROXY_RESTART_MAX_DELAY_MS
    );

    this.iproxyRestartTimeout = this.timer.setTimeout(() => {
      this.iproxyRestartTimeout = null;
      void this.startIproxyTunnel().catch(error => {
        logger.warn(`[XCTestServiceManager] Failed to restart iproxy: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, delay);
  }

  private startIproxyMonitoring(): void {
    if (this.iproxyMonitorInterval || this.isSimulator()) {
      return;
    }

    this.iproxyMonitorInterval = this.timer.setInterval(async () => {
      try {
        const isConnected = await this.isDeviceDetected();
        if (!isConnected) {
          logger.warn(`[XCTestServiceManager] Device ${this.device.deviceId} not detected, stopping iproxy monitoring`);
          await this.stopIproxyTunnel();
          return;
        }

        const tunnelHealthy = await this.checkHealthEndpoint();
        if (tunnelHealthy) {
          this.iproxyHealthFailures = 0;
          return;
        }

        this.iproxyHealthFailures++;
        if (this.iproxyHealthFailures >= IOSXCTestServiceManager.IPROXY_MAX_HEALTH_FAILURES) {
          logger.warn("[XCTestServiceManager] iproxy health check failed, restarting tunnel");
          await this.stopIproxyTunnel();
          this.scheduleIproxyRestart();
        }
      } catch (error) {
        logger.warn(`[XCTestServiceManager] iproxy monitor error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }, IOSXCTestServiceManager.IPROXY_HEALTH_CHECK_INTERVAL_MS);
  }

  private stopIproxyMonitoring(): void {
    if (this.iproxyMonitorInterval) {
      this.timer.clearInterval(this.iproxyMonitorInterval);
      this.iproxyMonitorInterval = null;
    }
  }

  private async isDeviceDetected(): Promise<boolean> {
    if (this.isSimulator()) {
      try {
        const { stdout } = await this.processExecutor.exec("xcrun simctl list devices");
        return stdout.includes(this.device.deviceId);
      } catch {
        return false;
      }
    }

    try {
      const { stdout } = await this.processExecutor.exec("idevice_id -l");
      return stdout.split("\n").some(line => line.trim() === this.device.deviceId);
    } catch {
      return false;
    }
  }

  private captureIproxyOutput(child: ChildProcess): void {
    if (child.stdout) {
      child.stdout.on("data", (data: Buffer | string) => {
        const output = data.toString().trim();
        if (output) {
          logger.info(`[iproxy stdout] ${output.slice(0, 500)}`);
        }
      });
    }

    if (child.stderr) {
      child.stderr.on("data", (data: Buffer | string) => {
        const output = data.toString().trim();
        if (output) {
          logger.warn(`[iproxy stderr] ${output.slice(0, 500)}`);
        }
      });
    }
  }

  /**
   * Get device capabilities for XCTestService
   */
  public async getCapabilities(): Promise<XCTestServiceCapabilities> {
    const isSimulator = this.isSimulator();

    return {
      supportsXCTest: true, // XCUITest is available on all iOS devices
      deviceType: isSimulator ? "simulator" : "physical",
      iosVersion: null // TODO: Get from device info
    };
  }
}
