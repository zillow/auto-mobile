import { promises as fsPromises } from "node:fs";
import os from "os";
import path from "path";
import { randomBytes } from "crypto";
import { AdbClientFactory, defaultAdbClientFactory } from "../../utils/android-cmdline-tools/AdbClientFactory";
import type { AdbExecutor } from "../../utils/android-cmdline-tools/interfaces/AdbExecutor";
import { logger } from "../../utils/logger";
import { Timer, defaultTimer } from "../../utils/SystemTimer";
import {
  BootedDevice,
  BugReportResult,
} from "../../models";
import { ViewHierarchy } from "../observe/ViewHierarchy";
import type { ViewHierarchy as ViewHierarchyContract } from "../observe/interfaces/ViewHierarchy";
import { TakeScreenshot } from "../observe/TakeScreenshot";
import { NoOpPerformanceTracker } from "../../utils/PerformanceTracker";
import type { ElementParser } from "../../utils/interfaces/ElementParser";
import { DefaultElementParser } from "../utility/ElementParser";

export interface BugReportOptions {
  /**
   * Optional app ID to filter logcat for specific app
   */
  appId?: string;

  /**
   * Number of recent logcat lines to include (default: 1000)
   */
  logcatLines?: number;

  /**
   * Directory to save report to (default: secure temp directory via fs.mkdtemp)
   */
  saveDir?: string;
}

/**
 * Feature to generate comprehensive bug reports for debugging AutoMobile interactions
 */
export class BugReport {
  private device: BootedDevice;
  private readonly adb: AdbExecutor;
  private viewHierarchy: ViewHierarchyContract;
  private takeScreenshot: TakeScreenshot;
  private elementParser: ElementParser;
  private timer: Timer;

  constructor(
    device: BootedDevice,
    adbFactory: AdbClientFactory = defaultAdbClientFactory,
    timer: Timer = defaultTimer,
    elementParser: ElementParser = new DefaultElementParser(),
    viewHierarchy?: ViewHierarchyContract
  ) {
    this.device = device;
    this.adb = adbFactory.create(device);
    this.viewHierarchy = viewHierarchy ?? new ViewHierarchy(device, adbFactory);
    this.takeScreenshot = new TakeScreenshot(device, adbFactory);
    this.elementParser = elementParser;
    this.timer = timer;
  }

  /**
   * Generate a bug report
   * @param options - Options for report generation
   * @returns Bug report result
   */
  async execute(options: BugReportOptions = {}): Promise<BugReportResult> {
    const startTime = this.timer.now();
    const reportId = `bug-${this.timer.now()}-${randomBytes(4).toString("hex")}`;
    const logcatLines = options.logcatLines ?? 1000;

    logger.info(`[BugReport] Generating report ${reportId}`);

    const result: BugReportResult = {
      reportId,
      timestamp: startTime,
      device: {
        deviceId: this.device.deviceId,
        platform: this.device.platform
      },
      screenState: {},
      viewHierarchy: {
        elementCount: 0,
        clickableElements: []
      },
      errors: []
    };

    await Promise.all([
      this.getDeviceInfo(result),
      this.getScreenState(result),
      this.getWindowState(result),
      this.getHierarchy(result),
      this.getLogcat(result, logcatLines, options.appId),
      this.getScreenshot(result)
    ]);

    const saveDir = options.saveDir || await this.createSecureTempDir();
    await this.saveReport(result, saveDir);

    const duration = this.timer.now() - startTime;
    logger.info(`[BugReport] Report ${reportId} generated in ${duration}ms`);

    return result;
  }

  /**
   * Get device information
   */
  private async getDeviceInfo(result: BugReportResult): Promise<void> {
    try {
      // Get device model
      const modelResult = await this.adb.executeCommand("shell getprop ro.product.model", undefined, undefined, true);
      result.device.model = modelResult.stdout.trim();

      // Get OS version
      const versionResult = await this.adb.executeCommand("shell getprop ro.build.version.release", undefined, undefined, true);
      result.device.osVersion = versionResult.stdout.trim();
    } catch (error) {
      result.errors?.push(`Failed to get device info: ${error}`);
    }
  }

