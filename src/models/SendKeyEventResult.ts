import { ObserveResult } from "./ObserveResult";

/**
 * Result of a send key event operation
 */
export interface SendKeyEventResult {
  success: boolean;
  keyCode: number | string;
  observation?: ObserveResult;
  error?: string;
}
