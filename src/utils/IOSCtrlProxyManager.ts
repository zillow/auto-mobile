import { logger } from "./logger";
import { BootedDevice } from "../models";
import { NoOpPerformanceTracker, type PerformanceTracker } from "./PerformanceTracker";
import { Timer, defaultTimer } from "./SystemTimer";
import { IOSCtrlProxyBuilder, type CtrlProxyIosBuildResult } from "./IOSCtrlProxyBuilder";
import { exec, type ChildProcess } from "child_process";
import { PortManager } from "./PortManager";
import { DefaultProcessExecutor, type ProcessExecutor } from "./ProcessExecutor";
import { XcodeSigningManager } from "./ios-cmdline-tools/XcodeSigning";
import { DeviceAppInspector } from "./ios-cmdline-tools/DeviceAppInspector";
import { isRunningInDocker } from "./dockerEnv";
import {
  getHostControlHost,
  getCtrlProxyIOSStatus,
  isHostControlAvailable,
  getIproxyStatus,
  runIdeviceIdExec,
  runIdeviceInstallerExec,
  runSimctlExec,
  shouldUseHostControl,
  startIproxy,
  startCtrlProxyIOS,
  stopIproxy,
  stopCtrlProxyIOS
} from "./hostControlClient";

/**
 * Result of CtrlProxy setup
 */
export interface CtrlProxyIosSetupResult {
  success: boolean;
  message: string;
  error?: string;
  buildResult?: CtrlProxyIosBuildResult;
  perfTiming?: ReturnType<PerformanceTracker["getTimings"]>;
}

/**
 * Interface for iOS CtrlProxy management
 */
export interface CtrlProxyIosManager {
  setup(force?: boolean, perf?: PerformanceTracker): Promise<CtrlProxyIosSetupResult>;
  isInstalled(): Promise<boolean>;
  isRunning(): Promise<boolean>;
  isAvailable(): Promise<boolean>;
  start(): Promise<void>;
  stop(): Promise<void>;
  getServicePort(): number;
  setAutoRestart(enabled: boolean): void;
  isAutoRestartEnabled(): boolean;
  forceRestart(): Promise<void>;
}

interface HostControlCtrlProxyIOSRunner {
  shouldUseHostControl(): boolean;
  isRunningInDocker(): boolean;
  isAvailable(): Promise<boolean>;
  getHost(): string;
  runIdeviceId(args: string[]): Promise<{ success: boolean; error?: string; data?: { stdout: string } }>;
  runIdeviceInstaller(args: string[]): Promise<{ success: boolean; error?: string; data?: { stdout: string } }>;
  runSimctl(args: string[]): Promise<{ success: boolean; error?: string; data?: { stdout: string } }>;
  startIproxy(params: {
    deviceId: string;
    localPort: number;
    devicePort?: number;
  }): Promise<{ success: boolean; error?: string; data?: { pid: number } }>;
  stopIproxy(params: {
    pid?: number;
    deviceId?: string;
    localPort?: number;
    devicePort?: number;
  }): Promise<{ success: boolean; error?: string }>;
  getIproxyStatus(params: {
    pid?: number;
    deviceId?: string;
    localPort?: number;
    devicePort?: number;
  }): Promise<{ success: boolean; error?: string; data?: { running: boolean; pid?: number } }>;
  start(params: {
    deviceId: string;
    port: number;
    xctestrunPath?: string;
    bundleId?: string;
    timeoutSeconds?: number;
  }): Promise<{ success: boolean; error?: string; data?: { pid: number; message: string } }>;
  stop(params: { deviceId?: string; pid?: number }): Promise<{ success: boolean; error?: string }>;
  status(params: {
    deviceId?: string;
    pid?: number;
    port?: number;
  }): Promise<{ success: boolean; error?: string; data?: { running: boolean; pid?: number } }>;
}

/**
 * Capabilities of the iOS device for CtrlProxy
 */
interface CtrlProxyIosCapabilities {
  supportsXCTest: boolean;
  deviceType: "simulator" | "physical";
  iosVersion: string | null;
  reason?: string;
}

/**
 * iOS CtrlProxy Manager
 * Manages the lifecycle of CtrlProxy running on iOS simulator or device
 */
export class IOSCtrlProxyManager implements CtrlProxyIosManager {
  private readonly device: BootedDevice;
  private readonly timer: Timer;
  private servicePort: number;
  private readonly builder: IOSCtrlProxyBuilder;
  private readonly processExecutor: ProcessExecutor;
  private readonly signingManager: XcodeSigningManager;
  private readonly appInspector: DeviceAppInspector;
  private readonly hostControl: HostControlCtrlProxyIOSRunner;
  private hostControlAvailability: Promise<boolean> | null = null;

  // Singleton instances per device
  private static instances: Map<string, IOSCtrlProxyManager> = new Map();

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

