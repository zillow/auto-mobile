/**
 * Options for tapping on an element
 */
export interface ViewHierarchyQueryOptions {
  // Element selection - one of these must be provided
  text?: string;
  elementId?: string;

  // Container to restrict search
  containerElementId?: string;

  // XPath to restrict search
  xpath?: string;
}

/**
 * Context for validating view hierarchy file timestamps
 */
export interface ViewHierarchyTimestampContext {
  /** When action execution began */
  actionStartTime: number;

  /** When stability window began (if UI settling occurred) */
  stabilityStartTime?: number;

  /** When UI became stable */
  stabilityEndTime?: number;

  /** Minimum acceptable file timestamp */
  minRequiredTimestamp: number;
}
