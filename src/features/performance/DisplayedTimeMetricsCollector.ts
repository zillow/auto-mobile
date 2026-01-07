import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { logger } from "../../utils/logger";
import { BootedDevice, DisplayedLogcatTag, DisplayedTimeMetric } from "../../models";
import { NoOpPerformanceTracker, PerformanceTracker } from "../../utils/PerformanceTracker";

export interface DisplayedTimeCaptureOptions {
  packageName: string;
  startTimestampMs: number;
  endTimestampMs: number;
}

export class DisplayedTimeMetricsCollector {
  private adb: AdbClient;
  private device: BootedDevice;
  private logcatTagCache: DisplayedLogcatTag | undefined;

  constructor(device: BootedDevice, adb: AdbClient | null = null) {
    this.device = device;
    this.adb = adb || new AdbClient(device);
  }

  async captureDisplayedMetrics(
    options: DisplayedTimeCaptureOptions,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<DisplayedTimeMetric[]> {
    if (this.device.platform !== "android") {
      return [];
    }

    const logcatTag = await this.getPreferredLogcatTag();
    try {
      const { stdout } = await perf.track("adbLogcatDisplayed", () =>
        this.adb.executeCommand(
          this.buildLogcatCommand(logcatTag),
          5000,
          1024 * 1024
        )
      );
      return this.parseDisplayedMetrics(stdout, options);
    } catch (error) {
      logger.warn(`[DisplayedTimeMetrics] Failed to read logcat: ${error}`);
      return [];
    }
  }

  private async getPreferredLogcatTag(): Promise<DisplayedLogcatTag> {
    if (this.logcatTagCache) {
      return this.logcatTagCache;
    }

    const apiLevel = await this.adb.getAndroidApiLevel();
    this.logcatTagCache = apiLevel !== null && apiLevel >= 29
      ? "ActivityTaskManager"
      : "ActivityManager";
    return this.logcatTagCache;
  }

  private buildLogcatCommand(tag: DisplayedLogcatTag): string {
    return `shell logcat -d -v epoch -s ${tag}:I`;
  }

  private parseDisplayedMetrics(
    output: string,
    options: DisplayedTimeCaptureOptions
  ): DisplayedTimeMetric[] {
    const metrics: DisplayedTimeMetric[] = [];
    const lines = output.split("\n");

    for (const line of lines) {
      const parsedLine = this.parseLogcatLine(line);
      if (!parsedLine) {
        continue;
      }

      const { timestampMs, logcatTag, message } = parsedLine;

      if (timestampMs < options.startTimestampMs || timestampMs > options.endTimestampMs) {
        continue;
      }

      const component = this.extractComponentName(message);
      if (!component) {
        continue;
      }

      const componentInfo = this.parseComponent(component);
      if (componentInfo.packageName !== options.packageName) {
        continue;
      }

      const displayedTimeMs = this.extractDisplayedDurationMs(message);
      if (displayedTimeMs === null) {
        continue;
      }

      metrics.push({
        packageName: componentInfo.packageName,
        activityName: componentInfo.activityName,
        componentName: componentInfo.componentName,
        displayedTimeMs,
        timestampMs,
        logcatTag
      });
    }

    return metrics;
  }

  private parseLogcatLine(
    line: string
  ): { timestampMs: number; logcatTag: DisplayedLogcatTag; message: string } | null {
    const match = line.match(/^(\d+\.\d+)\s+\d+\s+\d+\s+[VDIWEF]\s+(\w+):\s+(.*)$/);
    if (!match) {
      return null;
    }

    const timestampSeconds = Number.parseFloat(match[1]);
    if (Number.isNaN(timestampSeconds)) {
      return null;
    }

    const logcatTag = match[2] as DisplayedLogcatTag;
    if (logcatTag !== "ActivityManager" && logcatTag !== "ActivityTaskManager") {
      return null;
    }

    return {
      timestampMs: Math.round(timestampSeconds * 1000),
      logcatTag,
      message: match[3]
    };
  }

  private extractComponentName(message: string): string | null {
    const match = message.match(/Displayed\s+([^:]+):/);
    return match ? match[1].trim() : null;
  }

  private parseComponent(component: string): { packageName: string; activityName: string; componentName: string } {
    const [packageName, activityPart] = component.split("/");
    let activityName = activityPart ?? "";

    if (activityName.startsWith(".")) {
      activityName = `${packageName}${activityName}`;
    }

    return {
      packageName,
      activityName,
      componentName: component
    };
  }

  private extractDisplayedDurationMs(message: string): number | null {
    const durationMatch = message.match(/\+\s*\d+(?:s\d+ms|ms|s)/);
    if (!durationMatch) {
      return null;
    }

    return this.parseDurationMs(durationMatch[0]);
  }

  private parseDurationMs(value: string): number | null {
    const trimmed = value.replace("+", "").trim();
    const secondsWithMsMatch = trimmed.match(/^(\d+)s(\d+)ms$/);
    if (secondsWithMsMatch) {
      return (Number.parseInt(secondsWithMsMatch[1], 10) * 1000)
        + Number.parseInt(secondsWithMsMatch[2], 10);
    }

    const msMatch = trimmed.match(/^(\d+)ms$/);
    if (msMatch) {
      return Number.parseInt(msMatch[1], 10);
    }

    const secondsMatch = trimmed.match(/^(\d+)s$/);
    if (secondsMatch) {
      return Number.parseInt(secondsMatch[1], 10) * 1000;
    }

    return null;
  }
}
