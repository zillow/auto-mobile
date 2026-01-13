import type { Element } from "../../src/models/Element";
import type { ViewHierarchyResult } from "../../src/models/ViewHierarchyResult";
import type { ElementSelectionStrategy } from "../../src/models/ElementSelectionStrategy";
import type { ElementSelector } from "../../src/utils/interfaces/ElementSelector";

export class FakeElementSelector implements ElementSelector {
  lastStrategy?: ElementSelectionStrategy;
  lastText?: string;
  lastResourceId?: string;
  nextElement: Element | null;

  constructor(nextElement: Element | null = null) {
    this.nextElement = nextElement;
  }

  setNextElement(element: Element | null): void {
    this.nextElement = element;
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
    void viewHierarchy;
    this.lastStrategy = options?.strategy;
    this.lastText = text;
    return this.nextElement;
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
    void viewHierarchy;
    this.lastStrategy = options?.strategy;
    this.lastResourceId = resourceId;
    return this.nextElement;
  }
}
