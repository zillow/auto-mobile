import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import {
  ActionableError,
  BootedDevice,
  DragAndDropOptions,
  DragAndDropResult,
  ObserveResult,
  ViewHierarchyResult
} from "../../models";
import type { ElementFinder } from "../../utils/interfaces/ElementFinder";
import type { ElementGeometry } from "../../utils/interfaces/ElementGeometry";
import { DefaultElementFinder } from "../utility/ElementFinder";
import { DefaultElementGeometry } from "../utility/ElementGeometry";
import { CtrlProxyClient } from "../observe/android";
import { createGlobalPerformanceTracker } from "../../utils/PerformanceTracker";
import { throwIfAborted } from "../../utils/toolUtils";
import { AndroidCtrlProxyManager } from "../../utils/CtrlProxyManager";
import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { Timer, defaultTimer } from "../../utils/SystemTimer";
import { ViewHierarchy } from "../observe/ViewHierarchy";
import { serverConfig } from "../../utils/ServerConfig";
import { attachRawViewHierarchy } from "../../utils/viewHierarchySearch";
import { refreshAndroidViewHierarchy } from "./refreshAndroidViewHierarchy";
import { DEFAULT_VISION_CONFIG, getVisionEnrichedError, type VisionFallbackConfig, type VisionAnalyzer } from "../../vision/index";
import { TakeScreenshotCapturer, type ScreenshotCapturer } from "../navigation/SelectionStateTracker";

const PRESS_DURATION_MIN_MS = 600;
const PRESS_DURATION_MAX_MS = 3000;
const DRAG_DURATION_MIN_MS = 300;
const DRAG_DURATION_MAX_MS = 2000;
const HOLD_DURATION_MIN_MS = 100;
const HOLD_DURATION_MAX_MS = 3000;
const DROP_DURATION_MS = 100;
const DRAG_TIMEOUT_BUFFER_MS = 500;
const HIERARCHY_REFRESH_TIMEOUT_MS = 5000;

interface DragAndDropDeps {
  visionConfig?: VisionFallbackConfig;
  screenshotCapturer?: ScreenshotCapturer;
  visionAnalyzer?: VisionAnalyzer;
}

export class DragAndDrop extends BaseVisualChange {
  private finder: ElementFinder;
  private geometry: ElementGeometry;
  private accessibilityService: CtrlProxyClient;
  private viewHierarchy: ViewHierarchy;
  private visionConfig: VisionFallbackConfig;
  private screenshotCapturer: ScreenshotCapturer;
  private visionAnalyzer: VisionAnalyzer | undefined;

  constructor(
    device: BootedDevice,
    adb: AdbClient | null = null,
    timer: Timer = defaultTimer,
    deps: DragAndDropDeps = {}
  ) {
    super(device, adb, timer);
    this.finder = new DefaultElementFinder();
    this.geometry = new DefaultElementGeometry();
    this.accessibilityService = CtrlProxyClient.getInstance(device, this.adbFactory);
    this.viewHierarchy = new ViewHierarchy(device, this.adbFactory);
    this.visionConfig = deps.visionConfig ?? DEFAULT_VISION_CONFIG;
    this.screenshotCapturer = deps.screenshotCapturer ?? new TakeScreenshotCapturer(device, this.adbFactory);
    this.visionAnalyzer = deps.visionAnalyzer;
  }

