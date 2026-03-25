import type { ElementSelectionResult } from "../../models/ElementSelectionResult";
import type { ViewHierarchyResult } from "../../models/ViewHierarchyResult";
import type { ElementSelectionStrategy } from "../../models/ElementSelectionStrategy";

export interface ElementSelector {
  selectByText(
    viewHierarchy: ViewHierarchyResult,
    text: string,
    options?: {
      container?: { elementId?: string; text?: string } | null;
      partialMatch?: boolean;
      caseSensitive?: boolean;
      strategy?: ElementSelectionStrategy;
    }
  ): ElementSelectionResult;

  selectByResourceId(
    viewHierarchy: ViewHierarchyResult,
    resourceId: string,
    options?: {
      container?: { elementId?: string; text?: string } | null;
      partialMatch?: boolean;
      strategy?: ElementSelectionStrategy;
    }
  ): ElementSelectionResult;

  /**
   * Select a clickable parent element that contains a descendant with matching text.
   * Useful for list items where the clickable row doesn't have a resource-id but
   * contains children with text.
   */
  selectClickableParentByText(
    viewHierarchy: ViewHierarchyResult,
    text: string,
    options?: {
      container?: { elementId?: string; text?: string } | null;
      fuzzyMatch?: boolean;
      caseSensitive?: boolean;
      strategy?: ElementSelectionStrategy;
    }
  ): ElementSelectionResult;

  /**
   * Select any clickable element. Use with strategy 'first' to tap the first
   * clickable item in a list without knowing its text or ID.
   */
  selectClickable(
    viewHierarchy: ViewHierarchyResult,
    options?: {
      container?: { elementId?: string; text?: string } | null;
      strategy?: ElementSelectionStrategy;
      scrollableContainer?: boolean;
    }
  ): ElementSelectionResult;

  /**
   * Select a clickable element that is a sibling of an element containing the specified text.
   * Useful for tapping checkboxes, icons, or buttons next to a specific text label.
   */
  selectClickableSiblingOfText(
    viewHierarchy: ViewHierarchyResult,
    text: string,
    options?: {
      container?: { elementId?: string; text?: string } | null;
      fuzzyMatch?: boolean;
      caseSensitive?: boolean;
      strategy?: ElementSelectionStrategy;
    }
  ): ElementSelectionResult;
}
