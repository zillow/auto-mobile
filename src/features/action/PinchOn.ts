import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import {
  ActionableError,
  BootedDevice,
  Element,
  ObserveResult,
  PinchOnOptions,
  PinchOnResult,
  ViewHierarchyResult
} from "../../models";
import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import type { ElementFinder } from "../../utils/interfaces/ElementFinder";
import type { ElementParser } from "../../utils/interfaces/ElementParser";
import { DefaultElementFinder } from "../utility/ElementFinder";
import { DefaultElementParser } from "../utility/ElementParser";
import { CtrlProxyClient } from "../observe/android";
import { AndroidCtrlProxyManager } from "../../utils/CtrlProxyManager";
import { createGlobalPerformanceTracker } from "../../utils/PerformanceTracker";
import { boundsArea, clamp } from "../../utils/bounds";
import { buildContainerFromElement } from "../../utils/elementProperties";
import { getScreenBounds as getScreenBoundsFromSize } from "../../utils/screenBounds";
import { DEFAULT_VISION_CONFIG, getVisionEnrichedError, type VisionFallbackConfig, type VisionAnalyzer } from "../../vision/index";
import { TakeScreenshotCapturer, type ScreenshotCapturer } from "../navigation/SelectionStateTracker";

type PinchTarget = {
  bounds: Element["bounds"];
  targetType: "screen" | "container";
  container?: PinchOnOptions["container"];
  warning?: string;
};

interface PinchOnDependencies {
  finder?: ElementFinder;
  parser?: ElementParser;
  visionConfig?: VisionFallbackConfig;
  screenshotCapturer?: ScreenshotCapturer;
  visionAnalyzer?: VisionAnalyzer;
}

export class PinchOn extends BaseVisualChange {
  private finder: ElementFinder;
  private parser: ElementParser;
  private visionConfig: VisionFallbackConfig;
  private screenshotCapturer: ScreenshotCapturer;
  private visionAnalyzer: VisionAnalyzer | undefined;

  constructor(
    device: BootedDevice,
    adb: AdbClient | null = null,
    deps: PinchOnDependencies = {}
  ) {
    super(device, adb);
    this.finder = deps.finder ?? new DefaultElementFinder();
    this.parser = deps.parser ?? new DefaultElementParser();
    this.visionConfig = deps.visionConfig ?? DEFAULT_VISION_CONFIG;
    this.screenshotCapturer = deps.screenshotCapturer ?? new TakeScreenshotCapturer(device, this.adbFactory);
    this.visionAnalyzer = deps.visionAnalyzer;
  }

  private createErrorResult(error: string, options: Partial<PinchOnOptions>): PinchOnResult {
    return {
      success: false,
      direction: options.direction ?? "in",
      distanceStart: options.distanceStart ?? 0,
      distanceEnd: options.distanceEnd ?? 0,
      duration: options.duration ?? 0,
      scale: options.scale,
      rotationDegrees: options.rotationDegrees,
      centerX: 0,
      centerY: 0,
      targetType: "screen",
      container: options.container,
      error
    };
  }

