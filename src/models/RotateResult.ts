import { ObserveResult } from "./ObserveResult";

/**
 * Result of a rotate operation
 */
export interface RotateResult {
  success: boolean;
  orientation: string;
  value: number;
  observation?: ObserveResult;
  error?: string;

  // Enhanced fields for intelligent rotation
  currentOrientation?: string;
  previousOrientation?: string;
  rotationPerformed?: boolean;
  orientationLockHandled?: boolean;
  message?: string;
}
