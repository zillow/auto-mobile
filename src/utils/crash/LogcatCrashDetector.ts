import type { BootedDevice } from "../../models";
import type { AdbExecutor } from "../android-cmdline-tools/interfaces/AdbExecutor";
import type {
  CrashDetector,
  CrashEvent,
  AnrEvent,
  CrashEventListener,
  AnrEventListener,
  ParsedCrash,
  ParsedAnr,
} from "../interfaces/CrashMonitor";
import { AdbClient } from "../android-cmdline-tools/AdbClient";
import { logger } from "../logger";

/**
 * Detects crashes and ANRs by monitoring ADB logcat output.
 * Uses both the crash buffer (-b crash) and main buffer for comprehensive detection.
 */
export class LogcatCrashDetector implements CrashDetector {
  readonly name = "logcat";

  private adb: AdbExecutor;
  private device: BootedDevice | null = null;
  private packageName: string | null = null;
  private running = false;
  private lastCrashTimestamp = 0;
  private lastAnrTimestamp = 0;
  private crashListeners: CrashEventListener[] = [];
  private anrListeners: AnrEventListener[] = [];
  private processedCrashHashes = new Set<string>();
  private processedAnrHashes = new Set<string>();

  constructor(adb?: AdbExecutor) {
    this.adb = adb ?? new AdbClient();
  }

  async start(device: BootedDevice, packageName: string): Promise<void> {
    this.device = device;
    this.packageName = packageName;
    this.running = true;
    this.lastCrashTimestamp = Date.now();
    this.lastAnrTimestamp = Date.now();
    this.processedCrashHashes.clear();
    this.processedAnrHashes.clear();

    // Set device on ADB client if applicable
    if (this.adb instanceof AdbClient) {
      this.adb.setDevice(device);
    }

    // Clear logcat buffers to start fresh
    try {
      await this.adb.executeCommand("logcat -c -b crash", 5000);
      await this.adb.executeCommand("logcat -c -b main", 5000);
    } catch (error) {
      logger.warn(`Failed to clear logcat buffers: ${error}`);
    }

    logger.info(
      `LogcatCrashDetector started for package ${packageName} on device ${device.deviceId}`
    );
  }

  async stop(): Promise<void> {
    this.running = false;
    this.device = null;
    this.packageName = null;
    logger.info("LogcatCrashDetector stopped");
  }

  async checkForCrashes(): Promise<CrashEvent[]> {
    if (!this.running || !this.device || !this.packageName) {
      return [];
    }

    const crashes: CrashEvent[] = [];

    try {
      // Check crash buffer for fatal exceptions
      const crashBufferResult = await this.adb.executeCommand(
        "logcat -b crash -d -v time",
        10000
      );

      if (crashBufferResult.stdout) {
        const parsedCrashes = this.parseCrashBuffer(
          crashBufferResult.stdout,
          this.packageName
        );
        for (const parsed of parsedCrashes) {
          const hash = this.hashCrash(parsed);
          if (!this.processedCrashHashes.has(hash)) {
            this.processedCrashHashes.add(hash);
            const event = this.createCrashEvent(parsed);
            crashes.push(event);
            this.notifyCrashListeners(event);
          }
        }
      }

      // Check main buffer for FATAL EXCEPTION patterns
      const mainBufferResult = await this.adb.executeCommand(
        `logcat -b main -d -v time *:E | grep -A 50 "FATAL EXCEPTION"`,
        10000
      );

      if (mainBufferResult.stdout) {
        const parsedCrashes = this.parseFatalExceptions(
          mainBufferResult.stdout,
          this.packageName
        );
        for (const parsed of parsedCrashes) {
          const hash = this.hashCrash(parsed);
          if (!this.processedCrashHashes.has(hash)) {
            this.processedCrashHashes.add(hash);
            const event = this.createCrashEvent(parsed);
            crashes.push(event);
            this.notifyCrashListeners(event);
          }
        }
      }
    } catch (error) {
      logger.debug(`Error checking logcat for crashes: ${error}`);
    }

    return crashes;
  }