  /**
   * Get current screen state
   */
  private async getScreenState(result: BugReportResult): Promise<void> {
    try {
      // Get current activity
      const activityResult = await this.adb.executeCommand(
        "shell dumpsys activity activities | grep -E 'mResumedActivity|mCurrentFocus'",
        5000,
        undefined,
        true
      );
      const activityOutput = activityResult.stdout;

      // Parse activity name
      const activityMatch = activityOutput.match(/mResumedActivity.*?([A-Za-z0-9_.]+\/[A-Za-z0-9_.]+)/);
      if (activityMatch) {
        const [packageName, activityName] = activityMatch[1].split("/");
        result.screenState.currentPackage = packageName;
        result.screenState.currentActivity = activityName;
      }

      // Get screen size
      const sizeResult = await this.adb.executeCommand("shell wm size", undefined, undefined, true);
      const sizeMatch = sizeResult.stdout.match(/(\d+)x(\d+)/);
      if (sizeMatch) {
        result.screenState.screenSize = {
          width: parseInt(sizeMatch[1], 10),
          height: parseInt(sizeMatch[2], 10)
        };
      }

      // Get rotation
      const rotationResult = await this.adb.executeCommand(
        "shell dumpsys input | grep SurfaceOrientation",
        undefined,
        undefined,
        true
      );
      const rotationMatch = rotationResult.stdout.match(/SurfaceOrientation:\s*(\d)/);
      if (rotationMatch) {
        result.screenState.rotation = parseInt(rotationMatch[1], 10) * 90;
      }

      // Check if screen is on
      const screenStateResult = await this.adb.executeCommand(
        "shell dumpsys power | grep -E 'mWakefulness|Display Power'",
        undefined,
        undefined,
        true
      );
      result.screenState.screenOn = screenStateResult.stdout.includes("Awake") ||
        screenStateResult.stdout.includes("state=ON");
    } catch (error) {
      result.errors?.push(`Failed to get screen state: ${error}`);
    }
  }

  /**
   * Get window state
   */
  private async getWindowState(result: BugReportResult): Promise<void> {
    try {
      const windowResult = await this.adb.executeCommand(
        "shell dumpsys window windows | grep -E 'mCurrentFocus|mFocusedApp|Window #'",
        5000,
        undefined,
        true
      );
      const lines = windowResult.stdout.split("\n").filter((l: string) => l.trim());

      result.windowState = {
        windows: []
      };

      for (const line of lines) {
        if (line.includes("mCurrentFocus")) {
          const match = line.match(/mCurrentFocus=.*?([A-Za-z0-9_.]+\/[A-Za-z0-9_.]+)/);
          if (match) {
            result.windowState.focusedWindow = match[1];
          }
        } else if (line.includes("mFocusedApp")) {
          const match = line.match(/mFocusedApp=.*?([A-Za-z0-9_.]+\/[A-Za-z0-9_.]+)/);
          if (match) {
            result.windowState.focusedApp = match[1];
          }
        } else if (line.includes("Window #")) {
          result.windowState.windows?.push(line.trim());
        }
      }
    } catch (error) {
      result.errors?.push(`Failed to get window state: ${error}`);
    }
  }

  /**
   * Get view hierarchy
   */
  private async getHierarchy(result: BugReportResult): Promise<void> {
    try {
      const perf = new NoOpPerformanceTracker();

      // Get raw XML
      try {
        const rawXml = await (this.viewHierarchy as any).executeUiAutomatorDump();
        result.viewHierarchy.rawXml = rawXml;
      } catch (error) {
        result.errors?.push(`Failed to get raw hierarchy XML: ${error}`);
      }

      // Get parsed hierarchy for element summary
      const hierarchy = await this.viewHierarchy.getViewHierarchy(undefined, perf);

      if (hierarchy) {
        const flattenedElements = this.elementParser.flattenViewHierarchy(hierarchy);

        // Count total traversed nodes (including those without valid bounds)
        let totalTraversedNodes = 0;
        const rootNodes = this.elementParser.extractRootNodes(hierarchy);
        for (const rootNode of rootNodes) {
          this.elementParser.traverseNode(rootNode, () => { totalTraversedNodes++; });
        }

        result.viewHierarchy.elementCount = flattenedElements.length;
        result.viewHierarchy.filteredNodeCount = totalTraversedNodes - flattenedElements.length;

        const clickableElements = flattenedElements
          .filter(({ element }) => element.clickable === true || element.clickable as unknown === "true")
          .map(({ element, text }) => ({
            resourceId: element["resource-id"],
            text: text ?? element.text,
            contentDesc: element["content-desc"],
            bounds: element.bounds,
            className: element["class"] ?? element.className
          }));

        result.viewHierarchy.clickableElements = clickableElements.slice(0, 50);
      }
    } catch (error) {
      result.errors?.push(`Failed to get view hierarchy: ${error}`);
    }
  }

