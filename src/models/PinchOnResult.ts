import { ObserveResult } from "./ObserveResult";

export interface PinchOnResult {
  success: boolean;
  direction: "in" | "out";
  distanceStart: number;
  distanceEnd: number;
  scale?: number;
  duration: number;
  rotationDegrees?: number;
  centerX: number;
  centerY: number;
  targetType: "screen" | "container";
  container?: {
    elementId?: string;
    text?: string;
  };
  warning?: string;
  observation?: ObserveResult;
  error?: string;
  a11yTotalTimeMs?: number;
  a11yGestureTimeMs?: number;
}
