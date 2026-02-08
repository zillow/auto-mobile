import type { Element } from "../../src/models/Element";
import type { ViewHierarchyNode, ViewHierarchyResult } from "../../src/models";
import type { ElementFinder } from "../../src/utils/interfaces/ElementFinder";

export class FakeElementFinder implements ElementFinder {
  nextElementsByText: Element[] = [];
  nextElementByText: Element | null = null;
  nextElementsByResourceId: Element[] = [];
  nextElementByResourceId: Element | null = null;
  nextContainerNode: ViewHierarchyNode | null = null;
  nextHasContainer: boolean = false;
  nextElementByIndex: { element: Element; text?: string } | null = null;
  nextScrollableElements: Element[] = [];
  nextScrollableContainer: Element | null = null;
  nextClickableElements: Element[] = [];
  nextChildElements: Element[] = [];
  nextSpannables: Element[] | null = null;
  nextFocusedTextInput: any = null;
  nextIsElementFocused: boolean = false;
  nextValidateElementText: boolean = true;

  lastFindByTextArgs?: { text: string; container?: any; partialMatch?: boolean; caseSensitive?: boolean };
  lastFindByResourceIdArgs?: { resourceId: string; container?: any; partialMatch?: boolean };

  findElementsByText(
    _viewHierarchy: ViewHierarchyResult,
    text: string,
    container?: { elementId?: string; text?: string } | null,
    partialMatch?: boolean,
    caseSensitive?: boolean
  ): Element[] {
    this.lastFindByTextArgs = { text, container, partialMatch, caseSensitive };
    return this.nextElementsByText;
  }

  findElementByText(
    _viewHierarchy: ViewHierarchyResult,
    text: string,
    container?: { elementId?: string; text?: string } | null,
    partialMatch?: boolean,
    caseSensitive?: boolean
  ): Element | null {
    this.lastFindByTextArgs = { text, container, partialMatch, caseSensitive };
    return this.nextElementByText;
  }

  findElementsByResourceId(
    _viewHierarchy: ViewHierarchyResult,
    resourceId: string,
    container?: { elementId?: string; text?: string } | null,
    partialMatch?: boolean
  ): Element[] {
    this.lastFindByResourceIdArgs = { resourceId, container, partialMatch };
    return this.nextElementsByResourceId;
  }

  findElementByResourceId(
    _viewHierarchy: ViewHierarchyResult,
    resourceId: string,
    container?: { elementId?: string; text?: string } | null,
    partialMatch?: boolean
  ): Element | null {
    this.lastFindByResourceIdArgs = { resourceId, container, partialMatch };
    return this.nextElementByResourceId;
  }

  findContainerNode(
    _viewHierarchy: ViewHierarchyResult,
    _container: { elementId?: string; text?: string }
  ): ViewHierarchyNode | null {
    return this.nextContainerNode;
  }

  hasContainerElement(
    _viewHierarchy: ViewHierarchyResult,
    _container?: { elementId?: string; text?: string }
  ): boolean {
    return this.nextHasContainer;
  }

  findElementByIndex(
    _viewHierarchy: ViewHierarchyResult,
    _index: number
  ): { element: Element; text?: string } | null {
    return this.nextElementByIndex;
  }

  findScrollableElements(_viewHierarchy: ViewHierarchyResult): Element[] {
    return this.nextScrollableElements;
  }

  findScrollableContainer(_viewHierarchy: ViewHierarchyResult): Element | null {
    return this.nextScrollableContainer;
  }

  findClickableElements(_viewHierarchy: ViewHierarchyResult): Element[] {
    return this.nextClickableElements;
  }

  findChildElements(_viewHierarchy: ViewHierarchyResult, _parentElement: Element): Element[] {
    return this.nextChildElements;
  }

  findSpannables(_element: Element): Element[] | null {
    return this.nextSpannables;
  }

  findFocusedTextInput(_viewHierarchy: any): any {
    return this.nextFocusedTextInput;
  }

  isElementFocused(_element: any): boolean {
    return this.nextIsElementFocused;
  }

  validateElementText(
    _foundElement: { element: Element; text?: string },
    _expectedText?: string
  ): boolean {
    return this.nextValidateElementText;
  }
}
