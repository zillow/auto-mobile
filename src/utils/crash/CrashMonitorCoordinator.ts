import type { BootedDevice } from "../../models";
import type { AdbExecutor } from "../android-cmdline-tools/interfaces/AdbExecutor";
import type {
  CrashMonitor,
  CrashDetector,
  CrashEvent,
  AnrEvent,
  CrashEventListener,
  AnrEventListener,
  CrashMonitorConfig,
} from "../interfaces/CrashMonitor";
import type { Timer } from "../interfaces/Timer";
import { defaultTimer } from "../SystemTimer";
import { LogcatCrashDetector } from "./LogcatCrashDetector";
import { ProcessStateCrashDetector } from "./ProcessStateCrashDetector";
import { TombstoneAnalyzer } from "./TombstoneAnalyzer";
import { DropboxCrashDetector } from "./DropboxCrashDetector";
import { AccessibilityDialogDetector } from "./AccessibilityDialogDetector";
import { logger } from "../logger";

const DEFAULT_POLLING_INTERVAL_MS = 1000;

/**
 * Dependencies for CrashMonitorCoordinator
 * Enables dependency injection for testing
 */
export interface CrashMonitorCoordinatorDependencies {
  adb?: AdbExecutor;
  timer?: Timer;
  logcatDetector?: CrashDetector;
  processDetector?: CrashDetector;
  tombstoneDetector?: CrashDetector;
  dropboxDetector?: CrashDetector;
  accessibilityDetector?: CrashDetector;
}

/**
 * Coordinates multiple crash detectors to provide comprehensive crash monitoring.
 * Supports polling-based detection with configurable interval.
 */
export class CrashMonitorCoordinator implements CrashMonitor {
  private detectors: CrashDetector[] = [];
  private device: BootedDevice | null = null;
  private packageName: string | null = null;
  private monitoring = false;
  private pollingIntervalMs = DEFAULT_POLLING_INTERVAL_MS;
  private pollingHandle: NodeJS.Timeout | null = null;
  private timer: Timer;

  private collectedCrashes: CrashEvent[] = [];
  private collectedAnrs: AnrEvent[] = [];
  private crashListeners: CrashEventListener[] = [];
  private anrListeners: AnrEventListener[] = [];

  private currentNavigationNodeId: number | null = null;
  private currentTestExecutionId: number | null = null;
  private sessionUuid: string | null = null;

  private dependencies: CrashMonitorCoordinatorDependencies;

  constructor(dependencies: CrashMonitorCoordinatorDependencies = {}) {
    this.dependencies = dependencies;
    this.timer = dependencies.timer ?? defaultTimer;
  }

  async start(
    device: BootedDevice,
    packageName: string,
    config?: CrashMonitorConfig
  ): Promise<void> {
    if (this.monitoring) {
      await this.stop();
    }

    this.device = device;
    this.packageName = packageName;
    this.pollingIntervalMs = config?.pollingIntervalMs ?? DEFAULT_POLLING_INTERVAL_MS;
    this.sessionUuid = config?.sessionUuid ?? null;
    this.collectedCrashes = [];
    this.collectedAnrs = [];

    // Initialize detectors based on config
    this.detectors = this.createDetectors(config);

    // Start all detectors
    for (const detector of this.detectors) {
      try {
        await detector.start(device, packageName);

        // Forward events from detectors
        detector.addCrashListener(this.handleCrashEvent.bind(this));
        detector.addAnrListener(this.handleAnrEvent.bind(this));
      } catch (error) {
        logger.warn(`Failed to start detector ${detector.name}: ${error}`);
      }
    }

    this.monitoring = true;

    // Start polling
    this.startPolling();

    logger.info(
      `CrashMonitorCoordinator started for ${packageName} on ${device.deviceId} with ${this.detectors.length} detectors`
    );
  }

  async stop(): Promise<void> {
    this.stopPolling();

    // Stop all detectors
    for (const detector of this.detectors) {
      try {
        await detector.stop();
      } catch (error) {
        logger.warn(`Failed to stop detector ${detector.name}: ${error}`);
      }
    }

    this.detectors = [];
    this.monitoring = false;
    this.device = null;
    this.packageName = null;

    logger.info("CrashMonitorCoordinator stopped");
  }

