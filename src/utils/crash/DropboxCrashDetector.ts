import type { BootedDevice } from "../../models";
import type { AdbExecutor } from "../android-cmdline-tools/interfaces/AdbExecutor";
import type {
  CrashDetector,
  CrashEvent,
  AnrEvent,
  CrashEventListener,
  AnrEventListener,
} from "../interfaces/CrashMonitor";
import { AdbClient } from "../android-cmdline-tools/AdbClient";
import { logger } from "../logger";

/**
 * Detects crashes and ANRs by querying Android's dumpsys dropbox.
 * The dropbox service stores system-level crash and ANR reports.
 */
export class DropboxCrashDetector implements CrashDetector {
  readonly name = "dropbox";

  private adb: AdbExecutor;
  private device: BootedDevice | null = null;
  private packageName: string | null = null;
  private running = false;
  private lastCheckTime = 0;
  private processedEntries = new Set<string>();
  private crashListeners: CrashEventListener[] = [];
  private anrListeners: AnrEventListener[] = [];

  constructor(adb?: AdbExecutor) {
    this.adb = adb ?? new AdbClient();
  }

  async start(device: BootedDevice, packageName: string): Promise<void> {
    this.device = device;
    this.packageName = packageName;
    this.running = true;
    this.lastCheckTime = Date.now();
    this.processedEntries.clear();

    if (this.adb instanceof AdbClient) {
      this.adb.setDevice(device);
    }

    logger.info(
      `DropboxCrashDetector started for package ${packageName} on device ${device.deviceId}`
    );
  }

  async stop(): Promise<void> {
    this.running = false;
    this.device = null;
    this.packageName = null;
    this.processedEntries.clear();
    logger.info("DropboxCrashDetector stopped");
  }

  async checkForCrashes(): Promise<CrashEvent[]> {
    if (!this.running || !this.device || !this.packageName) {
      return [];
    }

    const crashes: CrashEvent[] = [];

    try {
      // Query dropbox for crash entries
      const crashEntries = await this.getDropboxEntries([
        "data_app_crash",
        "system_app_crash",
        "data_app_native_crash",
        "system_app_native_crash",
      ]);

      for (const entry of crashEntries) {
        if (this.processedEntries.has(entry.id)) {
          continue;
        }

        // Only process entries created after we started monitoring
        if (entry.timestamp < this.lastCheckTime) {
          this.processedEntries.add(entry.id);
          continue;
        }

        // Get the full entry content
        const content = await this.getDropboxEntryContent(entry.id);
        if (!content) {
          this.processedEntries.add(entry.id);
          continue;
        }

        const parsed = this.parseCrashEntry(content, entry.tag);

        if (parsed && this.matchesPackage(parsed.packageName, this.packageName)) {
          this.processedEntries.add(entry.id);

          const event: CrashEvent = {
            deviceId: this.device.deviceId,
            packageName: parsed.packageName,
            crashType: entry.tag.includes("native") ? "native" : "java",
            timestamp: entry.timestamp,
            processName: parsed.processName,
            pid: parsed.pid,
            exceptionClass: parsed.exceptionClass,
            exceptionMessage: parsed.exceptionMessage,
            stacktrace: parsed.stacktrace,
            detectionSource: "dropbox",
            rawLog: content.slice(0, 5000),
          };

          crashes.push(event);
          this.notifyCrashListeners(event);
        } else {
          this.processedEntries.add(entry.id);
        }
      }
    } catch (error) {
      logger.debug(`Error checking dropbox for crashes: ${error}`);
    }

    return crashes;
  }

