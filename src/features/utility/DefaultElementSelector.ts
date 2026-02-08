import type { Element } from "../../models/Element";
import type { ElementSelectionResult } from "../../models/ElementSelectionResult";
import type { ViewHierarchyResult } from "../../models/ViewHierarchyResult";
import type { ElementSelectionStrategy } from "../../models/ElementSelectionStrategy";
import type { ElementSelector } from "../../utils/interfaces/ElementSelector";
import type { ElementFinder } from "../../utils/interfaces/ElementFinder";
import { DefaultElementFinder } from "./ElementFinder";

export class DefaultElementSelector implements ElementSelector {
  private finder: ElementFinder;
  private random: () => number;

  constructor(
    finder: ElementFinder = new DefaultElementFinder(),
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
      partialMatch?: boolean;
      caseSensitive?: boolean;
      strategy?: ElementSelectionStrategy;
    }
  ): ElementSelectionResult {
    const strategy = options?.strategy ?? "first";
    const matches = this.finder.findElementsByText(
      viewHierarchy,
      text,
      options?.container ?? null,
      options?.partialMatch ?? true,
      options?.caseSensitive ?? false
    );
    return this.pickMatch(matches, strategy);
  }

  selectByResourceId(
    viewHierarchy: ViewHierarchyResult,
    resourceId: string,
    options?: {
      container?: { elementId?: string; text?: string } | null;
      partialMatch?: boolean;
      strategy?: ElementSelectionStrategy;
    }
  ): ElementSelectionResult {
    const strategy = options?.strategy ?? "first";
    const matches = this.finder.findElementsByResourceId(
      viewHierarchy,
      resourceId,
      options?.container ?? null,
      options?.partialMatch ?? false
    );
    return this.pickMatch(matches, strategy);
  }

  private pickMatch(matches: Element[], strategy: ElementSelectionStrategy): ElementSelectionResult {
    const totalMatches = matches.length;
    if (totalMatches === 0) {
      return { element: null, indexInMatches: -1, totalMatches: 0, strategy };
    }

    let indexInMatches = 0;
    if (strategy === "random") {
      const rawIndex = Math.floor(this.random() * totalMatches);
      indexInMatches = Number.isFinite(rawIndex)
        ? Math.min(totalMatches - 1, Math.max(0, rawIndex))
        : 0;
    }

    return { element: matches[indexInMatches], indexInMatches, totalMatches, strategy };
  }
}