  async poll(): Promise<{ crashes: CrashEvent[]; anrs: AnrEvent[] }> {
    if (!this.monitoring) {
      return { crashes: [], anrs: [] };
    }

    const newCrashes: CrashEvent[] = [];
    const newAnrs: AnrEvent[] = [];

    // Poll each detector
    for (const detector of this.detectors) {
      try {
        const crashes = await detector.checkForCrashes();
        for (const crash of crashes) {
          this.enrichEvent(crash);
          newCrashes.push(crash);
        }

        const anrs = await detector.checkForAnrs();
        for (const anr of anrs) {
          this.enrichEvent(anr);
          newAnrs.push(anr);
        }
      } catch (error) {
        logger.debug(`Error polling detector ${detector.name}: ${error}`);
      }
    }

    // Deduplicate crashes (different detectors may find the same crash)
    const uniqueCrashes = this.deduplicateCrashes(newCrashes);
    const uniqueAnrs = this.deduplicateAnrs(newAnrs);

    // Add to collected events
    this.collectedCrashes.push(...uniqueCrashes);
    this.collectedAnrs.push(...uniqueAnrs);

    return { crashes: uniqueCrashes, anrs: uniqueAnrs };
  }

  getCrashes(): CrashEvent[] {
    return [...this.collectedCrashes];
  }

  getAnrs(): AnrEvent[] {
    return [...this.collectedAnrs];
  }

  clearEvents(): void {
    this.collectedCrashes = [];
    this.collectedAnrs = [];
  }

  isMonitoring(): boolean {
    return this.monitoring;
  }

  getMonitoredPackage(): string | null {
    return this.packageName;
  }

  getMonitoredDevice(): BootedDevice | null {
    return this.device;
  }

  setCurrentNavigationNodeId(nodeId: number | null): void {
    this.currentNavigationNodeId = nodeId;
  }

  setCurrentTestExecutionId(executionId: number | null): void {
    this.currentTestExecutionId = executionId;
  }

  addCrashListener(listener: CrashEventListener): void {
    this.crashListeners.push(listener);
  }

  removeCrashListener(listener: CrashEventListener): void {
    const index = this.crashListeners.indexOf(listener);
    if (index !== -1) {
      this.crashListeners.splice(index, 1);
    }
  }

  addAnrListener(listener: AnrEventListener): void {
    this.anrListeners.push(listener);
  }

  removeAnrListener(listener: AnrEventListener): void {
    const index = this.anrListeners.indexOf(listener);
    if (index !== -1) {
      this.anrListeners.splice(index, 1);
    }
  }

  /**
   * Create detectors based on configuration
   */
  private createDetectors(config?: CrashMonitorConfig): CrashDetector[] {
    const detectors: CrashDetector[] = [];
    const adb = this.dependencies.adb;

    // Logcat detector (enabled by default)
    if (config?.enableLogcat !== false) {
      const detector = this.dependencies.logcatDetector ?? new LogcatCrashDetector(adb);
      detectors.push(detector);
    }

    // Process state detector (enabled by default)
    if (config?.enableProcessMonitor !== false) {
      const detector = this.dependencies.processDetector ?? new ProcessStateCrashDetector(adb);
      detectors.push(detector);
    }

    // Tombstone analyzer (enabled by default)
    if (config?.enableTombstone !== false) {
      const detector = this.dependencies.tombstoneDetector ?? new TombstoneAnalyzer(adb);
      detectors.push(detector);
    }

    // Dropbox detector (enabled by default)
    if (config?.enableDropbox !== false) {
      const detector = this.dependencies.dropboxDetector ?? new DropboxCrashDetector(adb);
      detectors.push(detector);
    }

    // Accessibility dialog detector (enabled by default)
    if (config?.enableAccessibility !== false) {
      const detector = this.dependencies.accessibilityDetector ?? new AccessibilityDialogDetector(adb);
      detectors.push(detector);
    }

    return detectors;
  }

