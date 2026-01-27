import type { BootedDevice } from "../../src/models";
import type {
  CrashMonitor,
  CrashEvent,
  AnrEvent,
  CrashEventListener,
  AnrEventListener,
  CrashMonitorConfig,
} from "../../src/utils/interfaces/CrashMonitor";

/**
 * Fake implementation of CrashMonitor (coordinator) for testing.
 * Allows configuring crash/ANR events and verifying behavior.
 */
export class FakeCrashMonitor implements CrashMonitor {
  private monitoring = false;
  private device: BootedDevice | null = null;
  private packageName: string | null = null;
  private config: CrashMonitorConfig | undefined;

  private crashes: CrashEvent[] = [];
  private anrs: AnrEvent[] = [];
  private crashListeners: CrashEventListener[] = [];
  private anrListeners: AnrEventListener[] = [];

  private currentNavigationNodeId: number | null = null;
  private currentTestExecutionId: number | null = null;

  // Tracking for assertions
  private startCalls: { device: BootedDevice; packageName: string; config?: CrashMonitorConfig }[] = [];
  private stopCalls = 0;
  private pollCalls = 0;
  private clearEventsCalls = 0;

  async start(
    device: BootedDevice,
    packageName: string,
    config?: CrashMonitorConfig
  ): Promise<void> {
    this.device = device;
    this.packageName = packageName;
    this.config = config;
    this.monitoring = true;
    this.startCalls.push({ device, packageName, config });
  }

  async stop(): Promise<void> {
    this.monitoring = false;
    this.device = null;
    this.packageName = null;
    this.stopCalls++;
  }

  async poll(): Promise<{ crashes: CrashEvent[]; anrs: AnrEvent[] }> {
    this.pollCalls++;
    // Return empty by default - tests can use addCrash/addAnr to simulate detection
    return { crashes: [], anrs: [] };
  }

  getCrashes(): CrashEvent[] {
    return [...this.crashes];
  }

  getAnrs(): AnrEvent[] {
    return [...this.anrs];
  }

  clearEvents(): void {
    this.crashes = [];
    this.anrs = [];
    this.clearEventsCalls++;
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

  // ============ Test Configuration Methods ============

  /**
   * Add a crash to the collected crashes (simulating detection)
   */
  addCrash(crash: CrashEvent): void {
    // Enrich with current context
    if (this.currentNavigationNodeId !== null && crash.navigationNodeId === undefined) {
      crash.navigationNodeId = this.currentNavigationNodeId;
    }
    if (this.currentTestExecutionId !== null && crash.testExecutionId === undefined) {
      crash.testExecutionId = this.currentTestExecutionId;
    }

    this.crashes.push(crash);

    // Notify listeners
    for (const listener of this.crashListeners) {
      try {
        void listener(crash);
      } catch {
        // Ignore listener errors in tests
      }
    }
  }

  /**
   * Add an ANR to the collected ANRs (simulating detection)
   */
  addAnr(anr: AnrEvent): void {
    // Enrich with current context
    if (this.currentNavigationNodeId !== null && anr.navigationNodeId === undefined) {
      anr.navigationNodeId = this.currentNavigationNodeId;
    }
    if (this.currentTestExecutionId !== null && anr.testExecutionId === undefined) {
      anr.testExecutionId = this.currentTestExecutionId;
    }

    this.anrs.push(anr);

    // Notify listeners
    for (const listener of this.anrListeners) {
      try {
        void listener(anr);
      } catch {
        // Ignore listener errors in tests
      }
    }
  }

  // ============ Assertion Helpers ============

  /**
   * Get all start calls made
   */
  getStartCalls(): { device: BootedDevice; packageName: string; config?: CrashMonitorConfig }[] {
    return [...this.startCalls];
  }

  /**
   * Get the number of stop calls
   */
  getStopCallCount(): number {
    return this.stopCalls;
  }

  /**
   * Get the number of poll calls
   */
  getPollCallCount(): number {
    return this.pollCalls;
  }

  /**
   * Get the number of clearEvents calls
   */
  getClearEventsCallCount(): number {
    return this.clearEventsCalls;
  }

  /**
   * Get the current navigation node ID
   */
  getCurrentNavigationNodeId(): number | null {
    return this.currentNavigationNodeId;
  }

  /**
   * Get the current test execution ID
   */
  getCurrentTestExecutionId(): number | null {
    return this.currentTestExecutionId;
  }

  /**
   * Get the configuration passed to start
   */
  getConfig(): CrashMonitorConfig | undefined {
    return this.config;
  }

  /**
   * Get the number of crash listeners
   */
  getCrashListenerCount(): number {
    return this.crashListeners.length;
  }

  /**
   * Get the number of ANR listeners
   */
  getAnrListenerCount(): number {
    return this.anrListeners.length;
  }

  /**
   * Reset all tracking state
   */
  reset(): void {
    this.monitoring = false;
    this.device = null;
    this.packageName = null;
    this.config = undefined;
    this.crashes = [];
    this.anrs = [];
    this.currentNavigationNodeId = null;
    this.currentTestExecutionId = null;
    this.startCalls = [];
    this.stopCalls = 0;
    this.pollCalls = 0;
    this.clearEventsCalls = 0;
  }
}
