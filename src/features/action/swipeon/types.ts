import {
  Element,
  GestureOptions,
  SwipeDirection,
  SwipeOnOptions
} from "../../../models";
import { PerformanceTracker } from "../../../utils/PerformanceTracker";
import { SwipeResult } from "../../../models/SwipeResult";
import type { ObserveScreen } from "../../observe/interfaces/ObserveScreen";
import { AccessibilityDetector } from "../../../utils/interfaces/AccessibilityDetector";

export type SwipeOnResolvedOptions = SwipeOnOptions & { direction: SwipeDirection };

export type SwipeInterval = { start: number; end: number; length: number };

export type BoomerangConfig = { apexPauseMs: number; returnSpeed: number };

export type OverlayCandidate = {
  bounds: Element["bounds"];
  overlapBounds: Element["bounds"];
  coverage: number;
  zOrder: { windowRank: number; nodeOrder: number };
};

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

export interface SwipeOnDependencies {
  executeGesture?: GestureExecutor;
  observeScreen?: ObserveScreen;
  elementUtils?: import("../../utility/ElementUtils").ElementUtils;
  accessibilityDetector?: AccessibilityDetector;
}