  // Auto-restart state
  private autoRestartEnabled: boolean = true;
  private restartAttempts: number = 0;
  private restartTimeout: ReturnType<Timer["setTimeout"]> | null = null;
  private static readonly MAX_RESTART_ATTEMPTS = 5;
  private static readonly RESTART_BASE_DELAY_MS = 2000;
  private static readonly RESTART_MAX_DELAY_MS = 30000;

  // iproxy tunnel state (physical devices)
  private iproxyProcessId: number | null = null;
  private iproxyProcess: ChildProcess | null = null;
  private iproxyMonitorInterval: ReturnType<typeof setInterval> | null = null;
  private iproxyRestartTimeout: ReturnType<Timer["setTimeout"]> | null = null;
  private iproxyRestartAttempts: number = 0;
  private isStopping: boolean = false;

  // Mutex to prevent concurrent start() calls from spawning multiple processes
  private startPromise: Promise<void> | null = null;

  // Target app bundle ID for CtrlProxy to observe (instead of SpringBoard)
  private targetBundleId: string | null = null;

  public static readonly DEFAULT_PORT = 8765;
  public static readonly BUNDLE_ID = "dev.jasonpearson.automobile.ctrlproxy";
  public static readonly APP_BUNDLE_ID = "dev.jasonpearson.automobile.ctrlproxy";
  /** Bundle ID used before the rename to CtrlProxy — uninstalled opportunistically on device setup */
  private static readonly LEGACY_APP_BUNDLE_ID = "dev.jasonpearson.automobile.XCTestServiceApp";
  private static readonly IPROXY_MONITOR_INTERVAL_MS = 5000;
  private static readonly IPROXY_RESTART_BASE_DELAY_MS = 1000;
  private static readonly IPROXY_RESTART_MAX_DELAY_MS = 15000;
  private static readonly DEFAULT_IPROXY_START_TIMEOUT_MS = 5000;

  private constructor(
    device: BootedDevice,
    timer: Timer = defaultTimer,
    builder?: IOSCtrlProxyBuilder,
    processExecutor: ProcessExecutor = new DefaultProcessExecutor(),
    signingManager: XcodeSigningManager = new XcodeSigningManager(),
    appInspector: DeviceAppInspector = new DeviceAppInspector(),
    hostControlRunner?: HostControlCtrlProxyIOSRunner
  ) {
    this.device = device;
    this.timer = timer;
    this.servicePort = PortManager.allocate(device.deviceId);
    this.builder = builder || IOSCtrlProxyBuilder.getInstance();
    this.processExecutor = processExecutor;
    this.signingManager = signingManager;
    this.appInspector = appInspector;
    this.hostControl = hostControlRunner || {
      shouldUseHostControl,
      isRunningInDocker,
      isAvailable: () => isHostControlAvailable(),
      getHost: () => getHostControlHost(),
      runIdeviceId: async (args: string[]) => runIdeviceIdExec(args),
      runIdeviceInstaller: async (args: string[]) => runIdeviceInstallerExec(args),
      runSimctl: async (args: string[]) => runSimctlExec(args),
      startIproxy: params => startIproxy(params),
      stopIproxy: params => stopIproxy(params),
      getIproxyStatus: params => getIproxyStatus(params),
      start: params => startCtrlProxyIOS(params),
      stop: params => stopCtrlProxyIOS(params),
      status: params => getCtrlProxyIOSStatus(params)
    };
  }

  /**
   * Get singleton instance for a device
   */
  public static getInstance(device: BootedDevice, timer?: Timer): IOSCtrlProxyManager {
    if (!IOSCtrlProxyManager.instances.has(device.deviceId)) {
      IOSCtrlProxyManager.instances.set(
        device.deviceId,
        new IOSCtrlProxyManager(device, timer)
      );
    }
    return IOSCtrlProxyManager.instances.get(device.deviceId)!;
  }

  /**
   * Create instance for testing with injected dependencies
   */
  public static createForTesting(device: BootedDevice, timer: Timer, builder?: IOSCtrlProxyBuilder): IOSCtrlProxyManager {
    return new IOSCtrlProxyManager(device, timer, builder);
  }

  /**
   * Create instance for testing with injected dependencies
   */
  public static createForTestingWithDeps(
    device: BootedDevice,
    timer: Timer,
    builder: IOSCtrlProxyBuilder | undefined,
    processExecutor: ProcessExecutor,
    signingManager?: XcodeSigningManager,
    appInspector?: DeviceAppInspector,
    hostControlRunner?: HostControlCtrlProxyIOSRunner
  ): IOSCtrlProxyManager {
    return new IOSCtrlProxyManager(
      device,
      timer,
      builder,
      processExecutor,
      signingManager,
      appInspector,
      hostControlRunner
    );
  }

  /**
   * Reset all instances (for testing)
   */
  public static resetInstances(): void {
    IOSCtrlProxyManager.instances.clear();
  }

  /**
   * Stop all active instances (for shutdown)
   */
  public static async shutdownAll(): Promise<void> {
    const instances = Array.from(IOSCtrlProxyManager.instances.values());
    await Promise.all(instances.map(instance => instance.stop()));
    IOSCtrlProxyManager.instances.clear();
  }

