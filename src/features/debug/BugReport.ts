import fs from "fs-extra";
import os from "os";
import path from "path";
import { randomBytes } from "crypto";
import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { logger } from "../../utils/logger";
import {
  BootedDevice,
  BugReportHighlightEntry,
  BugReportResult,
  Element,
  ElementBounds,
  HighlightBounds,
  HighlightEntry,
  HighlightShape,
  ViewHierarchyResult
} from "../../models";
import { ViewHierarchy } from "../observe/ViewHierarchy";
import { TakeScreenshot } from "../observe/TakeScreenshot";
import { NoOpPerformanceTracker } from "../../utils/PerformanceTracker";
import { VisualHighlight } from "./VisualHighlight";
import { ElementUtils } from "../utility/ElementUtils";

const HIGHLIGHT_RENDER_DELAY_MS = 250;
const HIGHLIGHT_NEARBY_ELEMENT_LIMIT = 5;

export interface BugReportHighlightRequest {
  id: string;
  description: string;
  shape: HighlightShape;
}

export interface BugReportOptions {
  /**
   * Optional app ID to filter logcat for specific app
   */
  appId?: string;

  /**
   * Whether to include screenshot (default: true)
   */
  includeScreenshot?: boolean;

  /**
   * Whether to include raw view hierarchy XML (default: true)
   */
  includeRawHierarchy?: boolean;

  /**
   * Whether to include logcat (default: true)
   */
  includeLogcat?: boolean;

  /**
   * Number of recent logcat lines to include (default: 100)
   */
  logcatLines?: number;

  /**
   * Whether to save the full report to a file (default: false)
   */
  saveToFile?: boolean;

  /**
   * Directory to save report to (default: secure temp directory via fs.mkdtemp)
   */
  saveDir?: string;

  /**
   * Optional highlights to add during report generation
   */
  highlights?: BugReportHighlightRequest[];

  /**
   * Whether to remove highlights added for this report (default: true)
   */
  autoRemoveHighlights?: boolean;

  /**
   * Whether screenshot should include highlight overlays (default: true)
   */
  includeHighlightsInScreenshot?: boolean;
}

/**
 * Feature to generate comprehensive bug reports for debugging AutoMobile interactions
 */
export class BugReport {
  private device: BootedDevice;
  private readonly adb: AdbClient;
  private viewHierarchy: ViewHierarchy;
  private takeScreenshot: TakeScreenshot;
  private visualHighlight: VisualHighlight;
  private elementUtils: ElementUtils;

  constructor(
    device: BootedDevice,
    adb: AdbClient | null = null
  ) {
    this.device = device;
    this.adb = adb || new AdbClient(device);
    this.viewHierarchy = new ViewHierarchy(device, this.adb);
    this.takeScreenshot = new TakeScreenshot(device, this.adb);
    this.visualHighlight = new VisualHighlight(device, this.adb);
    this.elementUtils = new ElementUtils();
  }

