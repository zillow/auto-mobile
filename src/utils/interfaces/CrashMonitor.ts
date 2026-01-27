import type { BootedDevice } from "../../models";

/**
 * Types of crashes that can be detected
 */
export type CrashType = "java" | "native" | "system";

/**
 * Sources from which crashes can be detected
 */
export type CrashDetectionSource =
  | "logcat"
  | "tombstone"
  | "dropbox"
  | "accessibility"
  | "process_monitor";

/**
 * Sources from which ANRs can be detected
 */
export type AnrDetectionSource = "logcat" | "dropbox" | "accessibility";

/**
 * Represents a detected crash event
 */
export interface CrashEvent {
  deviceId: string;
  packageName: string;
  crashType: CrashType;
  timestamp: number;
  processName?: string;
  pid?: number;
  exceptionClass?: string;
  exceptionMessage?: string;
  stacktrace?: string;
  signal?: string; // For native crashes (SIGSEGV, SIGABRT, etc.)
  faultAddress?: string; // For native crashes
  tombstonePath?: string;
  detectionSource: CrashDetectionSource;
  rawLog?: string;
  navigationNodeId?: number;
  testExecutionId?: number;
  sessionUuid?: string;
}

/**
 * Represents a detected ANR (Application Not Responding) event
 */
export interface AnrEvent {
  deviceId: string;
  packageName: string;
  timestamp: number;
  processName?: string;
  pid?: number;
  reason?: string; // e.g., "Input dispatching timed out"
  activity?: string;
  waitDurationMs?: number;
  cpuUsage?: string;
  mainThreadState?: string;
  stacktrace?: string;
  detectionSource: AnrDetectionSource;
  rawLog?: string;
  navigationNodeId?: number;
  testExecutionId?: number;
  sessionUuid?: string;
}

/**
 * Combined failure event type
 */
export type FailureEvent = CrashEvent | AnrEvent;

/**
 * Listener callback for crash events
 */
export interface CrashEventListener {
  (event: CrashEvent): void | Promise<void>;
}

/**
 * Listener callback for ANR events
 */
export interface AnrEventListener {
  (event: AnrEvent): void | Promise<void>;
}

/**
 * Interface for individual crash/ANR detectors
 * Each detector implements a specific detection method (logcat, tombstone, etc.)
 */
export interface CrashDetector {
  /**
   * Unique name identifying this detector
   */
  readonly name: string;

  /**
   * Start monitoring for crashes on the given device
   * @param device The device to monitor
   * @param packageName The package to monitor (single active window)
   */
  start(device: BootedDevice, packageName: string): Promise<void>;

  /**
   * Stop monitoring
   */
  stop(): Promise<void>;

  /**
   * Check for crashes (polling mode)
   * @returns Array of crash events detected since last check
   */
  checkForCrashes(): Promise<CrashEvent[]>;

  /**
   * Check for ANRs (polling mode)
   * @returns Array of ANR events detected since last check
   */
  checkForAnrs(): Promise<AnrEvent[]>;

  /**
   * Whether this detector is currently running
   */
  isRunning(): boolean;

  /**
   * Add a listener for crash events
   */
  addCrashListener(listener: CrashEventListener): void;

  /**
   * Remove a crash event listener
   */
  removeCrashListener(listener: CrashEventListener): void;

  /**
   * Add a listener for ANR events
   */
  addAnrListener(listener: AnrEventListener): void;

  /**
   * Remove an ANR event listener
   */
  removeAnrListener(listener: AnrEventListener): void;
}

/**
 * Configuration for the crash monitor coordinator
 */
export interface CrashMonitorConfig {
  /**
   * Polling interval in milliseconds (default: 1000)
   */
  pollingIntervalMs?: number;

  /**
   * Whether to enable logcat monitoring (default: true)
   */
  enableLogcat?: boolean;

  /**
   * Whether to enable tombstone analysis (default: true)
   */
  enableTombstone?: boolean;

  /**
   * Whether to enable dropbox monitoring (default: true)
   */
  enableDropbox?: boolean;

  /**
   * Whether to enable accessibility dialog detection (default: true)
   */
  enableAccessibility?: boolean;

  /**
   * Whether to enable process state monitoring (default: true)
   */
  enableProcessMonitor?: boolean;

  /**
   * Session UUID for correlating crashes with sessions
   */
  sessionUuid?: string;
}

/**
 * Interface for the crash monitor coordinator that manages all detectors
 */
export interface CrashMonitor {
  /**
   * Start crash monitoring for a device/package
   * @param device The device to monitor
   * @param packageName The package to monitor
   * @param config Optional configuration
   */
  start(
    device: BootedDevice,
    packageName: string,
    config?: CrashMonitorConfig
  ): Promise<void>;

  /**
   * Stop crash monitoring
   */
  stop(): Promise<void>;

  /**
   * Poll for new failures (crashes and ANRs)
   * @returns Object containing arrays of new crashes and ANRs
   */
  poll(): Promise<{ crashes: CrashEvent[]; anrs: AnrEvent[] }>;

  /**
   * Get all crashes detected during this monitoring session
   */
  getCrashes(): CrashEvent[];

  /**
   * Get all ANRs detected during this monitoring session
   */
  getAnrs(): AnrEvent[];

  /**
   * Clear the collected crashes and ANRs
   */
  clearEvents(): void;

  /**
   * Whether monitoring is currently active
   */
  isMonitoring(): boolean;

  /**
   * Get the currently monitored package
   */
  getMonitoredPackage(): string | null;

  /**
   * Get the currently monitored device
   */
  getMonitoredDevice(): BootedDevice | null;

  /**
   * Update the navigation node ID to associate with future crashes
   */
  setCurrentNavigationNodeId(nodeId: number | null): void;

  /**
   * Update the test execution ID to associate with future crashes
   */
  setCurrentTestExecutionId(executionId: number | null): void;

  /**
   * Add a listener for crash events
   */
  addCrashListener(listener: CrashEventListener): void;

  /**
   * Remove a crash event listener
   */
  removeCrashListener(listener: CrashEventListener): void;

  /**
   * Add a listener for ANR events
   */
  addAnrListener(listener: AnrEventListener): void;

  /**
   * Remove an ANR event listener
   */
  removeAnrListener(listener: AnrEventListener): void;
}

/**
 * Result from parsing a crash log
 */
export interface ParsedCrash {
  crashType: CrashType;
  packageName: string;
  processName?: string;
  pid?: number;
  exceptionClass?: string;
  exceptionMessage?: string;
  stacktrace?: string;
  signal?: string;
  faultAddress?: string;
  timestamp?: number;
}

/**
 * Result from parsing an ANR log
 */
export interface ParsedAnr {
  packageName: string;
  processName?: string;
  pid?: number;
  reason?: string;
  activity?: string;
  waitDurationMs?: number;
  cpuUsage?: string;
  mainThreadState?: string;
  stacktrace?: string;
  timestamp?: number;
}
