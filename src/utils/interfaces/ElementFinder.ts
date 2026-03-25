import type { Element } from "../../models/Element";
import type { ViewHierarchyNode, ViewHierarchyResult } from "../../models";

export interface ElementFinder {
  findElementsByText(
    viewHierarchy: ViewHierarchyResult,
    text: string,
    container?: { elementId?: string; text?: string } | null,
    partialMatch?: boolean,
    caseSensitive?: boolean
  ): Element[];

  findElementByText(
    viewHierarchy: ViewHierarchyResult,
    text: string,
    container?: { elementId?: string; text?: string } | null,
    partialMatch?: boolean,
    caseSensitive?: boolean
  ): Element | null;

  findElementsByResourceId(
    viewHierarchy: ViewHierarchyResult,
    resourceId: string,
    container?: { elementId?: string; text?: string } | null,
    partialMatch?: boolean
  ): Element[];

  findElementByResourceId(
    viewHierarchy: ViewHierarchyResult,
    resourceId: string,
    container?: { elementId?: string; text?: string } | null,
    partialMatch?: boolean
  ): Element | null;

  findContainerNode(
    viewHierarchy: ViewHierarchyResult,
    container: { elementId?: string; text?: string }
  ): ViewHierarchyNode | null;

  hasContainerElement(
    viewHierarchy: ViewHierarchyResult,
    container?: { elementId?: string; text?: string }
  ): boolean;

  findElementByIndex(
    viewHierarchy: ViewHierarchyResult,
    index: number
  ): { element: Element; text?: string } | null;

  findScrollableElements(viewHierarchy: ViewHierarchyResult): Element[];

  findScrollableContainer(viewHierarchy: ViewHierarchyResult): Element | null;

  findClickableElements(viewHierarchy: ViewHierarchyResult): Element[];

  findClickableElementsInContainer(
    viewHierarchy: ViewHierarchyResult,
    container: { elementId?: string; text?: string } | null,
    scrollableContainer: boolean
  ): Element[];

  findClickableParentsContainingText(
    viewHierarchy: ViewHierarchyResult,
    text: string,
    container: { elementId?: string; text?: string } | null,
    fuzzyMatch: boolean,
    caseSensitive: boolean
  ): Element[];

  findClickableSiblingsOfText(
    viewHierarchy: ViewHierarchyResult,
    text: string,
    container: { elementId?: string; text?: string } | null,
    fuzzyMatch: boolean,
    caseSensitive: boolean
  ): Element[];

  findChildElements(viewHierarchy: ViewHierarchyResult, parentElement: Element): Element[];

  findSpannables(element: Element): Element[] | null;

  findFocusedTextInput(viewHierarchy: any): any;

  isElementFocused(element: any): boolean;

  validateElementText(
    foundElement: { element: Element; text?: string },
    expectedText?: string
  ): boolean;
}
