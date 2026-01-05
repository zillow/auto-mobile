import { ObserveResult } from "./ObserveResult";

export interface DragAndDropResult {
  success: boolean;
  duration: number;
  distance: number;
  observation?: ObserveResult;
  error?: string;
  a11yTotalTimeMs?: number;
  a11yGestureTimeMs?: number;
}