  async checkForAnrs(): Promise<AnrEvent[]> {
    if (!this.running || !this.device || !this.packageName) {
      return [];
    }

    const anrs: AnrEvent[] = [];

    try {
      // Check for ANR patterns in main buffer
      const anrResult = await this.adb.executeCommand(
        `logcat -b main -d -v time | grep -A 20 "ANR in"`,
        10000
      );

      if (anrResult.stdout) {
        const parsedAnrs = this.parseAnrLogs(anrResult.stdout, this.packageName);
        for (const parsed of parsedAnrs) {
          const hash = this.hashAnr(parsed);
          if (!this.processedAnrHashes.has(hash)) {
            this.processedAnrHashes.add(hash);
            const event = this.createAnrEvent(parsed);
            anrs.push(event);
            this.notifyAnrListeners(event);
          }
        }
      }

      // Also check for "Input dispatching timed out" messages
      const inputTimeoutResult = await this.adb.executeCommand(
        `logcat -b main -d -v time | grep -B 5 -A 20 "Input dispatching timed out"`,
        10000
      );

      if (inputTimeoutResult.stdout) {
        const parsedAnrs = this.parseInputTimeoutAnrs(
          inputTimeoutResult.stdout,
          this.packageName
        );
        for (const parsed of parsedAnrs) {
          const hash = this.hashAnr(parsed);
          if (!this.processedAnrHashes.has(hash)) {
            this.processedAnrHashes.add(hash);
            const event = this.createAnrEvent(parsed);
            anrs.push(event);
            this.notifyAnrListeners(event);
          }
        }
      }
    } catch (error) {
      logger.debug(`Error checking logcat for ANRs: ${error}`);
    }

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

  /**
   * Parse the crash buffer for crash entries
   */
  private parseCrashBuffer(output: string, targetPackage: string): ParsedCrash[] {
    const crashes: ParsedCrash[] = [];
    const lines = output.split("\n");

    let currentCrash: Partial<ParsedCrash> | null = null;
    let stacktraceLines: string[] = [];

    for (const line of lines) {
      // Look for process crash indicators
      const processMatch = line.match(
        /Process:\s+(\S+),\s+PID:\s+(\d+)/
      );
      if (processMatch) {
        // Save previous crash if it matches target
        if (currentCrash && this.matchesPackage(currentCrash.packageName, targetPackage)) {
          currentCrash.stacktrace = stacktraceLines.join("\n");
          crashes.push(currentCrash as ParsedCrash);
        }

        currentCrash = {
          crashType: "java",
          packageName: processMatch[1],
          processName: processMatch[1],
          pid: parseInt(processMatch[2], 10),
          timestamp: Date.now(),
        };
        stacktraceLines = [];
        continue;
      }

      // Look for exception class
      const exceptionMatch = line.match(
        /^(\w+(?:\.\w+)*(?:Exception|Error)):\s*(.*)$/
      );
      if (exceptionMatch && currentCrash) {
        currentCrash.exceptionClass = exceptionMatch[1];
        currentCrash.exceptionMessage = exceptionMatch[2];
        continue;
      }

      // Collect stacktrace lines
      if (currentCrash && line.trim().startsWith("at ")) {
        stacktraceLines.push(line.trim());
      }
    }

    // Don't forget the last crash
    if (currentCrash && this.matchesPackage(currentCrash.packageName, targetPackage)) {
      currentCrash.stacktrace = stacktraceLines.join("\n");
      crashes.push(currentCrash as ParsedCrash);
    }

    return crashes;
  }

  /**
   * Parse FATAL EXCEPTION patterns from main logcat buffer
   */
  private parseFatalExceptions(output: string, targetPackage: string): ParsedCrash[] {
    const crashes: ParsedCrash[] = [];
    const blocks = output.split(/(?=FATAL EXCEPTION:)/);

    for (const block of blocks) {
      if (!block.includes("FATAL EXCEPTION:")) {continue;}

      const crash: Partial<ParsedCrash> = {
        crashType: "java",
        timestamp: Date.now(),
      };

      // Extract process name and PID
      const processMatch = block.match(
        /FATAL EXCEPTION:\s+(\S+).*?Process:\s+(\S+),\s+PID:\s+(\d+)/s
      );
      if (processMatch) {
        crash.processName = processMatch[2];
        crash.packageName = processMatch[2];
        crash.pid = parseInt(processMatch[3], 10);
      }

      // Alternative pattern
      const altProcessMatch = block.match(/Process:\s+(\S+),\s+PID:\s+(\d+)/);
      if (!crash.packageName && altProcessMatch) {
        crash.packageName = altProcessMatch[1];
        crash.processName = altProcessMatch[1];
        crash.pid = parseInt(altProcessMatch[2], 10);
      }

      // Extract exception info
      const exceptionMatch = block.match(
        /(\w+(?:\.\w+)*(?:Exception|Error)):\s*([^\n]*)/
      );
      if (exceptionMatch) {
        crash.exceptionClass = exceptionMatch[1];
        crash.exceptionMessage = exceptionMatch[2].trim();
      }

      // Extract stacktrace
      const stacktraceMatch = block.match(/((?:\s+at\s+.+\n?)+)/);
      if (stacktraceMatch) {
        crash.stacktrace = stacktraceMatch[1].trim();
      }

      if (crash.packageName && this.matchesPackage(crash.packageName, targetPackage)) {
        crashes.push(crash as ParsedCrash);
      }
    }

    return crashes;
  }

  /**
   * Parse ANR in logs
   */
  private parseAnrLogs(output: string, targetPackage: string): ParsedAnr[] {
    const anrs: ParsedAnr[] = [];
    const blocks = output.split(/(?=ANR in)/);

    for (const block of blocks) {
      if (!block.includes("ANR in")) {continue;}

      const anr: Partial<ParsedAnr> = {
        timestamp: Date.now(),
      };

      // Extract package name from "ANR in <package>"
      const anrMatch = block.match(/ANR in\s+(\S+)/);
      if (anrMatch) {
        anr.packageName = anrMatch[1];
        anr.processName = anrMatch[1];
      }

      // Extract PID
      const pidMatch = block.match(/PID:\s+(\d+)/);
      if (pidMatch) {
        anr.pid = parseInt(pidMatch[1], 10);
      }

      // Extract reason
      const reasonMatch = block.match(/Reason:\s+(.+)/);
      if (reasonMatch) {
        anr.reason = reasonMatch[1].trim();
      }

      // Extract CPU usage info
      const cpuMatch = block.match(/CPU usage.*?(?=\n\n|\z)/s);
      if (cpuMatch) {
        anr.cpuUsage = cpuMatch[0].trim();
      }

      if (anr.packageName && this.matchesPackage(anr.packageName, targetPackage)) {
        anrs.push(anr as ParsedAnr);
      }
    }

    return anrs;
  }

  /**
   * Parse Input dispatching timed out ANRs
   */
  private parseInputTimeoutAnrs(output: string, targetPackage: string): ParsedAnr[] {
    const anrs: ParsedAnr[] = [];
    const lines = output.split("\n");

    let currentAnr: Partial<ParsedAnr> | null = null;

    for (const line of lines) {
      const timeoutMatch = line.match(
        /Input dispatching timed out.*?(\S+\/\S+)/
      );
      if (timeoutMatch) {
        if (currentAnr && this.matchesPackage(currentAnr.packageName, targetPackage)) {
          anrs.push(currentAnr as ParsedAnr);
        }

        const activity = timeoutMatch[1];
        const packageName = activity.split("/")[0];

        currentAnr = {
          packageName,
          processName: packageName,
          activity,
          reason: "Input dispatching timed out",
          timestamp: Date.now(),
        };
      }

      // Extract wait duration
      if (currentAnr) {
        const durationMatch = line.match(/waited\s+(\d+)ms/i);
        if (durationMatch) {
          currentAnr.waitDurationMs = parseInt(durationMatch[1], 10);
        }
      }
    }

    if (currentAnr && this.matchesPackage(currentAnr.packageName, targetPackage)) {
      anrs.push(currentAnr as ParsedAnr);
    }

    return anrs;
  }

  private matchesPackage(
    detectedPackage: string | undefined,
    targetPackage: string
  ): boolean {
    if (!detectedPackage) {return false;}
    // Exact match or prefix match (for multi-process apps like com.example:service)
    return (
      detectedPackage === targetPackage ||
      detectedPackage.startsWith(targetPackage + ":")
    );
  }

  private createCrashEvent(parsed: ParsedCrash): CrashEvent {
    return {
      deviceId: this.device!.deviceId,
      packageName: parsed.packageName,
      crashType: parsed.crashType,
      timestamp: parsed.timestamp ?? Date.now(),
      processName: parsed.processName,
      pid: parsed.pid,
      exceptionClass: parsed.exceptionClass,
      exceptionMessage: parsed.exceptionMessage,
      stacktrace: parsed.stacktrace,
      signal: parsed.signal,
      faultAddress: parsed.faultAddress,
      detectionSource: "logcat",
    };
  }

  private createAnrEvent(parsed: ParsedAnr): AnrEvent {
    return {
      deviceId: this.device!.deviceId,
      packageName: parsed.packageName!,
      timestamp: parsed.timestamp ?? Date.now(),
      processName: parsed.processName,
      pid: parsed.pid,
      reason: parsed.reason,
      activity: parsed.activity,
      waitDurationMs: parsed.waitDurationMs,
      cpuUsage: parsed.cpuUsage,
      mainThreadState: parsed.mainThreadState,
      stacktrace: parsed.stacktrace,
      detectionSource: "logcat",
    };
  }

  private hashCrash(crash: ParsedCrash): string {
    return `${crash.packageName}:${crash.exceptionClass}:${crash.exceptionMessage}:${crash.stacktrace?.slice(0, 200)}`;
  }

  private hashAnr(anr: ParsedAnr): string {
    return `${anr.packageName}:${anr.reason}:${anr.activity}`;
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
