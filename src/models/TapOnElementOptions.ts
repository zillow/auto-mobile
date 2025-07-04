/**
 * Options for tapping on an element
 */
export interface TapOnElementOptions {
  // Element selection - one of these must be provided
  text?: SearchForTextArgs;
  elementId?: SearchForIdArgs;

  // Container to restrict search
  containerElementId: string;

  // Action to perform
  action: "tap" | "doubleTap" | "longPress" | "focus";
}

export interface SearchForIdArgs {
  id: string;
}

export interface SearchForTextArgs {
  text: string;
  fuzzyMatch: boolean;
  caseSensitive: boolean;
}
