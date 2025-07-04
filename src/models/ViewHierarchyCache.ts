import { ViewHierarchyResult } from "./ViewHierarchyResult";

/**
 * Represents a cached view hierarchy entry
 */
export interface ViewHierarchyCache {
  timestamp: number;
  activityHash: string;
  viewHierarchy: ViewHierarchyResult;
}
