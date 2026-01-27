import type { BootedDevice } from "../../src/models";
import type {
  CrashDetector,
  CrashEvent,
  AnrEvent,
  CrashEventListener,
  AnrEventListener,
} from "../../src/utils/interfaces/CrashMonitor";

/**
 * Fake implementation of CrashDetector for testing.
 * Allows configuring crash/ANR events and verifying behavior.
 */
export class FakeCrashDetector implements CrashDetector {
  readonly name: string;

  private running = false;
  private device: BootedDevice | null = null;
  private packageName: string | null = null;

  private pendingCrashes: CrashEvent[] = [];
  private pendingAnrs: AnrEvent[] = [];
  private crashListeners: CrashEventListener[] = [];
  private anrListeners: AnrEventListener[] = [];

  // Tracking for assertions
  private startCalled = false;
  private stopCalled = false;
  private checkForCrashesCalls = 0;
  private checkForAnrsCalls = 0;

  constructor(name = "fake") {
    this.name = name;
  }

  async start(device: BootedDevice, packageName: string): Promise<void> {
    this.device = device;
    this.packageName = packageName;
    this.running = true;
    this.startCalled = true;
  }

  async stop(): Promise<void> {
    this.running = false;
    this.device = null;
    this.packageName = null;
    this.stopCalled = true;
  }

  async checkForCrashes(): Promise<CrashEvent[]> {
    this.checkForCrashesCalls++;
    const crashes = [...this.pendingCrashes];
    this.pendingCrashes = [];

    // Note: Don't notify listeners here - checkForCrashes() is for polling mode
    // where the coordinator handles notification after deduplication.
    // Use simulateCrash() for immediate notification (streaming mode).

    return crashes;
  }

  async checkForAnrs(): Promise<AnrEvent[]> {
    this.checkForAnrsCalls++;
    const anrs = [...this.pendingAnrs];
    this.pendingAnrs = [];

    // Note: Don't notify listeners here - checkForAnrs() is for polling mode
    // where the coordinator handles notification after deduplication.
    // Use simulateAnr() for immediate notification (streaming mode).

    return anrs;
  }

  isRunning(): boolean {
    return this.running;
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
   * Add a crash that will be returned on the next checkForCrashes call
   */
  addPendingCrash(crash: CrashEvent): void {
    this.pendingCrashes.push(crash);
  }

  /**
   * Add an ANR that will be returned on the next checkForAnrs call
   */
  addPendingAnr(anr: AnrEvent): void {
    this.pendingAnrs.push(anr);
  }

  /**
   * Simulate an immediate crash detection (notifies listeners immediately)
   */
  simulateCrash(crash: CrashEvent): void {
    for (const listener of this.crashListeners) {
      try {
        void listener(crash);
      } catch {
        // Ignore listener errors in tests
      }
    }
  }

  /**
   * Simulate an immediate ANR detection (notifies listeners immediately)
   */
  simulateAnr(anr: AnrEvent): void {
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
   * Check if start was called
   */
  wasStartCalled(): boolean {
    return this.startCalled;
  }

  /**
   * Check if stop was called
   */
  wasStopCalled(): boolean {
    return this.stopCalled;
  }

  /**
   * Get the number of times checkForCrashes was called
   */
  getCheckForCrashesCallCount(): number {
    return this.checkForCrashesCalls;
  }

  /**
   * Get the number of times checkForAnrs was called
   */
  getCheckForAnrsCallCount(): number {
    return this.checkForAnrsCalls;
  }

  /**
   * Get the device that was passed to start
   */
  getStartedDevice(): BootedDevice | null {
    return this.device;
  }

  /**
   * Get the package name that was passed to start
   */
  getStartedPackageName(): string | null {
    return this.packageName;
  }

  /**
   * Reset all tracking state
   */
  reset(): void {
    this.running = false;
    this.device = null;
    this.packageName = null;
    this.pendingCrashes = [];
    this.pendingAnrs = [];
    this.startCalled = false;
    this.stopCalled = false;
    this.checkForCrashesCalls = 0;
    this.checkForAnrsCalls = 0;
  }
}

/**
 * Create a sample crash event for testing
 */
export function createSampleCrashEvent(
  overrides: Partial<CrashEvent> = {}
): CrashEvent {
  return {
    deviceId: "emulator-5554",
    packageName: "com.example.app",
    crashType: "java",
    timestamp: Date.now(),
    processName: "com.example.app",
    pid: 12345,
    exceptionClass: "java.lang.NullPointerException",
    exceptionMessage: "Attempt to invoke method on null reference",
    stacktrace: "at com.example.app.MainActivity.onCreate(MainActivity.java:42)",
    detectionSource: "logcat",
    ...overrides,
  };
}

/**
 * Create a sample ANR event for testing
 */
export function createSampleAnrEvent(
  overrides: Partial<AnrEvent> = {}
): AnrEvent {
  return {
    deviceId: "emulator-5554",
    packageName: "com.example.app",
    timestamp: Date.now(),
    processName: "com.example.app",
    pid: 12345,
    reason: "Input dispatching timed out",
    activity: "com.example.app/.MainActivity",
    waitDurationMs: 5000,
    detectionSource: "logcat",
    ...overrides,
  };
}
