import { ObserveResult } from "./ObserveResult";

/**
 * Result of a press button operation
 */
export interface PressButtonResult {
  success: boolean;
  button: string;
  keyCode: number;
  observation?: ObserveResult;
  error?: string;
}
