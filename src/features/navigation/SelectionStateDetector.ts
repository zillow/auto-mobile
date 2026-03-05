import { Element, ElementBounds, ObserveResult, ScreenSize } from "../../models";
import { SelectedElement, SelectedElementDetection } from "../../utils/interfaces/NavigationGraph";
import { ScreenshotUtils, screenshotUtilsAdapter } from "../../utils/ScreenshotUtilsAdapter";
import { ImageUtils } from "../../utils/interfaces/ImageUtils";
import { SharpImageUtils } from "../../utils/image-utils";
import { logger } from "../../utils/logger";
import { UIStateExtractor } from "./UIStateExtractor";

interface VisualSelectionConfig {
  minDifferencePercent?: number;
  minElementSizePx?: number;
  pixelmatchThreshold?: number;
  confidenceScale?: number;
}

const DEFAULT_VISUAL_SELECTION_CONFIG: Required<VisualSelectionConfig> = {
  minDifferencePercent: 1,
  minElementSizePx: 4,
  pixelmatchThreshold: 0.1,
  confidenceScale: 5
};

interface SelectionStateDetectorOptions {
  screenshotUtils?: ScreenshotUtils;
  imageUtils?: ImageUtils;
  config?: VisualSelectionConfig;
}

export interface SelectionDetectionContext {
  currentObservation?: ObserveResult;
  previousObservation?: ObserveResult | null;
  tappedElement?: Element;
  beforeScreenshotPath?: string | null;
  afterScreenshotPath?: string | null;
}

export interface SelectionStateDetectorLike {
  detectSelectedElements(context: SelectionDetectionContext): Promise<SelectedElement[]>;
}

export class SelectionStateDetector implements SelectionStateDetectorLike {
  private screenshotUtils: ScreenshotUtils;
  private imageUtils: ImageUtils;
  private config: Required<VisualSelectionConfig>;

  constructor(options: SelectionStateDetectorOptions = {}) {
    this.screenshotUtils = options.screenshotUtils ?? screenshotUtilsAdapter;
    this.imageUtils = options.imageUtils ?? new SharpImageUtils();
    this.config = {
      ...DEFAULT_VISUAL_SELECTION_CONFIG,
      ...options.config
    };
  }

  async detectSelectedElements(context: SelectionDetectionContext): Promise<SelectedElement[]> {
    const currentObservation = context.currentObservation;
    if (!currentObservation?.viewHierarchy) {
      return [];
    }

    const accessibilityState = new UIStateExtractor().extract(currentObservation.viewHierarchy);
    if (accessibilityState?.selectedElements?.length) {
      const selectedElements = this.applySelectedState(accessibilityState.selectedElements, {
        method: "accessibility",
        confidence: 1,
        reason: "selected attribute present in view hierarchy"
      });
      logger.info(`[SELECTION_STATE] Using accessibility selected state (${selectedElements.length} element(s))`);
      return selectedElements;
    }

    if (!context.tappedElement) {
      logger.debug("[SELECTION_STATE] Visual fallback skipped: no tapped element provided");
      return [];
    }

    if (!context.beforeScreenshotPath || !context.afterScreenshotPath) {
      logger.debug("[SELECTION_STATE] Visual fallback skipped: missing before/after screenshots");
      return [];
    }

    const selectedElement = this.buildSelectedElement(context.tappedElement);
    if (!selectedElement) {
      logger.debug("[SELECTION_STATE] Visual fallback skipped: tapped element lacks identifiers");
      return [];
    }

    const visualResult = await this.detectVisualSelection(
      context.tappedElement.bounds,
      context.beforeScreenshotPath,
      context.afterScreenshotPath,
      context.previousObservation?.screenSize,
      currentObservation.screenSize
    );

    if (!visualResult) {
      return [];
    }

    const detection: SelectedElementDetection = {
      method: "visual",
      confidence: visualResult.confidence,
      reason: visualResult.reason
    };

    logger.info(
      `[SELECTION_STATE] Using visual fallback for ${this.describeElement(selectedElement)} ` +
      `(diff=${visualResult.differencePercent.toFixed(2)}%, confidence=${visualResult.confidence})`
    );

    return [{
      ...selectedElement,
      selectedState: detection
    }];
  }

  private applySelectedState(
    selectedElements: SelectedElement[],
    selectedState: SelectedElementDetection
  ): SelectedElement[] {
    return selectedElements.map(element => ({
      ...element,
      selectedState: element.selectedState ?? selectedState
    }));
  }

