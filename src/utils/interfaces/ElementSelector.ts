import type { Element } from "../../models/Element";
import type { ViewHierarchyResult } from "../../models/ViewHierarchyResult";
import type { ElementSelectionStrategy } from "../../models/ElementSelectionStrategy";

export interface ElementSelector {
  selectByText(
    viewHierarchy: ViewHierarchyResult,
    text: string,
    options?: {
      container?: { elementId?: string; text?: string } | null;
      fuzzyMatch?: boolean;
      caseSensitive?: boolean;
      strategy?: ElementSelectionStrategy;
    }
  ): Element | null;

  selectByResourceId(
    viewHierarchy: ViewHierarchyResult,
    resourceId: string,
    options?: {
      container?: { elementId?: string; text?: string } | null;
      partialMatch?: boolean;
      strategy?: ElementSelectionStrategy;
    }
  ): Element | null;
}