  /**
   * Get the port the service is running on
   */
  public getServicePort(): number {
    return this.servicePort;
  }

  /**
   * Set the target app bundle ID for CtrlProxy to observe.
   * Must be called before start() — CtrlProxy reads the bundle ID from
   * the CTRL_PROXY_IOS_BUNDLE_ID env var at XCUITest initialization time.
   * Falls back to process.env.CTRL_PROXY_IOS_BUNDLE_ID if not set explicitly.
   */
  public setTargetBundleId(bundleId: string): void {
    this.targetBundleId = bundleId;
    logger.info(`[IOSCtrlProxy] Target bundle ID set to ${bundleId}`);
  }

  /**
   * Resolve the target bundle ID: explicit property > env var > undefined.
   */
  private resolveTargetBundleId(): string | undefined {
    return this.targetBundleId ?? process.env.CTRL_PROXY_IOS_BUNDLE_ID ?? undefined;
  }

  /**
   * Clear all caches
   */
  public clearCaches(): void {
    this.cachedAvailability = null;
    this.cachedRunning = null;
    logger.info("[IOSCtrlProxy] Cleared all caches");
  }

  /**
   * Reset setup state to allow fresh setup
   */
  public resetSetupState(): void {
    this.attemptedSetup = false;
    this.clearCaches();
    logger.info("[IOSCtrlProxy] Reset setup state");
  }

  // MARK: - Status Checks

  /**
   * Check if CtrlProxy is installed on the device
   * For simulators, this checks if the test bundle can be found
   */
  public async isInstalled(): Promise<boolean> {
    try {
      logger.info("[IOSCtrlProxy] Checking if CtrlProxy is installed");

      // Check if we're on a simulator
      if (this.isSimulator()) {
        // For simulators, check if we can find the test bundle
        // The test bundle would be installed via xcodebuild test
        // For now, we assume it's available if we can communicate with it
        return true;
      } else {
        // For physical devices, check if the test app is installed
        if (this.useHostControl()) {
          const result = await this.hostControl.runIdeviceInstaller(["-u", this.device.deviceId, "-l"]);
          if (!result.success || !result.data) {
            return false;
          }
          return result.data.stdout.includes(IOSCtrlProxyManager.BUNDLE_ID);
        }

        const { stdout } = await this.processExecutor.exec(
          `ideviceinstaller -u ${this.device.deviceId} -l 2>/dev/null | grep ${IOSCtrlProxyManager.BUNDLE_ID}`
        );
        return stdout.includes(IOSCtrlProxyManager.BUNDLE_ID);
      }
    } catch (error) {
      logger.warn(`[IOSCtrlProxy] Error checking installation: ${error}`);
      return false;
    }
  }

