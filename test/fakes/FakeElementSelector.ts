import type { Element } from "../../src/models/Element";
import type { ElementSelectionResult } from "../../src/models/ElementSelectionResult";
import type { ViewHierarchyResult } from "../../src/models/ViewHierarchyResult";
import type { ElementSelectionStrategy } from "../../src/models/ElementSelectionStrategy";
import type { ElementSelector } from "../../src/utils/interfaces/ElementSelector";

export class FakeElementSelector implements ElementSelector {
  lastStrategy?: ElementSelectionStrategy;
  lastText?: string;
  lastResourceId?: string;
  nextElement: Element | null;
  nextIndexInMatches?: number;
  nextTotalMatches?: number;

  constructor(nextElement: Element | null = null) {
    this.nextElement = nextElement;
  }

  setNextElement(element: Element | null): void {
    this.nextElement = element;
  }

  setNextSelection(selection: { element: Element | null; indexInMatches?: number; totalMatches?: number }): void {
    this.nextElement = selection.element;
    this.nextIndexInMatches = selection.indexInMatches;
    this.nextTotalMatches = selection.totalMatches;
  }

  private buildSelectionResult(strategy: ElementSelectionStrategy | undefined): ElementSelectionResult {
    const element = this.nextElement;
    const totalMatches = typeof this.nextTotalMatches === "number"
      ? this.nextTotalMatches
      : (element ? 1 : 0);
    const indexInMatches = typeof this.nextIndexInMatches === "number"
      ? this.nextIndexInMatches
      : (element ? 0 : -1);
    return {
      element,
      indexInMatches,
      totalMatches,
      strategy: strategy ?? "first"
    };
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
    void viewHierarchy;
    this.lastStrategy = options?.strategy;
    this.lastText = text;
    return this.buildSelectionResult(options?.strategy);
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
    void viewHierarchy;
    this.lastStrategy = options?.strategy;
    this.lastResourceId = resourceId;
    return this.buildSelectionResult(options?.strategy);
  }
}
