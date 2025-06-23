import { ObserveResult } from "./ObserveResult";

/**
 * Result of a shake operation
 */
export interface ShakeResult {
    success: boolean;
    duration: number;
    intensity: number;
    observation?: ObserveResult;
    error?: string;
}