  /**
   * Start the polling loop
   */
  private startPolling(): void {
    if (this.pollingHandle) {
      return;
    }

    this.pollingHandle = this.timer.setInterval(() => {
      void this.poll();
    }, this.pollingIntervalMs);
  }

  /**
   * Stop the polling loop
   */
  private stopPolling(): void {
    if (this.pollingHandle) {
      this.timer.clearInterval(this.pollingHandle);
      this.pollingHandle = null;
    }
  }

  /**
   * Enrich an event with current context (navigation node, test execution, etc.)
   */
  private enrichEvent(event: CrashEvent | AnrEvent): void {
    if (this.currentNavigationNodeId !== null && event.navigationNodeId === undefined) {
      event.navigationNodeId = this.currentNavigationNodeId;
    }

    if (this.currentTestExecutionId !== null && event.testExecutionId === undefined) {
      event.testExecutionId = this.currentTestExecutionId;
    }

    if (this.sessionUuid !== null && event.sessionUuid === undefined) {
      event.sessionUuid = this.sessionUuid;
    }
  }

  /**
   * Handle a crash event from a detector
   */
  private handleCrashEvent(event: CrashEvent): void {
    this.enrichEvent(event);

    // Check if we already have this crash (deduplication)
    const isDuplicate = this.collectedCrashes.some(
      c => this.isSameCrash(c, event)
    );

    if (!isDuplicate) {
      this.collectedCrashes.push(event);
      this.notifyCrashListeners(event);
    }
  }

  /**
   * Handle an ANR event from a detector
   */
  private handleAnrEvent(event: AnrEvent): void {
    this.enrichEvent(event);

    // Check if we already have this ANR (deduplication)
    const isDuplicate = this.collectedAnrs.some(
      a => this.isSameAnr(a, event)
    );

    if (!isDuplicate) {
      this.collectedAnrs.push(event);
      this.notifyAnrListeners(event);
    }
  }

  /**
   * Deduplicate crashes from different detectors
   */
  private deduplicateCrashes(crashes: CrashEvent[]): CrashEvent[] {
    const unique: CrashEvent[] = [];

    for (const crash of crashes) {
      const isDuplicate =
        unique.some(c => this.isSameCrash(c, crash)) ||
        this.collectedCrashes.some(c => this.isSameCrash(c, crash));

      if (!isDuplicate) {
        unique.push(crash);
      }
    }

    return unique;
  }

  /**
   * Deduplicate ANRs from different detectors
   */
  private deduplicateAnrs(anrs: AnrEvent[]): AnrEvent[] {
    const unique: AnrEvent[] = [];

    for (const anr of anrs) {
      const isDuplicate =
        unique.some(a => this.isSameAnr(a, anr)) ||
        this.collectedAnrs.some(a => this.isSameAnr(a, anr));

      if (!isDuplicate) {
        unique.push(anr);
      }
    }

    return unique;
  }

  /**
   * Check if two crash events represent the same crash
   */
  private isSameCrash(a: CrashEvent, b: CrashEvent): boolean {
    // Same crash if within 5 seconds and same exception
    const timeDiff = Math.abs(a.timestamp - b.timestamp);
    if (timeDiff > 5000) {
      return false;
    }

    return (
      a.packageName === b.packageName &&
      a.crashType === b.crashType &&
      a.exceptionClass === b.exceptionClass
    );
  }

  /**
   * Check if two ANR events represent the same ANR
   */
  private isSameAnr(a: AnrEvent, b: AnrEvent): boolean {
    // Same ANR if within 5 seconds
    const timeDiff = Math.abs(a.timestamp - b.timestamp);
    if (timeDiff > 5000) {
      return false;
    }

    return a.packageName === b.packageName;
  }

  private notifyCrashListeners(event: CrashEvent): void {
    for (const listener of this.crashListeners) {
      try {
        void listener(event);
      } catch (error) {
        logger.error(`Error in crash listener: ${error}`);
      }
    }
  }

  private notifyAnrListeners(event: AnrEvent): void {
    for (const listener of this.anrListeners) {
      try {
        void listener(event);
      } catch (error) {
        logger.error(`Error in ANR listener: ${error}`);
      }
    }
  }
}
