import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import {
  ActionableError,
  BootedDevice,
  DragAndDropOptions,
  DragAndDropResult,
  ObserveResult,
  ViewHierarchyResult
} from "../../models";
import { ElementUtils } from "../utility/ElementUtils";
import { AccessibilityServiceClient } from "../observe/AccessibilityServiceClient";
import { createGlobalPerformanceTracker } from "../../utils/PerformanceTracker";
import { throwIfAborted } from "../../utils/toolUtils";
import { AndroidAccessibilityServiceManager } from "../../utils/AccessibilityServiceManager";

export class DragAndDrop extends BaseVisualChange {
  private elementUtils: ElementUtils;
  private accessibilityService: AccessibilityServiceClient;

  constructor(device: BootedDevice) {
    super(device);
    this.elementUtils = new ElementUtils();
    this.accessibilityService = AccessibilityServiceClient.getInstance(device, this.adb);
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

    const a11yManager = AndroidAccessibilityServiceManager.getInstance(this.device, this.adb);
    const isInstalled = await a11yManager.isInstalled();
    if (!isInstalled) {
      return {
        success: false,
        duration: 0,
        distance: 0,
        error: "dragAndDrop requires the Android accessibility service to be installed"
      };
    }

    const validationError = this.validateOptions(options);
    if (validationError) {
      return {
        success: false,
        duration: 0,
        distance: 0,
        error: validationError
      };
    }

    const perf = createGlobalPerformanceTracker();
    perf.serial("dragAndDrop");

    try {
      const result = await this.observedInteraction(
        async (observeResult: ObserveResult) => {
          throwIfAborted(signal);
          const viewHierarchy = observeResult.viewHierarchy;
          if (!viewHierarchy) {
            return { success: false, error: "Unable to get view hierarchy, cannot drag and drop" };
          }

          const source = this.resolveTarget(viewHierarchy, options.source, "source");
          const target = this.resolveTarget(viewHierarchy, options.target, "target");
          const sourcePoint = this.elementUtils.getElementCenter(source);
          const targetPoint = this.elementUtils.getElementCenter(target);
          const duration = this.getDuration(options);
          const holdTime = this.getHoldTime(options);

          const dragResult = await this.executeAndroidDrag(
            sourcePoint.x,
            sourcePoint.y,
            targetPoint.x,
            targetPoint.y,
            duration,
            holdTime,
            signal
          );

          if (options.dropDelay && options.dropDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, options.dropDelay));
          }

          const distance = Math.hypot(targetPoint.x - sourcePoint.x, targetPoint.y - sourcePoint.y);

          return {
            success: dragResult.success,
            duration,
            distance,
            a11yTotalTimeMs: dragResult.a11yTotalTimeMs,
            a11yGestureTimeMs: dragResult.a11yGestureTimeMs,
            error: dragResult.error
          };
        },
        {
          changeExpected: false,
          timeoutMs: 5000,
          progress,
          perf,
          signal,
          predictionContext: {
            toolName: "dragAndDrop",
            toolArgs: {
              source: options.source,
              target: options.target,
              duration: options.duration,
              holdTime: options.holdTime,
              dropDelay: options.dropDelay,
              platform: this.device.platform
            }
          }
        }
      );

      perf.end();

      return {
        ...result,
        duration: result.duration ?? this.getDuration(options),
        distance: result.distance ?? 0
      } as DragAndDropResult;
    } catch (error) {
      perf.end();

      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        duration: 0,
        distance: 0,
        error: `Failed to perform drag and drop: ${errorMessage}`
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
      const element = this.elementUtils.findElementByResourceId(viewHierarchy, target.elementId);
      if (!element) {
        throw new ActionableError(`dragAndDrop ${label} not found with elementId '${target.elementId}'`);
      }
      return element;
    }
    if (target.text) {
      const element = this.elementUtils.findElementByText(viewHierarchy, target.text);
      if (!element) {
        throw new ActionableError(`dragAndDrop ${label} not found with text '${target.text}'`);
      }
      return element;
    }
    throw new ActionableError(`dragAndDrop ${label} requires text or elementId`);
  }

  private getDuration(options: DragAndDropOptions): number {
    if (typeof options.duration === "number" && options.duration > 0) {
      return options.duration;
    }
    return 500;
  }

  private getHoldTime(options: DragAndDropOptions): number {
    if (typeof options.holdTime === "number" && options.holdTime >= 0) {
      return options.holdTime;
    }
    return 200;
  }

  private async executeAndroidDrag(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    duration: number,
    holdTime: number,
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
      duration,
      holdTime,
      5000
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