  /**
   * Get logcat entries
   */
  private async getLogcat(
    result: BugReportResult,
    lines: number,
    appId?: string
  ): Promise<void> {
    try {
      result.logcat = {};

      // Get recent errors
      const errorResult = await this.adb.executeCommand(
        `shell logcat -d -t ${lines} *:E`,
        10000,
        undefined,
        true
      );
      result.logcat.errors = errorResult.stdout
        .split("\n")
        .filter((l: string) => l.trim())
        .slice(-lines);

      // Get recent warnings
      const warnResult = await this.adb.executeCommand(
        `shell logcat -d -t ${lines} *:W`,
        10000,
        undefined,
        true
      );
      result.logcat.warnings = warnResult.stdout
        .split("\n")
        .filter((l: string) => l.trim() && !l.includes(" E ")) // Exclude errors that were already captured
        .slice(-lines);

      // Get app-specific logs if appId provided
      if (appId) {
        // First get the PID of the app
        const pidResult = await this.adb.executeCommand(
          `shell pidof ${appId}`,
          undefined,
          undefined,
          true
        );
        const pid = pidResult.stdout.trim();

        if (pid) {
          const appLogResult = await this.adb.executeCommand(
            `shell logcat -d -t ${lines * 2} --pid=${pid}`,
            10000,
            undefined,
            true
          );
          result.logcat.appLogs = appLogResult.stdout
            .split("\n")
            .filter((l: string) => l.trim())
            .slice(-lines);
        }
      }
    } catch (error) {
      result.errors?.push(`Failed to get logcat: ${error}`);
    }
  }

  /**
   * Get screenshot
   */
  private async getScreenshot(result: BugReportResult): Promise<void> {
    try {
      const screenshot = await this.takeScreenshot.execute();
      if (screenshot && screenshot.success && screenshot.path) {
        // Read the screenshot file and convert to base64
        const imageBuffer = await fsPromises.readFile(screenshot.path);
        result.screenshot = imageBuffer.toString("base64");
      }
    } catch (error) {
      result.errors?.push(`Failed to get screenshot: ${error}`);
    }
  }

  /**
   * Save report to file
   */
  private async saveReport(result: BugReportResult, saveDir: string): Promise<void> {
    try {
      await fsPromises.mkdir(saveDir, { recursive: true });
      const filePath = path.join(saveDir, `${result.reportId}.json`);
      result.savedTo = filePath;
      result.savedToInstructions = `To file a bug report:\n1. Attach this JSON file to your GitHub issue at https://github.com/kaeawc/auto-mobile/issues\n2. Describe what you were trying to do and what went wrong\n3. Include any relevant steps to reproduce the issue`;
      await fsPromises.writeFile(filePath, JSON.stringify(result, null, 2), "utf8");
      logger.info(`[BugReport] Saved report to ${filePath}`);
    } catch (error) {
      result.errors?.push(`Failed to save report: ${error}`);
    }
  }

  /**
   * Create a secure temporary directory using fs.mkdtemp
   * This creates an unpredictable directory name under the OS temp directory
   */
  private async createSecureTempDir(): Promise<string> {
    const prefix = path.join(os.tmpdir(), "auto-mobile-bug-reports-");
    return await fsPromises.mkdtemp(prefix);
  }
}
