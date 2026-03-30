/**
 * Options for tapping on an element
 */
import type { ElementSelectionStrategy } from "./ElementSelectionStrategy";

export interface TapOnElementOptions {
  // Element selection - one of these must be provided
  text?: string;
  elementId?: string;
  // Selection strategy when multiple elements match (default: first)
  selectionStrategy?: ElementSelectionStrategy;

  // Container to restrict search
  container?: {
    elementId?: string;
    text?: string;
  };

  // Action to perform
  action: "tap" | "doubleTap" | "longPress" | "focus";

  // Optional polling before tap to wait for element to appear
  searchUntil?: {
    duration?: number;
  };

  // Optional duration for long press actions (milliseconds)
  duration?: number;

  // Optional flag to set accessibility focus before performing action (TalkBack mode)
  // If not specified, will be determined automatically based on TalkBack state
  focusFirst?: boolean;

  // Optional flag to tap the nearest clickable parent that contains the text element.
  // Useful for list items where the clickable row doesn't have a resource-id but
  // contains children with text. Only works with text selection (not elementId).
  tapClickableParent?: boolean;

  // Select any clickable element. Use with selectionStrategy: 'first' to tap
  // the first clickable item in a list without knowing its text or ID.
  clickable?: boolean;

  // Only search within scrollable containers (lists/RecyclerViews).
  // Use this to avoid tapping search bars or other clickable UI elements
  // when you want the first list item.
  scrollableContainer?: boolean;

  // Find a clickable element that is a sibling of an element containing this text.
  // Useful for tapping checkboxes, icons, or buttons next to a specific text label.
  siblingOfText?: string;
}
