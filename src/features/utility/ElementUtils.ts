import { Element } from "../../models/Element";
import { Point } from "../../models/Point";
import { ElementBounds, ViewHierarchyNode, ViewHierarchyResult } from "../../models";
import { ElementFinder } from "./ElementFinder";
import { ElementGeometry } from "./ElementGeometry";
import { ElementParser } from "./ElementParser";
import { TextMatcher } from "./TextMatcher";

/**
 * Facade class for backward compatibility - delegates to specialized classes
 * @deprecated Use specific classes (ElementFinder, ElementGeometry, ElementParser, TextMatcher) instead
 */
export class ElementUtils {
  private finder: ElementFinder;
  private geometry: ElementGeometry;
  private parser: ElementParser;
  private textMatcher: TextMatcher;

  constructor() {
    this.finder = new ElementFinder();
    this.geometry = new ElementGeometry();
    this.parser = new ElementParser();
    this.textMatcher = new TextMatcher();
  }

  // ===== ElementGeometry methods =====

  getElementCenter(element: Element): Point {
    return this.geometry.getElementCenter(element);
  }

  isPointInElement(element: Element, x: number, y: number): boolean {
    return this.geometry.isPointInElement(element, x, y);
  }

  isElementVisible(element: Element, screenWidth: number, screenHeight: number): boolean {
    return this.geometry.isElementVisible(element, screenWidth, screenHeight);
  }

  getVisibleBounds(element: Element, screenWidth: number, screenHeight: number): Element["bounds"] | null {
    return this.geometry.getVisibleBounds(element, screenWidth, screenHeight);
  }

  getSwipeWithinBounds(
    direction: "up" | "down" | "left" | "right",
    bounds: ElementBounds
  ): { startX: number; startY: number; endX: number; endY: number } {
    return this.geometry.getSwipeWithinBounds(direction, bounds);
  }

  getSwipeDirectionForScroll(
    direction: "up" | "down" | "left" | "right"
  ): "up" | "down" | "left" | "right" {
    return this.geometry.getSwipeDirectionForScroll(direction);
  }

  getSwipeDurationFromSpeed(speed: "slow" | "fast" | "normal" = "normal"): number {
    return this.geometry.getSwipeDurationFromSpeed(speed);
  }

  // ===== TextMatcher methods =====

  fuzzyTextMatch(text1: string, text2: string, caseSensitive: boolean = false): boolean {
    return this.textMatcher.fuzzyTextMatch(text1, text2, caseSensitive);
  }

  createTextMatcher(text: string, fuzzyMatch: boolean = true, caseSensitive: boolean = false): (input?: string) => boolean {
    return this.textMatcher.createTextMatcher(text, fuzzyMatch, caseSensitive);
  }

  // ===== ElementParser methods =====

  parseBounds(boundsString: string): ElementBounds | null {
    return this.parser.parseBounds(boundsString);
  }

  extractNodeProperties(node: ViewHierarchyNode): any {
    return this.parser.extractNodeProperties(node);
  }

  parseNodeBounds(node: ViewHierarchyNode): Element | null {
    return this.parser.parseNodeBounds(node);
  }

  extractRootNodes(viewHierarchy: ViewHierarchyResult): ViewHierarchyNode[] {
    return this.parser.extractRootNodes(viewHierarchy);
  }

  traverseNode(node: any, callback: (node: any) => void): void {
    return this.parser.traverseNode(node, callback);
  }

  flattenViewHierarchy(viewHierarchy: ViewHierarchyResult): Array<{ element: Element; index: number; text?: string }> {
    return this.parser.flattenViewHierarchy(viewHierarchy, {
      includeWindows: true,
      windowOrder: "topmost-first"
    });
  }

  // ===== ElementFinder methods =====

  findElementByText(
    viewHierarchy: ViewHierarchyResult,
    text: string,
    container: { elementId?: string; text?: string } | null = null,
    fuzzyMatch: boolean = true,
    caseSensitive: boolean = false
  ): Element | null {
    return this.finder.findElementByText(viewHierarchy, text, container, fuzzyMatch, caseSensitive);
  }

  findElementByResourceId(
    viewHierarchy: ViewHierarchyResult,
    resourceId: string,
    container: { elementId?: string; text?: string } | null = null,
    partialMatch: boolean = false
  ): Element | null {
    return this.finder.findElementByResourceId(viewHierarchy, resourceId, container, partialMatch);
  }

  findContainerNode(
    viewHierarchy: ViewHierarchyResult,
    container: { elementId?: string; text?: string }
  ): ViewHierarchyNode | null {
    return this.finder.findContainerNode(viewHierarchy, container);
  }

  hasContainerElement(
    viewHierarchy: ViewHierarchyResult,
    container: { elementId?: string; text?: string }
  ): boolean {
    return this.finder.hasContainerElement(viewHierarchy, container);
  }

  findElementByIndex(viewHierarchy: ViewHierarchyResult, index: number): { element: Element; text?: string } | null {
    return this.finder.findElementByIndex(viewHierarchy, index);
  }

  findScrollableElements(viewHierarchy: ViewHierarchyResult): Element[] {
    return this.finder.findScrollableElements(viewHierarchy);
  }

  findClickableElements(viewHierarchy: ViewHierarchyResult): Element[] {
    return this.finder.findClickableElements(viewHierarchy);
  }

  findChildElements(viewHierarchy: ViewHierarchyResult, parentElement: Element): Element[] {
    return this.finder.findChildElements(viewHierarchy, parentElement);
  }

  findSpannables(element: Element): Element[] | null {
    return this.finder.findSpannables(element);
  }

  findFocusedTextInput(viewHierarchy: any): any {
    return this.finder.findFocusedTextInput(viewHierarchy);
  }

  isElementFocused(element: any): boolean {
    return this.finder.isElementFocused(element);
  }

  validateElementText(foundElement: { element: Element; text?: string }, expectedText?: string): boolean {
    return this.finder.validateElementText(foundElement, expectedText);
  }

  findScrollableContainer(viewHierarchy: ViewHierarchyResult): Element | null {
    return this.finder.findScrollableContainer(viewHierarchy);
  }
}
