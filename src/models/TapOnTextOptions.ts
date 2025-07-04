/**
 * Options for tapping on text
 */
export interface TapOnTextOptions {
  text: string;
  containerElementId: string;
  fuzzyMatch?: boolean;
  caseSensitive?: boolean;
  action: "tap" | "doubleTap" | "longPress" | "focus";
}
