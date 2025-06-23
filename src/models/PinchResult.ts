import { ObserveResult } from "./ObserveResult";

export interface PinchResult {
  success: boolean;
  startingMagnitude: number;
  endingMagnitude: number;
  duration: number;
  observation?: ObserveResult;
  error?: string;
}