  /**
   * Check if CtrlProxy is currently running
   */
  public async isRunning(): Promise<boolean> {
    // Check cache first
    if (this.cachedRunning) {
      const cacheAge = this.timer.now() - this.cachedRunning.timestamp;
      if (cacheAge < IOSCtrlProxyManager.STATUS_CACHE_TTL) {
        return this.cachedRunning.isRunning;
      }
    }

    try {
      logger.info("[IOSCtrlProxy] Checking if CtrlProxy is running");

      // Check if the WebSocket server is responding
      const isRunning = await this.checkHealthEndpoint();

      // Cache the result
      this.cachedRunning = {
        isRunning,
        timestamp: this.timer.now()
      };

      return isRunning;
    } catch (error) {
      logger.warn(`[IOSCtrlProxy] Error checking running status: ${error}`);
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
      if (cacheAge < IOSCtrlProxyManager.AVAILABILITY_CACHE_TTL) {
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
   * Start CtrlProxy
   */
  public async start(): Promise<void> {
    // Use mutex to prevent concurrent start() calls from spawning multiple processes
    if (this.startPromise) {
      logger.info("[IOSCtrlProxy] Start already in progress, waiting for it to complete");
      return this.startPromise;
    }

    this.startPromise = this.startInternal();
    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  /**
   * Internal start implementation (called within mutex)
   */
  private async startInternal(): Promise<void> {
    logger.info("[IOSCtrlProxy] Starting CtrlProxy");
    this.isStopping = false;

    // Prefer process liveness check over health endpoint: a busy-but-alive CtrlProxy
    // would fail the HTTP health check and incorrectly trigger a restart.
    if (await this.isCtrlProxyProcessAlive()) {
      logger.info("[IOSCtrlProxy] CtrlProxy process is alive, skipping start");
      // On physical devices the iproxy tunnel may have been stopped independently
      // (e.g. by a temporary disconnect) while the XCTest process kept running.
      // Re-establishing it here is a no-op when the tunnel is already up, and
      // self-heals the connection when it is not.
      if (!this.isSimulator()) {
        await this.startIproxyTunnel();
        this.startIproxyMonitoring();
      }
      return;
    }

    if (await this.isRunning()) {
      logger.info("[IOSCtrlProxy] Service is already running");
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
        logger.info("[IOSCtrlProxy] HTTP health endpoint is ready");
        this.clearCaches();

        // Wait additional time for WebSocket server to be ready
        // The HTTP server can respond before WebSocket is fully initialized
        logger.info("[IOSCtrlProxy] Waiting for WebSocket server initialization");
        await this.timer.sleep(500);

        if (!this.isSimulator()) {
          this.startIproxyMonitoring();
        }
        return;
      }
      if (i > 0 && i % 10 === 0) {
        logger.info(`[IOSCtrlProxy] Still waiting for service... (attempt ${i}/${maxAttempts})`);
      }
      await this.timer.sleep(delayMs);
    }

    throw new Error("CtrlProxy failed to start within timeout (15s)");
  }

  /**
   * Stop CtrlProxy
   */
  public async stop(): Promise<void> {
    logger.info("[IOSCtrlProxy] Stopping CtrlProxy");
    this.isStopping = true;

    // Cancel any pending restart
    if (this.restartTimeout) {
      this.timer.clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    this.restartAttempts = 0;

    if (this.useHostControl()) {
      try {
        if (this.xcTestProcessId) {
          await this.hostControl.stop({ deviceId: this.device.deviceId, pid: this.xcTestProcessId });
        }
      } catch (error) {
        logger.warn(`[IOSCtrlProxy] Host control stop failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      if (!this.isSimulator()) {
        await this.stopIproxyTunnel();
      }

      this.xcTestProcessId = null;
      this.xcTestProcess = null;
      this.stopProcessMonitoring();
      this.clearCaches();
      PortManager.release(this.device.deviceId);
      this.isStopping = false;
      logger.info("[IOSCtrlProxy] Service stopped");
      return;
    }

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

    // Kill any lingering simulator runner processes (simctl spawn path)
    try {
      await this.processExecutor.exec("pkill -f 'CtrlProxyUITests-Runner'");
    } catch {
      // Ignore errors if no process found
    }

    // Kill any lingering xcodebuild test processes (physical device path)
    try {
      await this.processExecutor.exec("pkill -f 'xcodebuild.*CtrlProxyUITests'");
    } catch {
      // Ignore errors if no process found
    }

    this.clearCaches();
    PortManager.release(this.device.deviceId);
    this.isStopping = false;
    logger.info("[IOSCtrlProxy] Service stopped");
  }

  /**
   * Complete setup process for CtrlProxy
   * Includes automatic build detection and prefetch integration
   */
  /**
   * Uninstall the legacy CtrlProxy iOSApp if still present on the device.
   * This cleans up the old bundle ID left over from before the rename to CtrlProxy.
   */
  private async uninstallLegacyAppIfPresent(): Promise<void> {
    try {
      const isInstalled = await this.appInspector.getInstalledAppBundleHash(
        this.device.deviceId,
        IOSCtrlProxyManager.LEGACY_APP_BUNDLE_ID
      );
      if (isInstalled === null) {
        return;
      }
      logger.info(`[IOSCtrlProxy] Found legacy app ${IOSCtrlProxyManager.LEGACY_APP_BUNDLE_ID}, uninstalling`);
      await this.appInspector.uninstallApp(
        this.device.deviceId,
        IOSCtrlProxyManager.LEGACY_APP_BUNDLE_ID
      );
      logger.info(`[IOSCtrlProxy] Legacy app uninstalled`);
    } catch (error) {
      logger.warn(`[IOSCtrlProxy] Failed to check/uninstall legacy app: ${error}`);
    }
  }

  public async setup(
    force: boolean = false,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<CtrlProxyIosSetupResult> {
    perf.serial("xcTestServiceSetup");

    await this.uninstallLegacyAppIfPresent();

    if (this.attemptedSetup && !force) {
      const isAvail = await this.isAvailable();
      if (isAvail) {
        perf.end();
        return {
          success: true,
          message: "CtrlProxy was already running",
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
          message: "CtrlProxy was already running",
          perfTiming: perf.getTimings()
        };
      }

      // Check if build is needed
      const needsBuild = this.useHostControl()
        ? false
        : await perf.track("checkBuild", () => this.builder.needsRebuild(this.isSimulator() ? "simulator" : "device"));

      let buildResult: CtrlProxyIosBuildResult | null = null;
      if (needsBuild) {
        // Check for prefetched result first
        const prefetchedResult = IOSCtrlProxyBuilder.getPrefetchedResult();
        if (prefetchedResult && prefetchedResult.success) {
          logger.info("[IOSCtrlProxy] Using prefetched build result");
          buildResult = prefetchedResult;
        } else {
          // Wait for prefetch if in progress
          const waitedResult = await perf.track("waitForPrefetch", () => IOSCtrlProxyBuilder.waitForPrefetch());
          if (waitedResult && waitedResult.success) {
            logger.info("[IOSCtrlProxy] Using completed prefetch build result");
            buildResult = waitedResult;
          } else {
            // Build synchronously
            logger.info("[IOSCtrlProxy] Downloading CtrlProxy bundle");
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
        message: needsBuild ? "CtrlProxy downloaded and started successfully" : "CtrlProxy started successfully",
        buildResult: buildResult || undefined,
        perfTiming: perf.getTimings()
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      perf.end();
      return {
        success: false,
        message: "Failed to setup CtrlProxy",
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

  private useHostControl(): boolean {
    return this.hostControl.shouldUseHostControl() && this.hostControl.isRunningInDocker();
  }

  private async isHostControlAvailable(): Promise<boolean> {
    if (!this.hostControlAvailability) {
      this.hostControlAvailability = this.hostControl.isAvailable();
    }
    return this.hostControlAvailability;
  }

  private async startOnSimulator(): Promise<void> {
    logger.info("[IOSCtrlProxy] Starting CtrlProxy on simulator");

    if (this.useHostControl()) {
      if (!await this.isHostControlAvailable()) {
        throw new Error("Host control daemon not available for CtrlProxy startup");
      }

      const xctestrunPath = await this.builder.getXctestrunPath("simulator");
      const bundleId = this.resolveTargetBundleId();
      const result = await this.hostControl.start({
        deviceId: this.device.deviceId,
        port: this.servicePort,
        xctestrunPath: xctestrunPath || undefined,
        bundleId
      });

      if (!result.success || !result.data) {
        throw new Error(result.error || "Host control failed to start CtrlProxy");
      }

      this.xcTestProcessId = result.data.pid;
      this.xcTestProcess = null;
      return;
    }

    // Get runner binary path for simctl spawn (lighter than xcodebuild test-without-building)
    const runnerBinaryPath = await this.builder.getRunnerBinaryPath("simulator");
    if (!runnerBinaryPath) {
      throw new Error("CtrlProxy runner binary not found. Download the CtrlProxy bundle before starting.");
    }

    const timeout = process.env.CTRL_PROXY_IOS_TIMEOUT || "86400";
    const bundleId = this.resolveTargetBundleId();

    // simctl spawn requires SIMCTL_CHILD_ prefixed env vars (--setenv is not supported)
    const childEnv: Record<string, string> = {
      SIMCTL_CHILD_CTRL_PROXY_IOS_PORT: String(this.servicePort),
      SIMCTL_CHILD_CTRL_PROXY_IOS_TIMEOUT: timeout,
    };
    if (bundleId) {
      childEnv.SIMCTL_CHILD_CTRL_PROXY_IOS_BUNDLE_ID = bundleId;
      logger.info(`[IOSCtrlProxy] Passing CTRL_PROXY_IOS_BUNDLE_ID=${bundleId} via SIMCTL_CHILD_ env`);
    }
    const command = [
      "xcrun simctl spawn",
      `"${this.device.deviceId}"`,
      `"${runnerBinaryPath}"`,
      "2>&1"
    ].join(" ");

    logger.info("[IOSCtrlProxy] Using simctl spawn to start runner binary");

    // Start in background with SIMCTL_CHILD_ env vars
    // Note: exec() is used here intentionally — the command is built from internal constants,
    // not user input, and we need shell features (2>&1 redirection, quoted paths).
    const child = exec(command, { env: { ...process.env, ...childEnv } }, error => {
      if (error) {
        logger.warn(`[IOSCtrlProxy] simctl spawn exited: ${error.message}`);
        this.handleProcessExit();
      }
    });

    if (child.pid) {
      this.xcTestProcessId = child.pid;
      this.xcTestProcess = child;
      logger.info(`[IOSCtrlProxy] Started simctl spawn with PID ${child.pid}`);

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
          logger.info(`[CtrlProxy stdout] ${output.slice(0, 500)}`);
        }
      });
    }

    if (child.stderr) {
      child.stderr.on("data", (data: Buffer | string) => {
        const output = data.toString().trim();
        if (output && !output.includes("Build Succeeded")) {
          logger.warn(`[CtrlProxy stderr] ${output.slice(0, 500)}`);
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
    this.processMonitorInterval = this.timer.setInterval(async () => {
      try {
        const isHealthy = await this.checkHealthEndpoint();

        if (!isHealthy && this.xcTestProcessId) {
          // Check if process is still running
          const processRunning = await this.isProcessRunning(this.xcTestProcessId);
          if (!processRunning) {
            logger.warn("[IOSCtrlProxy] XCTest process crashed, health endpoint not responding");
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
      this.timer.clearInterval(this.processMonitorInterval);
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

    // Schedule auto-restart if enabled and not stopping intentionally
    if (this.autoRestartEnabled && !this.isStopping) {
      this.scheduleAutoRestart();
    }
  }

  /**
   * Schedule automatic restart with exponential backoff
   */
  private scheduleAutoRestart(): void {
    if (this.restartTimeout || this.isStopping) {
      return;
    }

    if (this.restartAttempts >= IOSCtrlProxyManager.MAX_RESTART_ATTEMPTS) {
      logger.warn(`[IOSCtrlProxy] Max restart attempts (${IOSCtrlProxyManager.MAX_RESTART_ATTEMPTS}) reached, giving up`);
      this.restartAttempts = 0;
      return;
    }

    this.restartAttempts++;
    const delay = Math.min(
      IOSCtrlProxyManager.RESTART_BASE_DELAY_MS * Math.pow(2, this.restartAttempts - 1),
      IOSCtrlProxyManager.RESTART_MAX_DELAY_MS
    );

    logger.info(`[IOSCtrlProxy] Scheduling auto-restart in ${delay}ms (attempt ${this.restartAttempts}/${IOSCtrlProxyManager.MAX_RESTART_ATTEMPTS})`);

    this.restartTimeout = this.timer.setTimeout(() => {
      this.restartTimeout = null;

      // Don't restart if we're stopping
      if (this.isStopping) {
        return;
      }

      logger.info("[IOSCtrlProxy] Attempting automatic restart...");
      void this.start().then(() => {
        logger.info("[IOSCtrlProxy] Auto-restart successful");
        this.restartAttempts = 0; // Reset on success
      }).catch(error => {
        logger.warn(`[IOSCtrlProxy] Auto-restart failed: ${error instanceof Error ? error.message : String(error)}`);
        // handleProcessExit will be called again, triggering another restart attempt
      });
    }, delay);
  }

  /**
   * Enable or disable auto-restart
   */
  public setAutoRestart(enabled: boolean): void {
    this.autoRestartEnabled = enabled;
    if (!enabled && this.restartTimeout) {
      this.timer.clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    logger.info(`[IOSCtrlProxy] Auto-restart ${enabled ? "enabled" : "disabled"}`);
  }

  /**
   * Check if auto-restart is enabled
   */
  public isAutoRestartEnabled(): boolean {
    return this.autoRestartEnabled;
  }

  /**
   * Force restart the service (useful when client detects issues)
   */
  public async forceRestart(): Promise<void> {
    logger.info("[IOSCtrlProxy] Force restart requested");

    // Clear any pending restart
    if (this.restartTimeout) {
      this.timer.clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    // Stop and restart
    await this.stop();
    this.restartAttempts = 0; // Reset attempts for forced restart
    await this.start();
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

  /**
   * Check if the tracked CtrlProxy process is alive AND still the real CtrlProxy.
   * Used by startInternal() to skip spawning when the process is merely slow.
   *
   * We require both a PID liveness check AND a health endpoint response so that
   * a stale xcTestProcessId that has been PID-reused by a different process does
   * not produce a false "alive" result and cause setup() to silently skip restart.
   */
  private async isCtrlProxyProcessAlive(): Promise<boolean> {
    if (!this.xcTestProcessId) {
      return false;
    }
    if (this.useHostControl()) {
      try {
        const status = await this.hostControl.status({
          deviceId: this.device.deviceId,
          pid: this.xcTestProcessId
        });
        return status.success && (status.data?.running ?? false);
      } catch {
        return false;
      }
    }
    // First check PID liveness (fast, no network). If the PID is already gone
    // we can skip the health check entirely.
    if (!await this.isProcessRunning(this.xcTestProcessId)) {
      return false;
    }
    // Also verify CtrlProxy identity via the health endpoint.  A different
    // process could have reused the same PID after CtrlProxy exited without
    // its exit being recorded (e.g. clean exit not caught by the exec callback).
    return this.checkHealthEndpoint();
  }

  /**
   * Check if the tracked iproxy process is alive.
   * Used by startIproxyMonitoring() so it only restarts the tunnel when the
   * process actually died, not when CtrlProxy is temporarily slow.
   */
  private async isIproxyProcessAlive(): Promise<boolean> {
    if (!this.iproxyProcessId) {
      return false;
    }
    if (this.useHostControl()) {
      try {
        const status = await this.hostControl.getIproxyStatus({ pid: this.iproxyProcessId });
        return status.success && (status.data?.running ?? false);
      } catch {
        return false;
      }
    }
    return this.isProcessRunning(this.iproxyProcessId);
  }

  private async startOnDevice(): Promise<void> {
    logger.info("[IOSCtrlProxy] Starting CtrlProxy on physical device");

    if (this.useHostControl()) {
      if (!await this.isHostControlAvailable()) {
        throw new Error("Host control daemon not available for CtrlProxy startup");
      }

      const xctestrunPath = await this.builder.getXctestrunPath("device");
      await this.startIproxyTunnel();
      await this.verifyInstalledAppBundle();

      const bundleId = this.resolveTargetBundleId();
      const result = await this.hostControl.start({
        deviceId: this.device.deviceId,
        port: this.servicePort,
        xctestrunPath: xctestrunPath || undefined,
        bundleId
      });

      if (!result.success || !result.data) {
        throw new Error(result.error || "Host control failed to start CtrlProxy");
      }

      this.xcTestProcessId = result.data.pid;
      this.xcTestProcess = null;
      return;
    }

    // For physical devices, we need to use iproxy for port forwarding
    // and run the XCUITest via xcodebuild with device destination
    const xctestrunPath = await this.builder.getXctestrunPath("device");
    if (!xctestrunPath) {
      throw new Error("CtrlProxy xctestrun not found for device. Download the CtrlProxy bundle before starting.");
    }

    await this.startIproxyTunnel();
    await this.verifyInstalledAppBundle();

    const signing = await this.signingManager.resolveSigningForDevice(this.device.deviceId);
    signing.warnings.forEach(warning => logger.warn(`[IOSCtrlProxy] ${warning}`));

    const signingArgs = [...signing.buildSettings];
    if (signing.allowProvisioningUpdates) {
      signingArgs.unshift("-allowProvisioningUpdates");
    }

    const bundleId = this.resolveTargetBundleId();
    const envSettings = [
      `CTRL_PROXY_IOS_PORT=${this.servicePort}`,
    ];
    if (bundleId) {
      envSettings.push(`CTRL_PROXY_IOS_BUNDLE_ID=${bundleId}`);
      logger.info(`[IOSCtrlProxy] Passing CTRL_PROXY_IOS_BUNDLE_ID=${bundleId} to xcodebuild`);
    }
    const command = [
      "xcodebuild",
      "test-without-building",
      `-xctestrun "${xctestrunPath}"`,
      "-destination", `id=${this.device.deviceId}`,
      "-only-testing:CtrlProxyUITests/CtrlProxyUITests/testRunService",
      ...envSettings,
      ...signingArgs,
      "2>&1"
    ].join(" ");

    // Start in background
    const child = exec(command, error => {
      if (error) {
        logger.warn(`[IOSCtrlProxy] xcodebuild test exited: ${error.message}`);
      }
    });

    if (child.pid) {
      this.xcTestProcessId = child.pid;
      this.xcTestProcess = child;
      logger.info(`[IOSCtrlProxy] Started xcodebuild test with PID ${child.pid}`);

      // Start process monitoring
      this.startProcessMonitoring();

      // Capture output for debugging
      this.captureProcessOutput(child);
    }
  }

  private async verifyInstalledAppBundle(): Promise<void> {
    if (process.env.AUTOMOBILE_IOS_SKIP_CTRL_PROXY_APP_HASH === "true" ||
        process.env.AUTOMOBILE_IOS_SKIP_CTRL_PROXY_APP_HASH === "1") {
      return;
    }

    const expectedHash = this.builder.getExpectedAppHash("device");
    if (!expectedHash) {
      logger.warn("[IOSCtrlProxy] CtrlProxy app hash verification skipped (no expected hash configured)");
      return;
    }

    const deviceHash = await this.appInspector.getInstalledAppBundleHash(
      this.device.deviceId,
      IOSCtrlProxyManager.APP_BUNDLE_ID
    );
    if (!deviceHash) {
      logger.warn("[IOSCtrlProxy] Unable to read installed CtrlProxy app hash from device");
      return;
    }

    if (deviceHash.toLowerCase() !== expectedHash.toLowerCase()) {
      logger.warn("[IOSCtrlProxy] Installed CtrlProxy app hash mismatch", {
        deviceHash,
        expectedHash
      });
      try {
        await this.appInspector.uninstallApp(this.device.deviceId, IOSCtrlProxyManager.APP_BUNDLE_ID);
        logger.info("[IOSCtrlProxy] Uninstalled CtrlProxy app to force reinstall");
      } catch (error) {
        logger.warn(`[IOSCtrlProxy] Failed to uninstall CtrlProxy app: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }

    logger.info("[IOSCtrlProxy] Installed CtrlProxy app hash matches expected bundle");
  }

  private async checkHealthEndpoint(): Promise<boolean> {
    try {
      const host = this.useHostControl() ? this.hostControl.getHost() : "localhost";
      if (this.useHostControl()) {
        const controller = new AbortController();
        const timeoutId = this.timer.setTimeout(() => controller.abort(), 2000);
        try {
          const response = await fetch(`http://${host}:${this.servicePort}/health`, {
            signal: controller.signal
          });
          const body = await response.text();
          return body.includes("ok") || body.includes("healthy");
        } finally {
          this.timer.clearTimeout(timeoutId);
        }
      }

      // Use curl to check the health endpoint locally
      const { stdout } = await this.processExecutor.exec(
        `curl -s --max-time 2 http://${host}:${this.servicePort}/health`
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
      return IOSCtrlProxyManager.DEFAULT_IPROXY_START_TIMEOUT_MS;
    }
    const parsed = Number.parseInt(envValue, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      logger.warn(`[IOSCtrlProxy] Invalid iproxy timeout '${envValue}', using default ${IOSCtrlProxyManager.DEFAULT_IPROXY_START_TIMEOUT_MS}ms`);
      return IOSCtrlProxyManager.DEFAULT_IPROXY_START_TIMEOUT_MS;
    }
    return parsed;
  }

  private async startIproxyTunnel(): Promise<void> {
    if (this.isSimulator()) {
      return;
    }

    if (this.useHostControl()) {
      if (this.iproxyProcessId) {
        const status = await this.hostControl.getIproxyStatus({ pid: this.iproxyProcessId });
        if (status.success && status.data?.running) {
          return;
        }
      }

      await this.stopIproxyTunnel();

      const result = await this.hostControl.startIproxy({
        deviceId: this.device.deviceId,
        localPort: this.servicePort,
        devicePort: this.servicePort
      });
      if (!result.success || !result.data) {
        throw new Error(result.error || "Failed to start iproxy tunnel via host control");
      }

      this.iproxyProcessId = result.data.pid;
      this.iproxyProcess = null;
      await this.waitForIproxyStartup();
      return;
    }

    if (this.iproxyProcessId && await this.isProcessRunning(this.iproxyProcessId)) {
      return;
    }

    await this.stopIproxyTunnel();

    logger.info(`[IOSCtrlProxy] Starting iproxy tunnel (localhost:${this.servicePort} -> device:${this.servicePort})`);
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
    this.captureIproxyOutput(child);

    child.on("exit", () => {
      if (!this.isStopping) {
        logger.warn("[IOSCtrlProxy] iproxy exited unexpectedly");
        this.iproxyProcessId = null;
        this.iproxyProcess = null;
        this.scheduleIproxyRestart();
      }
    });

    child.on("error", error => {
      if (!this.isStopping) {
        logger.warn(`[IOSCtrlProxy] iproxy error: ${error.message}`);
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

    if (this.useHostControl()) {
      if (this.iproxyProcessId) {
        const result = await this.hostControl.stopIproxy({ pid: this.iproxyProcessId });
        if (!result.success) {
          logger.warn(`[IOSCtrlProxy] Failed to stop host iproxy: ${result.error || "Unknown error"}`);
        }
      }
    } else if (this.iproxyProcess && typeof this.iproxyProcess.kill === "function") {
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
  }

  private async waitForIproxyStartup(): Promise<void> {
    const timeoutMs = this.getIproxyStartTimeoutMs();
    const deadline = this.timer.now() + timeoutMs;

    while (this.timer.now() < deadline) {
      if (this.iproxyProcessId) {
        if (this.useHostControl()) {
          const status = await this.hostControl.getIproxyStatus({ pid: this.iproxyProcessId });
          if (status.success && status.data?.running) {
            return;
          }
        } else if (await this.isProcessRunning(this.iproxyProcessId)) {
          return;
        }
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
      IOSCtrlProxyManager.IPROXY_RESTART_BASE_DELAY_MS * Math.pow(2, this.iproxyRestartAttempts - 1),
      IOSCtrlProxyManager.IPROXY_RESTART_MAX_DELAY_MS
    );

    this.iproxyRestartTimeout = this.timer.setTimeout(() => {
      this.iproxyRestartTimeout = null;
      void this.startIproxyTunnel().then(() => {
        this.startIproxyMonitoring();
      }).catch(error => {
        logger.warn(`[IOSCtrlProxy] Failed to restart iproxy: ${error instanceof Error ? error.message : String(error)}`);
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
          logger.warn(`[IOSCtrlProxy] Device ${this.device.deviceId} not detected, stopping iproxy monitoring`);
          await this.stopIproxyTunnel();
          return;
        }

        // Check iproxy process liveness — not CtrlProxy health. A temporarily slow
        // CtrlProxy would fail a health check even though the tunnel is fine; restarting
        // the tunnel in that case is harmful. CtrlProxy's own health is covered by the
        // separate 30 s process monitor.
        const iproxyAlive = await this.isIproxyProcessAlive();
        if (!iproxyAlive) {
          logger.warn("[IOSCtrlProxy] iproxy process is no longer running, scheduling restart");
          await this.stopIproxyTunnel();
          this.scheduleIproxyRestart();
        }
      } catch (error) {
        logger.warn(`[IOSCtrlProxy] iproxy monitor error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }, IOSCtrlProxyManager.IPROXY_MONITOR_INTERVAL_MS);
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
        if (this.useHostControl()) {
          const result = await this.hostControl.runSimctl(["list", "devices"]);
          if (!result.success || !result.data) {
            return false;
          }
          return result.data.stdout.includes(this.device.deviceId);
        }

        const { stdout } = await this.processExecutor.exec("xcrun simctl list devices");
        return stdout.includes(this.device.deviceId);
      } catch {
        return false;
      }
    }

    try {
      if (this.useHostControl()) {
        const result = await this.hostControl.runIdeviceId(["-l"]);
        if (!result.success || !result.data) {
          return false;
        }
        return result.data.stdout.split("\n").some(line => line.trim() === this.device.deviceId);
      }

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
   * Get device capabilities for CtrlProxy
   */
  public async getCapabilities(): Promise<CtrlProxyIosCapabilities> {
    const isSimulator = this.isSimulator();

    return {
      supportsXCTest: true, // XCUITest is available on all iOS devices
      deviceType: isSimulator ? "simulator" : "physical",
      iosVersion: null // TODO: Get from device info
    };
  }
}
