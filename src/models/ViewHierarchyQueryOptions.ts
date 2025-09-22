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
