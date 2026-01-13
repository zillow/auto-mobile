import type { Element } from "../../models/Element";
import type { ViewHierarchyResult } from "../../models/ViewHierarchyResult";
import type { ElementSelectionStrategy } from "../../models/ElementSelectionStrategy";
import type { ElementSelector } from "../../utils/interfaces/ElementSelector";
import { ElementFinder } from "./ElementFinder";

export class DefaultElementSelector implements ElementSelector {
  private finder: ElementFinder;
  private random: () => number;

  constructor(
    finder: ElementFinder = new ElementFinder(),
    random: () => number = Math.random
  ) {
    this.finder = finder;
    this.random = random;
  }

  selectByText(
    viewHierarchy: ViewHierarchyResult,
    text: string,
    options?: {
      container?: { elementId?: string; text?: string } | null;
      fuzzyMatch?: boolean;
      caseSensitive?: boolean;
      strategy?: ElementSelectionStrategy;
    }
  ): Element | null {
    const matches = this.finder.findElementsByText(
      viewHierarchy,
      text,
      options?.container ?? null,
      options?.fuzzyMatch ?? true,
      options?.caseSensitive ?? false
    );
    return this.pickMatch(matches, options?.strategy ?? "first");
  }

  selectByResourceId(
    viewHierarchy: ViewHierarchyResult,
    resourceId: string,
    options?: {
      container?: { elementId?: string; text?: string } | null;
      partialMatch?: boolean;
      strategy?: ElementSelectionStrategy;
    }
  ): Element | null {
    const matches = this.finder.findElementsByResourceId(
      viewHierarchy,
      resourceId,
      options?.container ?? null,
      options?.partialMatch ?? false
    );
    return this.pickMatch(matches, options?.strategy ?? "first");
  }

  private pickMatch(matches: Element[], strategy: ElementSelectionStrategy): Element | null {
    if (matches.length === 0) {
      return null;
    }

    if (strategy === "random") {
      const rawIndex = Math.floor(this.random() * matches.length);
      const safeIndex = Number.isFinite(rawIndex)
        ? Math.min(matches.length - 1, Math.max(0, rawIndex))
        : 0;
      return matches[safeIndex];
    }

    return matches[0];
  }
}
