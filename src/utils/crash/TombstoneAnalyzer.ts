import type { BootedDevice } from "../../models";
import type { AdbExecutor } from "../android-cmdline-tools/interfaces/AdbExecutor";
import type {
  CrashDetector,
  CrashEvent,
  AnrEvent,
  CrashEventListener,
  AnrEventListener,
  ParsedCrash,
} from "../interfaces/CrashMonitor";
import { AdbClientFactory, defaultAdbClientFactory } from "../android-cmdline-tools/AdbClientFactory";
import { logger } from "../logger";

/**
 * Detects native crashes by analyzing tombstone files.
 * Tombstones are created by the Android system when a native crash occurs.
 */
export class TombstoneAnalyzer implements CrashDetector {
  readonly name = "tombstone";

  private adb: AdbExecutor | null = null;
  private adbFactory: AdbClientFactory;
  private device: BootedDevice | null = null;
  private packageName: string | null = null;
  private running = false;
  private processedTombstones = new Set<string>();
  private crashListeners: CrashEventListener[] = [];
  private anrListeners: AnrEventListener[] = [];
  private startTime = 0;

  constructor(adbFactory: AdbClientFactory = defaultAdbClientFactory) {
    this.adbFactory = adbFactory;
  }

  async start(device: BootedDevice, packageName: string): Promise<void> {
    this.device = device;
    this.packageName = packageName;
    this.running = true;
    this.processedTombstones.clear();
    this.startTime = Date.now();

    // Create ADB client for this device
    this.adb = this.adbFactory.create(device);

    // Get list of existing tombstones to ignore them
    await this.initializeExistingTombstones();

    logger.info(
      `TombstoneAnalyzer started for package ${packageName} on device ${device.deviceId}`
    );
  }

  async stop(): Promise<void> {
    this.running = false;
    this.device = null;
    this.packageName = null;
    this.processedTombstones.clear();
    logger.info("TombstoneAnalyzer stopped");
  }

  async checkForCrashes(): Promise<CrashEvent[]> {
    if (!this.running || !this.device || !this.packageName || !this.adb) {
      return [];
    }

    const crashes: CrashEvent[] = [];

    try {
      // List tombstone files
      const tombstoneList = await this.listTombstones();

      for (const tombstone of tombstoneList) {
        if (this.processedTombstones.has(tombstone.name)) {
          continue;
        }

        // Only process tombstones created after we started monitoring
        if (tombstone.timestamp < this.startTime) {
          this.processedTombstones.add(tombstone.name);
          continue;
        }

        // Read and parse the tombstone
        const content = await this.readTombstone(tombstone.path);
        if (!content) {
          this.processedTombstones.add(tombstone.name);
          continue;
        }

        const parsed = this.parseTombstone(content);

        // Check if it's for our target package
        if (parsed && this.matchesPackage(parsed.packageName, this.packageName)) {
          this.processedTombstones.add(tombstone.name);

          const event: CrashEvent = {
            deviceId: this.device.deviceId,
            packageName: parsed.packageName,
            crashType: "native",
            timestamp: tombstone.timestamp,
            processName: parsed.processName,
            pid: parsed.pid,
            signal: parsed.signal,
            faultAddress: parsed.faultAddress,
            stacktrace: parsed.stacktrace,
            tombstonePath: tombstone.path,
            detectionSource: "tombstone",
            rawLog: content.slice(0, 5000), // Limit size
          };

          crashes.push(event);
          this.notifyCrashListeners(event);
        } else {
          this.processedTombstones.add(tombstone.name);
        }
      }
    } catch (error) {
      logger.debug(`Error analyzing tombstones: ${error}`);
    }

    return crashes;
  }