  /**
   * Generate a bug report
   * @param options - Options for report generation
   * @returns Bug report result
   */
  async execute(options: BugReportOptions = {}): Promise<BugReportResult> {
    const startTime = Date.now();
    const reportId = `bug-${Date.now()}-${randomBytes(4).toString("hex")}`;

    const includeScreenshot = options.includeScreenshot !== false;
    const includeRawHierarchy = options.includeRawHierarchy !== false;
    const includeLogcat = options.includeLogcat !== false;
    const includeHighlightsInScreenshot = options.includeHighlightsInScreenshot !== false;
    const autoRemoveHighlights = options.autoRemoveHighlights !== false;
    const highlightRequests = options.highlights ?? [];
    const highlightDescriptions = new Map(
      highlightRequests.map(highlight => [highlight.id, highlight.description])
    );
    const logcatLines = options.logcatLines || 100;

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

    // Run parallel operations
    const operations: Promise<void>[] = [];
    let viewHierarchyResult: ViewHierarchyResult | null = null;
    let highlightEntries: HighlightEntry[] = [];

    // Get device info
    operations.push(this.getDeviceInfo(result));

    // Get screen state
    operations.push(this.getScreenState(result));

    // Get window state
    operations.push(this.getWindowState(result));

    // Get view hierarchy
    operations.push(
      this.getHierarchy(result, includeRawHierarchy)
        .then(hierarchy => {
          viewHierarchyResult = hierarchy;
        })
    );

    // Get logcat if requested
    if (includeLogcat) {
      operations.push(this.getLogcat(result, logcatLines, options.appId));
    }

    // Handle highlights and screenshot sequencing
    operations.push(
      this.handleHighlightsAndScreenshot(
        result,
        highlightRequests,
        includeScreenshot,
        includeHighlightsInScreenshot,
        autoRemoveHighlights
      ).then(entries => {
        highlightEntries = entries;
      })
    );

    // Wait for all operations
    await Promise.all(operations);

    if (highlightEntries.length > 0 || highlightRequests.length > 0) {
      result.highlights = this.buildHighlightEntries(
        highlightEntries,
        highlightDescriptions,
        viewHierarchyResult,
        result.screenState.screenSize
      );
    }

    // Save to file if requested
    if (options.saveToFile) {
      const saveDir = options.saveDir || await this.createSecureTempDir();
      await this.saveReport(result, saveDir);
    }

    const duration = Date.now() - startTime;
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
  private async getHierarchy(
    result: BugReportResult,
    includeRaw: boolean
  ): Promise<ViewHierarchyResult | null> {
    try {
      const perf = new NoOpPerformanceTracker();

      // Get raw XML if requested
      if (includeRaw) {
        try {
          const rawXml = await this.viewHierarchy.executeUiAutomatorDump();
          result.viewHierarchy.rawXml = rawXml;
        } catch (error) {
          result.errors?.push(`Failed to get raw hierarchy XML: ${error}`);
        }
      }

      // Get parsed hierarchy for element summary
      const hierarchy = await this.viewHierarchy.getViewHierarchy(undefined, perf);

      if (hierarchy && hierarchy.hierarchy && hierarchy.hierarchy.node) {
        // Traverse hierarchy to count elements and extract clickable ones
        const clickableElements: BugReportResult["viewHierarchy"]["clickableElements"] = [];
        let elementCount = 0;

        const traverseNode = (node: any) => {
          elementCount++;
          const attrs = node.$ || node;

          if (attrs.clickable === "true" || attrs.clickable === true) {
            const boundsStr = attrs.bounds || "";
            clickableElements.push({
              resourceId: attrs["resource-id"],
              text: attrs.text,
              contentDesc: attrs["content-desc"],
              bounds: boundsStr,
              className: attrs.class || attrs.className
            });
          }

          // Traverse children
          const children = node.node || node.children;
          if (Array.isArray(children)) {
            for (const child of children) {
              traverseNode(child);
            }
          } else if (children) {
            traverseNode(children);
          }
        };

        traverseNode(hierarchy.hierarchy.node);

        result.viewHierarchy.elementCount = elementCount;
        result.viewHierarchy.clickableElements = clickableElements.slice(0, 50);
      }

      return hierarchy;
    } catch (error) {
      result.errors?.push(`Failed to get view hierarchy: ${error}`);
      return null;
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
        const imageBuffer = await fs.readFile(screenshot.path);
        result.screenshot = imageBuffer.toString("base64");
      }
    } catch (error) {
      result.errors?.push(`Failed to get screenshot: ${error}`);
    }
  }

  private async handleHighlightsAndScreenshot(
    result: BugReportResult,
    highlightRequests: BugReportHighlightRequest[],
    includeScreenshot: boolean,
    includeHighlightsInScreenshot: boolean,
    autoRemoveHighlights: boolean
  ): Promise<HighlightEntry[]> {
    const hasHighlightRequests = highlightRequests.length > 0;
    const canHighlight = this.device.platform === "android";
    const addedHighlightIds: string[] = [];
    let listFailed = false;

    const addHighlights = async () => {
      if (!hasHighlightRequests) {
        return;
      }
      if (!canHighlight) {
        result.errors?.push("Visual highlights are only supported on Android devices.");
        return;
      }

      for (const highlight of highlightRequests) {
        try {
          await this.visualHighlight.addHighlight(highlight.id, highlight.shape);
          addedHighlightIds.push(highlight.id);
        } catch (error) {
          result.errors?.push(`Failed to add highlight ${highlight.id}: ${error}`);
        }
      }

      if (addedHighlightIds.length > 0) {
        await this.waitForHighlightRender();
      }
    };

    const listHighlights = async (): Promise<HighlightEntry[]> => {
      if (!canHighlight) {
        return [];
      }
      try {
        const response = await this.visualHighlight.listHighlights();
        return response.highlights ?? [];
      } catch (error) {
        listFailed = true;
        if (hasHighlightRequests || includeScreenshot) {
          result.errors?.push(`Failed to list highlights: ${error}`);
        }
        return [];
      }
    };

    const removeHighlights = async () => {
      if (!autoRemoveHighlights || addedHighlightIds.length === 0 || !canHighlight) {
        return;
      }
      for (const highlightId of addedHighlightIds) {
        try {
          await this.visualHighlight.removeHighlight(highlightId);
        } catch (error) {
          result.errors?.push(`Failed to remove highlight ${highlightId}: ${error}`);
        }
      }
    };

    if (includeScreenshot && !includeHighlightsInScreenshot) {
      await this.getScreenshot(result);
      await addHighlights();
    } else {
      await addHighlights();
      if (includeScreenshot) {
        await this.getScreenshot(result);
      }
    }

    const shouldListHighlights = canHighlight && hasHighlightRequests;
    let activeHighlights = shouldListHighlights ? await listHighlights() : [];

    if (listFailed && addedHighlightIds.length > 0) {
      const addedHighlightSet = new Set(addedHighlightIds);
      activeHighlights = highlightRequests
        .filter(highlight => addedHighlightSet.has(highlight.id))
        .map(highlight => ({
          id: highlight.id,
          shape: highlight.shape
        }));
    }

    await removeHighlights();

    return activeHighlights;
  }