  private buildSelectedElement(element: Element): SelectedElement | null {
    const selected: SelectedElement = {
      text: element.text,
      resourceId: element["resource-id"],
      contentDesc: element["content-desc"]
    };

    if (!selected.text && !selected.resourceId && !selected.contentDesc) {
      return null;
    }

    return selected;
  }

  private describeElement(element: SelectedElement): string {
    return element.text || element.resourceId || element.contentDesc || "unknown element";
  }

  private async detectVisualSelection(
    bounds: ElementBounds,
    beforeScreenshotPath: string,
    afterScreenshotPath: string,
    beforeScreenSize?: ScreenSize,
    afterScreenSize?: ScreenSize
  ): Promise<{ differencePercent: number; confidence: number; reason: string } | null> {
    try {
      const beforeScreenshot = await this.screenshotUtils.getCachedScreenshot(beforeScreenshotPath);
      const afterScreenshot = await this.screenshotUtils.getCachedScreenshot(afterScreenshotPath);

      const beforeDimensions = await this.screenshotUtils.getImageDimensions(beforeScreenshot.buffer);
      const afterDimensions = await this.screenshotUtils.getImageDimensions(afterScreenshot.buffer);

      const beforeCrop = await this.cropElementRegion(
        beforeScreenshot.buffer,
        bounds,
        beforeScreenSize,
        beforeDimensions
      );
      const afterCrop = await this.cropElementRegion(
        afterScreenshot.buffer,
        bounds,
        afterScreenSize,
        afterDimensions
      );

      if (!beforeCrop || !afterCrop) {
        logger.debug("[SELECTION_STATE] Visual fallback skipped: invalid element bounds for cropping");
        return null;
      }

      const comparison = await this.screenshotUtils.compareImages(
        beforeCrop,
        afterCrop,
        this.config.pixelmatchThreshold,
        false
      );

      const differencePercent = Math.max(0, 100 - comparison.similarity);
      if (differencePercent < this.config.minDifferencePercent) {
        logger.debug(
          `[SELECTION_STATE] Visual fallback skipped: diff ${differencePercent.toFixed(2)}% ` +
          `< threshold ${this.config.minDifferencePercent}%`
        );
        return null;
      }

      const confidence = this.computeConfidence(differencePercent);
      return {
        differencePercent,
        confidence,
        reason: `visual diff ${differencePercent.toFixed(2)}% >= ${this.config.minDifferencePercent}%`
      };
    } catch (error) {
      logger.warn(`[SELECTION_STATE] Visual fallback failed: ${error}`);
      return null;
    }
  }

  private async cropElementRegion(
    buffer: Buffer,
    bounds: ElementBounds,
    screenSize: ScreenSize | undefined,
    imageDimensions: { width: number; height: number }
  ): Promise<Buffer | null> {
    const normalized = this.normalizeBounds(bounds, screenSize, imageDimensions);
    if (!normalized) {
      return null;
    }

    return this.imageUtils.crop(
      buffer,
      normalized.width,
      normalized.height,
      normalized.left,
      normalized.top
    );
  }

  private normalizeBounds(
    bounds: ElementBounds,
    screenSize: ScreenSize | undefined,
    imageDimensions: { width: number; height: number }
  ): { left: number; top: number; width: number; height: number } | null {
    if (imageDimensions.width <= 0 || imageDimensions.height <= 0) {
      return null;
    }

    const scaleX = screenSize?.width ? imageDimensions.width / screenSize.width : 1;
    const scaleY = screenSize?.height ? imageDimensions.height / screenSize.height : 1;

    const left = Math.max(0, Math.floor(bounds.left * scaleX));
    const top = Math.max(0, Math.floor(bounds.top * scaleY));
    const right = Math.min(imageDimensions.width, Math.ceil(bounds.right * scaleX));
    const bottom = Math.min(imageDimensions.height, Math.ceil(bounds.bottom * scaleY));

    const width = right - left;
    const height = bottom - top;

    if (width < this.config.minElementSizePx || height < this.config.minElementSizePx) {
      return null;
    }

    return { left, top, width, height };
  }

  private computeConfidence(differencePercent: number): number {
    const normalized = Math.min(1, Math.max(0, differencePercent / this.config.confidenceScale));
    return Number(normalized.toFixed(2));
  }
}