  async execute(options: PinchOnOptions, progress?: ProgressCallback): Promise<PinchOnResult> {
    const perf = createGlobalPerformanceTracker();
    perf.serial("pinchOn");

    if (!options.direction) {
      perf.end();
      return this.createErrorResult("Pinch direction is required ('in' or 'out')", options);
    }

    if (this.device.platform === "ios") {
      perf.end();
      return this.createErrorResult("pinchOn is not supported on iOS yet.", options);
    }

    if (this.device.platform !== "android") {
      perf.end();
      return this.createErrorResult(`Unsupported platform: ${this.device.platform}`, options);
    }

    const a11yManager = AndroidCtrlProxyManager.getInstance(this.device, this.adb);
    const available = await perf.track("a11yAvailable", () => a11yManager.isAvailable());
    if (!available) {
      perf.end();
      return this.createErrorResult(
        "pinchOn requires the AutoMobile accessibility service to be installed and enabled.",
        options
      );
    }

    if (options.scale !== undefined && options.scale <= 0) {
      perf.end();
      return this.createErrorResult("scale must be greater than 0", options);
    }

    if (options.distanceStart !== undefined && options.distanceStart <= 0) {
      perf.end();
      return this.createErrorResult("distanceStart must be greater than 0", options);
    }

    if (options.distanceEnd !== undefined && options.distanceEnd <= 0) {
      perf.end();
      return this.createErrorResult("distanceEnd must be greater than 0", options);
    }

    if (options.container) {
      const selectorCount = [options.container.elementId, options.container.text].filter(Boolean).length;
      if (selectorCount !== 1) {
        perf.end();
        return this.createErrorResult(
          "pinchOn container must specify exactly one of elementId or text",
          options
        );
      }
    }

    try {
      const target = await perf.track("resolveTarget", () => this.resolveTarget(options));
      const { centerX, centerY } = this.getCenter(target.bounds);
      const { distanceStart, distanceEnd, scale } = this.resolveDistances(options, target.bounds);
      const duration = options.duration ?? 300;
      const rotationDegrees = options.rotationDegrees ?? 0;

      const a11yClient = CtrlProxyClient.getInstance(this.device, this.adb);

      const pinchResult = await this.observedInteraction(
        async () => {
          return await a11yClient.requestPinch(
            centerX,
            centerY,
            distanceStart,
            distanceEnd,
            rotationDegrees,
            duration,
            5000,
            perf
          );
        },
        {
          changeExpected: false,
          timeoutMs: 8000,
          progress,
          perf,
          predictionContext: {
            toolName: "pinchOn",
            toolArgs: {
              ...options,
              centerX,
              centerY,
              distanceStart,
              distanceEnd,
              rotationDegrees,
              duration
            }
          }
        }
      );

      perf.end();
      if (!pinchResult.success) {
        return {
          success: false,
          direction: options.direction,
          distanceStart,
          distanceEnd,
          scale,
          duration,
          rotationDegrees,
          centerX,
          centerY,
          targetType: target.targetType,
          container: target.container,
          warning: target.warning,
          observation: pinchResult.observation,
          error: pinchResult.error
        };
      }

      return {
        success: true,
        direction: options.direction,
        distanceStart,
        distanceEnd,
        scale,
        duration,
        rotationDegrees,
        centerX,
        centerY,
        targetType: target.targetType,
        container: target.container,
        warning: target.warning,
        observation: pinchResult.observation,
        a11yTotalTimeMs: pinchResult.totalTimeMs,
        a11yGestureTimeMs: pinchResult.gestureTimeMs
      };
    } catch (error) {
      perf.end();
      const baseErrorMessage = error instanceof Error ? error.message : String(error);
      let finalErrorMessage = `Failed to perform pinch: ${baseErrorMessage}`;

      if (this.visionConfig.enabled && options.container) {
        const searchCriteria = {
          text: options.container.text,
          resourceId: options.container.elementId,
          description: "Container element for pinching"
        };
        const cachedObserve = await this.observeScreen.getMostRecentCachedObserveResult();
        const viewHierarchy = cachedObserve?.viewHierarchy ?? null;
        finalErrorMessage = await getVisionEnrichedError(
          this.screenshotCapturer,
          viewHierarchy,
          searchCriteria,
          this.visionConfig,
          finalErrorMessage,
          undefined,
          this.visionAnalyzer
        );
      }

      return this.createErrorResult(finalErrorMessage, options);
    }
  }

  private async resolveTarget(options: PinchOnOptions): Promise<PinchTarget> {
    let observeResult = await this.observeScreen.getMostRecentCachedObserveResult();
    if (!observeResult.viewHierarchy || observeResult.viewHierarchy.hierarchy?.error) {
      observeResult = await this.observeScreen.execute();
    }

    if (!observeResult.viewHierarchy || !observeResult.screenSize) {
      throw new ActionableError("Unable to resolve target without a view hierarchy");
    }

    const screenBounds = this.getScreenBounds(observeResult, options.includeSystemInsets);

    if (options.container) {
      const containerElement = this.findContainerElement(options.container, observeResult.viewHierarchy);
      if (!containerElement) {
        throw new ActionableError("Container element not found for pinchOn");
      }
      return {
        bounds: containerElement.bounds,
        targetType: "container",
        container: options.container
      };
    }

    if (options.autoTarget !== false) {
      const autoTarget = this.selectAutoTargetElement(observeResult.viewHierarchy, screenBounds);
      if (autoTarget) {
        const container = buildContainerFromElement(autoTarget);
        return {
          bounds: autoTarget.bounds,
          targetType: "container",
          container: container ?? undefined,
          warning: container
            ? undefined
            : "Auto-targeted element lacks a usable identifier; pinching within its bounds without container metadata."
        };
      }
    }

    return {
      bounds: screenBounds,
      targetType: "screen"
    };
  }

  private findContainerElement(
    container: PinchOnOptions["container"],
    viewHierarchy: ViewHierarchyResult
  ): Element | null {
    if (!container) {
      return null;
    }

    if (container.elementId) {
      const element = this.finder.findElementByResourceId(viewHierarchy, container.elementId, undefined, true);
      if (element) {
        return element;
      }
    }

    if (container.text) {
      return this.finder.findElementByText(viewHierarchy, container.text, undefined, true, false);
    }

    return null;
  }

