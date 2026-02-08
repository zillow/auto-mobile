import { BootedDevice, Element, ObserveResult } from "../../models";
import { AdbClientFactory, defaultAdbClientFactory } from "../../utils/android-cmdline-tools/AdbClientFactory";
import { logger } from "../../utils/logger";
import { SelectedElement } from "../../utils/interfaces/NavigationGraph";
import { TakeScreenshot } from "../observe/TakeScreenshot";
import { SelectionDetectionContext, SelectionStateDetector, SelectionStateDetectorLike } from "./SelectionStateDetector";
import { UIStateExtractor } from "./UIStateExtractor";

export interface ScreenshotCapturer {
  capture(signal?: AbortSignal): Promise<string | null>;
}

export class TakeScreenshotCapturer implements ScreenshotCapturer {
  private device: BootedDevice;
  private adbFactory: AdbClientFactory;

  constructor(device: BootedDevice, adbFactory: AdbClientFactory = defaultAdbClientFactory) {
    this.device = device;
    this.adbFactory = adbFactory;
  }

  async capture(signal?: AbortSignal): Promise<string | null> {
    const screenshot = new TakeScreenshot(this.device, this.adbFactory);
    const result = await screenshot.execute({ format: "png" }, signal);
    if (!result.success || !result.path) {
      return null;
    }
    return result.path;
  }
}

export interface SelectionCaptureState {
  beforeScreenshotPath: string;
  action: string;
}

export interface SelectionCaptureRequest {
  action: string;
  observation?: ObserveResult;
  element?: Element;
  signal?: AbortSignal;
}

export interface SelectionFinalizeRequest {
  action: string;
  selectionState?: SelectionCaptureState | null;
  currentObservation?: ObserveResult;
  previousObservation?: ObserveResult | null;
  element?: Element;
  signal?: AbortSignal;
}

export interface SelectionStateTrackerOptions {
  detector?: SelectionStateDetectorLike;
  screenshotCapturer: ScreenshotCapturer;
}

export class SelectionStateTracker {
  private detector: SelectionStateDetectorLike;
  private screenshotCapturer: ScreenshotCapturer;

  constructor(options: SelectionStateTrackerOptions) {
    this.detector = options.detector ?? new SelectionStateDetector();
    this.screenshotCapturer = options.screenshotCapturer;
  }

  async prepare(request: SelectionCaptureRequest): Promise<SelectionCaptureState | null> {
    const { observation, element, action, signal } = request;
    if (!observation?.viewHierarchy || !element) {
      return null;
    }

    if (!this.hasIdentifier(element)) {
      logger.debug(`[SELECTION_STATE] Skip selection capture (${action}): element lacks identifier`);
      return null;
    }

    if (!this.isSelectionCandidate(element)) {
      logger.debug(`[SELECTION_STATE] Skip selection capture (${action}): element not selectable`);
      return null;
    }

    const accessibilityState = new UIStateExtractor().extract(observation.viewHierarchy);
    if (accessibilityState?.selectedElements?.length) {
      logger.info(`[SELECTION_STATE] Skip visual capture (${action}): accessibility selected state available`);
      return null;
    }

    const beforeScreenshotPath = await this.screenshotCapturer.capture(signal);
    if (!beforeScreenshotPath) {
      logger.warn(`[SELECTION_STATE] Failed to capture pre-action screenshot (${action})`);
      return null;
    }

    return {
      beforeScreenshotPath,
      action
    };
  }

  async finalize(request: SelectionFinalizeRequest): Promise<SelectedElement[]> {
    const { selectionState, currentObservation, previousObservation, element, action, signal } = request;
    if (!selectionState || !currentObservation || !element) {
      return [];
    }

    const afterScreenshotPath = await this.screenshotCapturer.capture(signal);
    if (!afterScreenshotPath) {
      logger.warn(`[SELECTION_STATE] Failed to capture post-action screenshot (${action})`);
      return [];
    }

    const context: SelectionDetectionContext = {
      currentObservation,
      previousObservation,
      tappedElement: element,
      beforeScreenshotPath: selectionState.beforeScreenshotPath,
      afterScreenshotPath
    };

    return this.detector.detectSelectedElements(context);
  }

  private hasIdentifier(element: Element): boolean {
    return Boolean(element.text || element["resource-id"] || element["content-desc"]);
  }

  private isSelectionCandidate(element: Element): boolean {
    const clickable = element.clickable === true || element.clickable === "true";
    const checkable = element.checkable === true || element.checkable === "true";
    return clickable || checkable;
  }
}
