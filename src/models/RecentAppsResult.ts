import { ObserveResult } from "./ObserveResult";

/**
 * Result of a recent apps navigation operation
 */
export interface RecentAppsResult {
    success: boolean;
    method: "gesture" | "legacy" | "hardware";
    observation?: ObserveResult;
    error?: string;
}