  private selectAutoTargetElement(
    viewHierarchy: ViewHierarchyResult,
    screenBounds: Element["bounds"]
  ): Element | null {
    const screenWidth = Math.max(1, screenBounds.right - screenBounds.left);
    const screenHeight = Math.max(1, screenBounds.bottom - screenBounds.top);
    const screenArea = screenWidth * screenHeight;

    const candidates = new Map<string, Element>();
    const addCandidate = (element: Element) => {
      if (!element.bounds) {
        return;
      }
      const area = boundsArea(element.bounds);
      if (area <= 0) {
        return;
      }
      const key = `${element.bounds.left},${element.bounds.top},${element.bounds.right},${element.bounds.bottom}|${element["resource-id"] ?? ""}|${element.text ?? ""}|${element["content-desc"] ?? ""}`;
      if (!candidates.has(key)) {
        candidates.set(key, element);
      }
    };

    const scrollables = this.finder.findScrollableElements(viewHierarchy);
    const clickables = this.finder.findClickableElements(viewHierarchy);
    const flattened = this.parser.flattenViewHierarchy(viewHierarchy).map(entry => entry.element);

    for (const element of scrollables) {
      addCandidate(element);
    }
    for (const element of clickables) {
      addCandidate(element);
    }
    for (const element of flattened) {
      const area = boundsArea(element.bounds);
      if (area / screenArea >= 0.15) {
        addCandidate(element);
      }
    }

    let best: { element: Element; score: number } | null = null;
    for (const element of candidates.values()) {
      if (!this.boundsWithinScreen(element.bounds, screenBounds)) {
        continue;
      }
      const area = boundsArea(element.bounds);
      if (area <= 0) {
        continue;
      }
      let score = area;
      if (element.clickable) {
        score *= 1.15;
      }
      if (element.scrollable) {
        score *= 0.9;
      }
      if (area / screenArea >= 0.5) {
        score *= 1.2;
      }
      if (this.isLikelyBottomSheet(element, screenBounds)) {
        score *= 0.2;
      }

      if (!best || score > best.score) {
        best = { element, score };
      }
    }

    return best?.element ?? null;
  }

  private resolveDistances(
    options: PinchOnOptions,
    bounds: Element["bounds"]
  ): { distanceStart: number; distanceEnd: number; scale?: number } {
    const width = Math.max(1, bounds.right - bounds.left);
    const height = Math.max(1, bounds.bottom - bounds.top);
    const minDimension = Math.min(width, height);

    const maxDistance = minDimension * 0.9;
    const minDistance = Math.max(10, minDimension * 0.1);

    let distanceStart = options.distanceStart ?? null;
    let distanceEnd = options.distanceEnd ?? null;

    if (options.scale !== undefined && options.scale > 0) {
      if (distanceStart === null && distanceEnd !== null) {
        distanceStart = distanceEnd / options.scale;
      } else if (distanceEnd === null && distanceStart !== null) {
        distanceEnd = distanceStart * options.scale;
      } else if (distanceStart === null && distanceEnd === null) {
        distanceStart = minDimension * 0.25;
        distanceEnd = distanceStart * options.scale;
      }
    }

    if (distanceStart === null || distanceEnd === null) {
      if (options.direction === "out") {
        distanceStart = distanceStart ?? minDimension * 0.2;
        distanceEnd = distanceEnd ?? minDimension * 0.6;
      } else {
        distanceStart = distanceStart ?? minDimension * 0.6;
        distanceEnd = distanceEnd ?? minDimension * 0.2;
      }
    }

    if (options.direction === "out" && distanceEnd <= distanceStart) {
      distanceEnd = Math.min(maxDistance, distanceStart * 1.5);
    }

    if (options.direction === "in" && distanceStart <= distanceEnd) {
      distanceStart = Math.min(maxDistance, distanceEnd * 1.5);
    }

    distanceStart = clamp(distanceStart, minDistance, maxDistance);
    distanceEnd = clamp(distanceEnd, minDistance, maxDistance);

    const scale = distanceStart > 0 ? distanceEnd / distanceStart : undefined;
    return { distanceStart, distanceEnd, scale };
  }

  private getScreenBounds(observeResult: ObserveResult, includeSystemInsets?: boolean): Element["bounds"] {
    if (!observeResult.screenSize) {
      throw new ActionableError("Could not determine screen size");
    }

    return getScreenBoundsFromSize(observeResult.screenSize, observeResult.systemInsets, includeSystemInsets);
  }

  private getCenter(bounds: Element["bounds"]): { centerX: number; centerY: number } {
    const centerX = Math.round((bounds.left + bounds.right) / 2);
    const centerY = Math.round((bounds.top + bounds.bottom) / 2);
    return { centerX, centerY };
  }

  private boundsWithinScreen(bounds: Element["bounds"], screenBounds: Element["bounds"]): boolean {
    return (
      bounds.right > screenBounds.left &&
      bounds.left < screenBounds.right &&
      bounds.bottom > screenBounds.top &&
      bounds.top < screenBounds.bottom
    );
  }

  private isLikelyBottomSheet(element: Element, screenBounds: Element["bounds"]): boolean {
    const height = Math.max(0, element.bounds.bottom - element.bounds.top);
    const screenHeight = Math.max(1, screenBounds.bottom - screenBounds.top);
    const bottomAligned = element.bounds.bottom >= screenBounds.bottom - screenHeight * 0.05;
    const shorterThanScreen = height <= screenHeight * 0.65;
    const scrollable = element.scrollable === true;
    const className = element["class"]?.toLowerCase() ?? "";
    const classSuggestsSheet = className.includes("bottomsheet") || className.includes("sheet");

    return (scrollable && bottomAligned && shorterThanScreen) || (classSuggestsSheet && bottomAligned);
  }

}