  async checkForAnrs(): Promise<AnrEvent[]> {
    if (!this.running || !this.device || !this.packageName) {
      return [];
    }

    const anrs: AnrEvent[] = [];

    try {
      // Query dropbox for ANR entries
      const anrEntries = await this.getDropboxEntries([
        "data_app_anr",
        "system_app_anr",
      ]);

      for (const entry of anrEntries) {
        if (this.processedEntries.has(entry.id)) {
          continue;
        }

        if (entry.timestamp < this.lastCheckTime) {
          this.processedEntries.add(entry.id);
          continue;
        }

        const content = await this.getDropboxEntryContent(entry.id);
        if (!content) {
          this.processedEntries.add(entry.id);
          continue;
        }

        const parsed = this.parseAnrEntry(content);

        if (parsed && this.matchesPackage(parsed.packageName, this.packageName)) {
          this.processedEntries.add(entry.id);

          const event: AnrEvent = {
            deviceId: this.device.deviceId,
            packageName: parsed.packageName,
            timestamp: entry.timestamp,
            processName: parsed.processName,
            pid: parsed.pid,
            reason: parsed.reason,
            activity: parsed.activity,
            cpuUsage: parsed.cpuUsage,
            mainThreadState: parsed.mainThreadState,
            stacktrace: parsed.stacktrace,
            detectionSource: "dropbox",
            rawLog: content.slice(0, 5000),
          };

          anrs.push(event);
          this.notifyAnrListeners(event);
        } else {
          this.processedEntries.add(entry.id);
        }
      }
    } catch (error) {
      logger.debug(`Error checking dropbox for ANRs: ${error}`);
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
   * Get dropbox entries for the specified tags
   */
  private async getDropboxEntries(
    tags: string[]
  ): Promise<{ id: string; tag: string; timestamp: number }[]> {
    const entries: { id: string; tag: string; timestamp: number }[] = [];

    try {
      // Get recent dropbox entries
      const result = await this.adb.executeCommand(
        "shell dumpsys dropbox --print",
        15000
      );

      if (!result.stdout) {
        return entries;
      }

      const lines = result.stdout.split("\n");

      for (const line of lines) {
        // Parse dropbox entry lines
        // Format: "2024-01-15 10:30:45 data_app_crash (text, 1234 bytes)"
        const match = line.match(
          /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+\(/
        );

        if (match) {
          const timestamp = Date.parse(match[1]);
          const tag = match[2];

          if (tags.includes(tag) && !isNaN(timestamp)) {
            entries.push({
              id: `${timestamp}-${tag}`,
              tag,
              timestamp,
            });
          }
        }
      }
    } catch (error) {
      logger.debug(`Error getting dropbox entries: ${error}`);
    }

    return entries;
  }

  /**
   * Get the content of a dropbox entry
   */
  private async getDropboxEntryContent(entryId: string): Promise<string | null> {
    try {
      const [timestampStr, tag] = entryId.split("-");
      const timestamp = parseInt(timestampStr, 10);

      // Convert to Android dropbox time format
      const date = new Date(timestamp);
      const timeArg = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;

      const result = await this.adb.executeCommand(
        `shell dumpsys dropbox --print "${tag}" "${timeArg}"`,
        15000
      );

      return result.stdout || null;
    } catch {
      return null;
    }
  }

  /**
   * Parse a crash entry from dropbox
   */
  private parseCrashEntry(
    content: string,
    tag: string
  ): {
    packageName: string;
    processName?: string;
    pid?: number;
    exceptionClass?: string;
    exceptionMessage?: string;
    stacktrace?: string;
  } | null {
    // Extract process info
    const processMatch = content.match(/Process:\s+(\S+)/);
    const pidMatch = content.match(/PID:\s+(\d+)/);

    if (!processMatch) {
      return null;
    }

    const result: {
      packageName: string;
      processName?: string;
      pid?: number;
      exceptionClass?: string;
      exceptionMessage?: string;
      stacktrace?: string;
    } = {
      packageName: processMatch[1],
      processName: processMatch[1],
    };

    if (pidMatch) {
      result.pid = parseInt(pidMatch[1], 10);
    }

    // For Java crashes, extract exception info
    if (!tag.includes("native")) {
      const exceptionMatch = content.match(
        /(\w+(?:\.\w+)*(?:Exception|Error)):\s*([^\n]*)/
      );
      if (exceptionMatch) {
        result.exceptionClass = exceptionMatch[1];
        result.exceptionMessage = exceptionMatch[2].trim();
      }

      // Extract stacktrace
      const stackMatch = content.match(/((?:\s+at\s+.+\n?)+)/);
      if (stackMatch) {
        result.stacktrace = stackMatch[1].trim();
      }
    } else {
      // For native crashes, extract signal and backtrace
      const signalMatch = content.match(/signal\s+\d+\s+\((\w+)\)/);
      if (signalMatch) {
        result.exceptionClass = signalMatch[1];
      }

      const backtraceMatch = content.match(/backtrace:([\s\S]*?)(?:\n\n|$)/);
      if (backtraceMatch) {
        result.stacktrace = backtraceMatch[1].trim();
      }
    }

    return result;
  }

  /**
   * Parse an ANR entry from dropbox
   */
  private parseAnrEntry(content: string): {
    packageName: string;
    processName?: string;
    pid?: number;
    reason?: string;
    activity?: string;
    cpuUsage?: string;
    mainThreadState?: string;
    stacktrace?: string;
  } | null {
    // Extract process info
    const processMatch = content.match(/Process:\s+(\S+)/);
    const pidMatch = content.match(/PID:\s+(\d+)/);

    if (!processMatch) {
      // Try alternative pattern
      const altMatch = content.match(/ANR in\s+(\S+)/);
      if (!altMatch) {
        return null;
      }

      return {
        packageName: altMatch[1],
        processName: altMatch[1],
      };
    }

    const result: {
      packageName: string;
      processName?: string;
      pid?: number;
      reason?: string;
      activity?: string;
      cpuUsage?: string;
      mainThreadState?: string;
      stacktrace?: string;
    } = {
      packageName: processMatch[1],
      processName: processMatch[1],
    };

    if (pidMatch) {
      result.pid = parseInt(pidMatch[1], 10);
    }

    // Extract reason
    const reasonMatch = content.match(/Reason:\s+(.+)/);
    if (reasonMatch) {
      result.reason = reasonMatch[1].trim();
    }

    // Extract activity
    const activityMatch = content.match(/Activity:\s+(\S+)/);
    if (activityMatch) {
      result.activity = activityMatch[1];
    }

    // Extract CPU usage
    const cpuMatch = content.match(/CPU usage[^\n]*(?:\n[^\n]*){0,10}/);
    if (cpuMatch) {
      result.cpuUsage = cpuMatch[0].trim();
    }

    // Extract main thread state and stacktrace
    const mainThreadMatch = content.match(
      /"main"[^\n]*\n([\s\S]*?)(?:\n\n|".*?" prio)/
    );
    if (mainThreadMatch) {
      const threadInfo = mainThreadMatch[0];
      const stateMatch = threadInfo.match(/state=(\w+)/);
      if (stateMatch) {
        result.mainThreadState = stateMatch[1];
      }
      result.stacktrace = mainThreadMatch[1].trim();
    }

    return result;
  }

  private matchesPackage(
    detectedPackage: string | undefined,
    targetPackage: string
  ): boolean {
    if (!detectedPackage) {return false;}
    return (
      detectedPackage === targetPackage ||
      detectedPackage.startsWith(targetPackage + ":")
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