  async checkForAnrs(): Promise<AnrEvent[]> {
    // Tombstones don't contain ANR information
    return [];
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

  /**
   * Get list of existing tombstones to ignore
   */
  private async initializeExistingTombstones(): Promise<void> {
    const tombstones = await this.listTombstones();
    for (const t of tombstones) {
      this.processedTombstones.add(t.name);
    }
  }

  /**
   * List tombstone files with their timestamps
   */
  private async listTombstones(): Promise<
    { name: string; path: string; timestamp: number }[]
    > {
    const tombstones: { name: string; path: string; timestamp: number }[] = [];

    try {
      // Try new location first (Android 11+)
      const newLocationResult = await this.adb.executeCommand(
        "shell ls -la /data/tombstones/ 2>/dev/null || true",
        5000
      );

      if (newLocationResult.stdout) {
        const entries = this.parseDirectoryListing(
          newLocationResult.stdout,
          "/data/tombstones"
        );
        tombstones.push(...entries);
      }

      // Also try legacy location
      const legacyResult = await this.adb.executeCommand(
        "shell ls -la /data/local/tmp/tombstones/ 2>/dev/null || true",
        5000
      );

      if (legacyResult.stdout) {
        const entries = this.parseDirectoryListing(
          legacyResult.stdout,
          "/data/local/tmp/tombstones"
        );
        tombstones.push(...entries);
      }
    } catch (error) {
      logger.debug(`Error listing tombstones: ${error}`);
    }

    return tombstones;
  }

  /**
   * Parse directory listing output
   */
  private parseDirectoryListing(
    output: string,
    basePath: string
  ): { name: string; path: string; timestamp: number }[] {
    const entries: { name: string; path: string; timestamp: number }[] = [];
    const lines = output.split("\n");

    for (const line of lines) {
      // Match tombstone files (tombstone_XX or tombstone_XX.pb)
      const match = line.match(/\s+(tombstone_\d+(?:\.pb)?)\s*$/);
      if (match) {
        const name = match[1];

        // Try to extract timestamp from ls -la output
        const dateMatch = line.match(
          /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/
        );
        let timestamp = Date.now();
        if (dateMatch) {
          const parsed = Date.parse(dateMatch[1]);
          if (!isNaN(parsed)) {
            timestamp = parsed;
          }
        }

        entries.push({
          name,
          path: `${basePath}/${name}`,
          timestamp,
        });
      }
    }

    return entries;
  }

  /**
   * Read a tombstone file contents
   */
  private async readTombstone(path: string): Promise<string | null> {
    try {
      const result = await this.adb.executeCommand(
        `shell cat ${path} 2>/dev/null`,
        10000
      );

      if (result.stdout && result.stdout.length > 0) {
        return result.stdout;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Parse tombstone content to extract crash information
   */
  private parseTombstone(content: string): ParsedCrash | null {
    const crash: Partial<ParsedCrash> = {
      crashType: "native",
    };

    // Extract command line (process name)
    const cmdlineMatch = content.match(/Cmdline:\s*(.+)/);
    if (cmdlineMatch) {
      const cmdline = cmdlineMatch[1].trim();
      crash.processName = cmdline;
      // Package name is typically the first part before any arguments
      crash.packageName = cmdline.split(/\s+/)[0];
    }

    // Extract PID
    const pidMatch = content.match(/pid:\s*(\d+)/);
    if (pidMatch) {
      crash.pid = parseInt(pidMatch[1], 10);
    }

    // Extract signal
    const signalMatch = content.match(/signal\s+(\d+)\s+\((\w+)\)/);
    if (signalMatch) {
      crash.signal = signalMatch[2]; // e.g., SIGSEGV
    }

    // Extract fault address
    const faultMatch = content.match(/fault addr\s+(0x[0-9a-fA-F]+)/);
    if (faultMatch) {
      crash.faultAddress = faultMatch[1];
    }

    // Extract backtrace
    const backtraceStart = content.indexOf("backtrace:");
    if (backtraceStart !== -1) {
      const backtraceSection = content.slice(
        backtraceStart,
        backtraceStart + 3000
      );
      const stackLines = backtraceSection
        .split("\n")
        .filter(line => line.match(/^\s+#\d+/))
        .slice(0, 30);
      crash.stacktrace = stackLines.join("\n");
    }

    if (crash.packageName) {
      return crash as ParsedCrash;
    }

    return null;
  }

  private matchesPackage(
    detectedPackage: string | undefined,
    targetPackage: string
  ): boolean {
    if (!detectedPackage) {return false;}
    return (
      detectedPackage === targetPackage ||
      detectedPackage.startsWith(targetPackage + ":") ||
      detectedPackage.includes(targetPackage)
    );
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
}