  async execute(
    options: DragAndDropOptions,
    progress?: ProgressCallback,
    signal?: AbortSignal
  ): Promise<DragAndDropResult> {
    if (this.device.platform === "ios") {
      return {
        success: false,
        duration: 0,
        distance: 0,
        error: "dragAndDrop is not supported on iOS yet"
      };
    }

    const perf = createGlobalPerformanceTracker();
    perf.serial("dragAndDrop");

    const a11yManager = AndroidCtrlProxyManager.getInstance(this.device, this.adb);
    const isAvailable = await perf.track("a11yAvailable", () => a11yManager.isAvailable());
    if (!isAvailable) {
      perf.end();
      return {
        success: false,
        duration: 0,
        distance: 0,
        error: "dragAndDrop requires the Android accessibility service to be installed and enabled."
      };
    }

    const validationError = this.validateOptions(options);
    if (validationError) {
      perf.end();
      return {
        success: false,
        duration: 0,
        distance: 0,
        error: validationError
      };
    }

    try {
      const pressDurationMs = this.getPressDurationMs(options);
      const dragDurationMs = this.getDragDurationMs(options);
      const holdDurationMs = this.getHoldDurationMs(options);

      const result = await this.observedInteraction(
        async (observeResult: ObserveResult) => {
          throwIfAborted(signal);
          const viewHierarchy = await this.resolveViewHierarchy(observeResult, signal);
          if (!viewHierarchy) {
            return { success: false, error: "Unable to get view hierarchy, cannot drag and drop" };
          }

          const source = this.resolveTarget(viewHierarchy, options.source, "source");
          const target = this.resolveTarget(viewHierarchy, options.target, "target");
          const sourcePoint = this.geometry.getElementCenter(source);
          const targetPoint = this.geometry.getElementCenter(target);

          const dragResult = await this.executeAndroidDrag(
            sourcePoint.x,
            sourcePoint.y,
            targetPoint.x,
            targetPoint.y,
            pressDurationMs,
            dragDurationMs,
            holdDurationMs,
            signal
          );

          await this.timer.sleep(DROP_DURATION_MS);

          const distance = Math.hypot(targetPoint.x - sourcePoint.x, targetPoint.y - sourcePoint.y);

          return {
            success: dragResult.success,
            duration: dragDurationMs,
            distance,
            a11yTotalTimeMs: dragResult.a11yTotalTimeMs,
            a11yGestureTimeMs: dragResult.a11yGestureTimeMs,
            error: dragResult.error
          };
        },
        {
          changeExpected: false,
          progress,
          perf,
          signal,
          predictionContext: {
            toolName: "dragAndDrop",
            toolArgs: {
              source: options.source,
              target: options.target,
              pressDurationMs,
              dragDurationMs,
              holdDurationMs,
              platform: this.device.platform
            }
          }
        }
      );

      perf.end();

      return {
        ...result,
        duration: result.duration ?? this.getDragDurationMs(options),
        distance: result.distance ?? 0
      } as DragAndDropResult;
    } catch (error) {
      perf.end();

      const baseErrorMessage = error instanceof Error ? error.message : String(error);
      let finalErrorMessage = `Failed to perform drag and drop: ${baseErrorMessage}`;

      if (this.visionConfig.enabled) {
        // Infer which element failed from the error message
        const isSourceError = baseErrorMessage.toLowerCase().includes("source");
        const failedTarget = isSourceError ? options.source : options.target;
        if (failedTarget) {
          const searchCriteria = {
            text: failedTarget.text,
            resourceId: failedTarget.elementId,
            description: isSourceError ? "Source element for drag" : "Target element for drop"
          };
          const cachedObserve = await this.observeScreen.getMostRecentCachedObserveResult();
          const viewHierarchy = cachedObserve?.viewHierarchy ?? null;
          finalErrorMessage = await getVisionEnrichedError(
            this.screenshotCapturer,
            viewHierarchy,
            searchCriteria,
            this.visionConfig,
            finalErrorMessage,
            signal,
            this.visionAnalyzer
          );
        }
      }

      return {
        success: false,
        duration: 0,
        distance: 0,
        error: finalErrorMessage
      };
    }
  }

  private validateOptions(options: DragAndDropOptions): string | null {
    if (!options?.source || !options?.target) {
      return "dragAndDrop requires source and target";
    }
    const sourceSelectorCount = [options.source.text, options.source.elementId].filter(Boolean).length;
    if (sourceSelectorCount !== 1) {
      return "dragAndDrop source must specify exactly one of text or elementId";
    }
    const targetSelectorCount = [options.target.text, options.target.elementId].filter(Boolean).length;
    if (targetSelectorCount !== 1) {
      return "dragAndDrop target must specify exactly one of text or elementId";
    }
    if (!this.isDurationInRange(options.pressDurationMs, PRESS_DURATION_MIN_MS, PRESS_DURATION_MAX_MS)) {
      return `dragAndDrop pressDurationMs must be between ${PRESS_DURATION_MIN_MS}ms and ${PRESS_DURATION_MAX_MS}ms`;
    }
    if (!this.isDurationInRange(options.dragDurationMs, DRAG_DURATION_MIN_MS, DRAG_DURATION_MAX_MS)) {
      return `dragAndDrop dragDurationMs must be between ${DRAG_DURATION_MIN_MS}ms and ${DRAG_DURATION_MAX_MS}ms`;
    }
    if (!this.isDurationInRange(options.holdDurationMs, HOLD_DURATION_MIN_MS, HOLD_DURATION_MAX_MS)) {
      return `dragAndDrop holdDurationMs must be between ${HOLD_DURATION_MIN_MS}ms and ${HOLD_DURATION_MAX_MS}ms`;
    }
    return null;
  }