  private async waitForHighlightRender(): Promise<void> {
    if (HIGHLIGHT_RENDER_DELAY_MS <= 0) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, HIGHLIGHT_RENDER_DELAY_MS));
  }

  private buildHighlightEntries(
    highlightEntries: HighlightEntry[],
    highlightDescriptions: Map<string, string>,
    viewHierarchy: ViewHierarchyResult | null,
    screenSize?: { width: number; height: number }
  ): BugReportHighlightEntry[] {
    const flattenedElements = viewHierarchy
      ? this.elementUtils.flattenViewHierarchy(viewHierarchy)
      : [];

    return highlightEntries.map(entry => {
      const highlightBounds = this.getHighlightBounds(entry.shape, screenSize);
      const nearbyElements = highlightBounds
        ? this.findNearbyElements(highlightBounds, flattenedElements)
        : [];

      return {
        id: entry.id,
        description: highlightDescriptions.get(entry.id),
        shape: entry.shape,
        nearbyElements
      };
    });
  }

  private findNearbyElements(
    highlightBounds: ElementBounds,
    flattenedElements: Array<{ element: Element; text?: string }>
  ): BugReportHighlightEntry["nearbyElements"] {
    if (flattenedElements.length === 0) {
      return [];
    }

    const candidates = flattenedElements
      .map(entry => {
        const bounds = entry.element.bounds;
        if (!bounds) {
          return null;
        }
        const distance = this.getBoundsDistance(highlightBounds, bounds);
        return { ...entry, bounds, distance };
      })
      .filter((entry): entry is { element: Element; text?: string; bounds: ElementBounds; distance: number } => (
        entry !== null
      ));

    candidates.sort((a, b) => {
      if (a.distance !== b.distance) {
        return a.distance - b.distance;
      }
      const aClickable = a.element.clickable ? 0 : 1;
      const bClickable = b.element.clickable ? 0 : 1;
      if (aClickable !== bClickable) {
        return aClickable - bClickable;
      }
      return this.getBoundsArea(a.bounds) - this.getBoundsArea(b.bounds);
    });

    return candidates.slice(0, HIGHLIGHT_NEARBY_ELEMENT_LIMIT).map(entry => ({
      resourceId: entry.element["resource-id"],
      text: entry.text ?? entry.element.text,
      contentDesc: entry.element["content-desc"],
      className: entry.element["class"],
      bounds: entry.bounds,
      distance: Math.round(entry.distance),
      clickable: entry.element.clickable,
      enabled: entry.element.enabled
    }));
  }

  private getHighlightBounds(
    shape: HighlightShape,
    screenSize?: { width: number; height: number }
  ): ElementBounds | null {
    if (shape.type === "path") {
      const bounds = shape.bounds ?? this.getBoundsFromPoints(shape.points);
      return bounds ? this.scaleHighlightBounds(bounds, screenSize) : null;
    }
    return this.scaleHighlightBounds(shape.bounds, screenSize);
  }

  private getBoundsFromPoints(points: Array<{ x: number; y: number }>): HighlightBounds | null {
    if (!points || points.length === 0) {
      return null;
    }

    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
      x: minX,
      y: minY,
      width: Math.max(0, maxX - minX),
      height: Math.max(0, maxY - minY)
    };
  }

  private scaleHighlightBounds(
    bounds: HighlightBounds,
    screenSize?: { width: number; height: number }
  ): ElementBounds {
    const sourceWidth = bounds.sourceWidth ?? undefined;
    const sourceHeight = bounds.sourceHeight ?? undefined;
    const scaleX = screenSize && sourceWidth ? screenSize.width / sourceWidth : 1;
    const scaleY = screenSize && sourceHeight ? screenSize.height / sourceHeight : 1;
    const left = Math.round(bounds.x * scaleX);
    const top = Math.round(bounds.y * scaleY);
    const right = Math.round((bounds.x + bounds.width) * scaleX);
    const bottom = Math.round((bounds.y + bounds.height) * scaleY);

    return { left, top, right, bottom };
  }

  private getBoundsDistance(a: ElementBounds, b: ElementBounds): number {
    const dx = Math.max(0, a.left - b.right, b.left - a.right);
    const dy = Math.max(0, a.top - b.bottom, b.top - a.bottom);
    return Math.hypot(dx, dy);
  }

  private getBoundsArea(bounds: ElementBounds): number {
    return Math.max(0, bounds.right - bounds.left) *
      Math.max(0, bounds.bottom - bounds.top);
  }

  /**
   * Save report to file
   */
  private async saveReport(result: BugReportResult, saveDir: string): Promise<void> {
    try {
      await fs.ensureDir(saveDir);
      const filePath = path.join(saveDir, `${result.reportId}.json`);
      result.savedTo = filePath;
      result.savedToInstructions = `To file a bug report:\n1. Attach this JSON file to your GitHub issue at https://github.com/kaeawc/auto-mobile/issues\n2. Describe what you were trying to do and what went wrong\n3. Include any relevant steps to reproduce the issue`;
      await fs.writeJson(filePath, result, { spaces: 2 });
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
    return await fs.mkdtemp(prefix);
  }
}
