import {
  Element,
  GestureOptions,
  ObserveResult,
  SwipeDirection,
  SwipeOnOptions,
  ViewHierarchyQueryOptions,
  ViewHierarchyResult
} from "../../../models";
import { PerformanceTracker } from "../../../utils/PerformanceTracker";
import { SwipeResult } from "../../../models/SwipeResult";
import type { ObserveScreen } from "../../observe/interfaces/ObserveScreen";
import { AccessibilityDetector } from "../../../utils/interfaces/AccessibilityDetector";
import type { IosVoiceOverDetector } from "../../../utils/interfaces/IosVoiceOverDetector";

export type SwipeOnResolvedOptions = SwipeOnOptions & { direction: SwipeDirection };

export type SwipeInterval = { start: number; end: number; length: number };

export type BoomerangConfig = { apexPauseMs: number; returnSpeed: number };

export type OverlayCandidate = {
  bounds: Element["bounds"];
  overlapBounds: Element["bounds"];
  coverage: number;
  zOrder: { windowRank: number; nodeOrder: number };
};

export interface VoiceOverSwipeRunner {
  executeSwipeGesture(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    gestureOptions?: GestureOptions,
    perf?: PerformanceTracker
  ): Promise<SwipeResult>;
}

export interface AutoTargetSelectorService {
  selectAutoTargetScrollable(
    scrollables: Element[],
    screenBounds: Element["bounds"] | null,
    direction: SwipeDirection
  ): Element | null;

  getScreenBounds(observeResult: ObserveResult): Element["bounds"] | null;

  describeContainer(container: SwipeOnOptions["container"]): string;

  mergeWarnings(...warnings: Array<string | undefined>): string | undefined;
}

export interface TalkBackSwipeRunner {
  executeSwipeGesture(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    direction: SwipeDirection,
    containerElement: Element | null,
    gestureOptions?: GestureOptions,
    perf?: PerformanceTracker,
    boomerang?: BoomerangConfig
  ): Promise<SwipeResult>;
}

export interface OverlayAnalyzer {
  collectOverlayCandidates(
    viewHierarchy: ViewHierarchyResult,
    container: SwipeOnOptions["container"] | undefined,
    containerElement: Element
  ): OverlayCandidate[];

  computeSafeSwipeCoordinates(
    direction: SwipeDirection,
    bounds: Element["bounds"],
    overlayBounds: Element["bounds"][]
  ): { startX: number; startY: number; endX: number; endY: number; warning?: string } | null;
}

export interface GestureExecutor {
  swipe(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    options?: GestureOptions,
    perf?: PerformanceTracker
  ): Promise<SwipeResult>;
}

export interface ScrollAccessibilityService {
  requestAction(
    action: string,
    resourceId?: string,
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<{ success: boolean; error?: string; [key: string]: unknown }>;

  getAccessibilityHierarchy(
    queryOptions?: ViewHierarchyQueryOptions,
    perf?: PerformanceTracker,
    skipWaitForFresh?: boolean,
    minTimestamp?: number,
    disableAllFiltering?: boolean
  ): Promise<ViewHierarchyResult | null>;
}

export interface SwipeOnDependencies {
  executeGesture?: GestureExecutor;
  observeScreen?: ObserveScreen;
  finder?: import("../../../utils/interfaces/ElementFinder").ElementFinder;
  geometry?: import("../../../utils/interfaces/ElementGeometry").ElementGeometry;
  parser?: import("../../../utils/interfaces/ElementParser").ElementParser;
  accessibilityDetector?: AccessibilityDetector;
  iosVoiceOverDetector?: IosVoiceOverDetector;
  voiceOverExecutor?: VoiceOverSwipeRunner;
  autoTargetSelector?: AutoTargetSelectorService;
  visionConfig?: import("../../../vision/VisionTypes").VisionFallbackConfig;
  screenshotCapturer?: import("../../navigation/SelectionStateTracker").ScreenshotCapturer;
  visionAnalyzer?: import("../../../vision/VisionTypes").VisionAnalyzer;
}