  private resolveTarget(
    viewHierarchy: ViewHierarchyResult,
    target: { text?: string; elementId?: string },
    label: "source" | "target"
  ) {
    const selectorCount = [target.elementId, target.text].filter(Boolean).length;
    if (selectorCount !== 1) {
      throw new ActionableError(`dragAndDrop ${label} must specify exactly one of text or elementId`);
    }
    if (target.elementId) {
      const element = this.finder.findElementByResourceId(viewHierarchy, target.elementId);
      if (!element) {
        throw new ActionableError(`dragAndDrop ${label} not found with elementId '${target.elementId}'`);
      }
      return element;
    }
    if (target.text) {
      const element = this.finder.findElementByText(viewHierarchy, target.text);
      if (!element) {
        throw new ActionableError(`dragAndDrop ${label} not found with text '${target.text}'`);
      }
      return element;
    }
    throw new ActionableError(`dragAndDrop ${label} requires text or elementId`);
  }

  private async resolveViewHierarchy(
    observeResult: ObserveResult,
    signal?: AbortSignal
  ): Promise<ViewHierarchyResult | null> {
    // Prefer a fresh hierarchy to avoid stale drag coordinates after navigation/scrolling.
    const refreshed = await this.refreshViewHierarchy(signal);
    if (refreshed && !refreshed.hierarchy?.error) {
      return refreshed;
    }

    if (observeResult.viewHierarchy && !observeResult.viewHierarchy.hierarchy?.error) {
      return observeResult.viewHierarchy;
    }

    return null;
  }

  private async refreshViewHierarchy(signal?: AbortSignal): Promise<ViewHierarchyResult | null> {
    const rawHierarchy = await refreshAndroidViewHierarchy(
      this.accessibilityService,
      this.viewHierarchy,
      HIERARCHY_REFRESH_TIMEOUT_MS,
      signal
    );

    if (!rawHierarchy) {
      return null;
    }

    if (!serverConfig.isRawElementSearchEnabled()) {
      return rawHierarchy;
    }
    if (
      rawHierarchy?.hierarchy &&
      typeof rawHierarchy.hierarchy === "object" &&
      "error" in rawHierarchy.hierarchy &&
      rawHierarchy.hierarchy.error
    ) {
      return rawHierarchy;
    }
    const filtered = this.viewHierarchy.filterViewHierarchy(rawHierarchy);
    attachRawViewHierarchy(filtered, rawHierarchy);
    return filtered;
  }

  private getPressDurationMs(options: DragAndDropOptions): number {
    if (typeof options.pressDurationMs === "number") {
      return options.pressDurationMs;
    }
    return PRESS_DURATION_MIN_MS;
  }

  private getDragDurationMs(options: DragAndDropOptions): number {
    if (typeof options.dragDurationMs === "number") {
      return options.dragDurationMs;
    }
    return DRAG_DURATION_MIN_MS;
  }

  private getHoldDurationMs(options: DragAndDropOptions): number {
    if (typeof options.holdDurationMs === "number") {
      return options.holdDurationMs;
    }
    return HOLD_DURATION_MIN_MS;
  }

  private isDurationInRange(value: number | undefined, min: number, max: number): boolean {
    if (typeof value !== "number") {
      return true;
    }
    return value >= min && value <= max;
  }

  private getDragTimeoutMs(pressDurationMs: number, dragDurationMs: number, holdDurationMs: number): number {
    return pressDurationMs + dragDurationMs + holdDurationMs + DROP_DURATION_MS + DRAG_TIMEOUT_BUFFER_MS;
  }

  private async executeAndroidDrag(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    pressDurationMs: number,
    dragDurationMs: number,
    holdDurationMs: number,
    signal?: AbortSignal
  ): Promise<{
    success: boolean;
    error?: string;
    a11yTotalTimeMs?: number;
    a11yGestureTimeMs?: number;
  }> {
    throwIfAborted(signal);

    const result = await this.accessibilityService.requestDrag(
      startX,
      startY,
      endX,
      endY,
      pressDurationMs,
      dragDurationMs,
      holdDurationMs,
      this.getDragTimeoutMs(pressDurationMs, dragDurationMs, holdDurationMs)
    );

    if (result.success) {
      return {
        success: true,
        a11yTotalTimeMs: result.totalTimeMs,
        a11yGestureTimeMs: result.gestureTimeMs
      };
    }

    return {
      success: false,
      error: result.error ?? "Drag failed via accessibility service"
    };
  }
}
